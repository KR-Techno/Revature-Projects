-- overdue_rules.sql
-- A customer with ANY overdue payment can't change coverage or cancel a policy until they pay.
-- Run the three blocks one at a time (they replace the existing procedures).
-- Uses the existing error number 50024 (shows as 409 Conflict).

-- block 1: cancel_Policy
create or alter procedure cancel_Policy
(
    @customerID int,
    @policyID   int
)
as
begin
    set nocount on;

    begin try
        if exists (select 1
                   from Claim c
                   join Policy p on p.policyID = c.policyID
                   where c.policyID = @policyID
                     and p.customerID = @customerID
                     and c.claimStatus in ('Submitted', 'Under Review'))
            throw 50023, 'cannot cancel: this policy has an open claim.', 1;

        -- a customer with an overdue payment (on any policy) must pay before cancelling
        if exists (select 1
                   from Payment pay
                   join Policy py on py.policyID = pay.policyID
                   where py.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < dbo.businessToday())
            throw 50024, 'cannot cancel: you have an overdue payment. pay it first.', 1;

        update Policy
        set policyStatus = 'Cancelled'
        where policyID = @policyID
          and customerID = @customerID
          and policyStatus in ('Pending', 'Active');

        if @@rowcount = 0
            throw 50022, 'policy not found, or it can no longer be cancelled.', 1;
    end try
    begin catch
        throw;
    end catch
end
go

-- block 2: update_PolicyCoverage
create or alter procedure update_PolicyCoverage
(
    @customerID         int,
    @policyID           int,
    @newCoverageLevelID int,
    @newCoverageAmount  decimal(12, 2)
)
as
begin
    set nocount on;

    begin try
        begin transaction;

        declare @dob date, @typeID int, @oldLevel int, @oldAmount decimal(12, 2), @plan nvarchar(10);
        declare @newPremium decimal(10, 2);

        select @dob = c.customerDOB,
               @typeID = p.policyTypeID,
               @oldLevel = p.coverageLevelID,
               @oldAmount = p.coverageAmount,
               @plan = p.paymentPlan
        from Policy p
        join Customer c on c.customerID = p.customerID
        where p.policyID = @policyID
          and p.customerID = @customerID
          and p.policyStatus = 'Active'
          and c.isActive = 1;

        if @typeID is null
            throw 50026, 'policy not found, or it can no longer be changed.', 1;

        -- a customer with an overdue payment (on any policy) must pay before changing coverage
        if exists (select 1
                   from Payment pay
                   join Policy py on py.policyID = pay.policyID
                   where py.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < dbo.businessToday())
            throw 50024, 'you have an overdue payment. please pay it before changing your coverage.', 1;

        if @plan = 'Yearly' and exists (select 1 from Payment where policyID = @policyID and paymentStatus = 'Paid')
            throw 50056, 'this policy was paid in full for the year, so its coverage can''t be changed until it renews.', 1;

        if @oldLevel = @newCoverageLevelID and @oldAmount = @newCoverageAmount
            throw 50027, 'nothing to change: pick a different coverage level or amount.', 1;

        set @newPremium = dbo.calculatePremium(@typeID, @newCoverageLevelID, @newCoverageAmount, @dob);

        if @newPremium is null
            throw 50021, 'invalid coverage level, or coverage amount is outside the allowed range.', 1;

        update Policy
        set coverageLevelID = @newCoverageLevelID,
            coverageAmount = @newCoverageAmount,
            monthlyPremium = @newPremium
        where policyID = @policyID;

        update Payment
        set amount = case when @plan = 'Yearly' then dbo.yearlyPaymentTotal(@newPremium) else @newPremium end
        where policyID = @policyID and paymentStatus = 'Pending';

        commit transaction;

        select p.policyID, p.coverageLevelID, cl.levelName, p.coverageAmount, p.monthlyPremium
        from Policy p
        join CoverageLevel cl on cl.coverageLevelID = p.coverageLevelID
        where p.policyID = @policyID;
    end try
    begin catch
        if @@trancount > 0 rollback transaction;
        throw;
    end catch
end
go

-- block 3: get_CustomerPolicies (adds hasOverduePayment so the screen can grey out the buttons)
create or alter procedure get_CustomerPolicies
(
    @customerID int
)
as
begin
    set nocount on;

    select p.policyID,
           p.policyTypeID,
           pt.typeName,
           p.coverageLevelID,
           cl.levelName,
           p.coverageAmount,
           p.monthlyPremium,
           p.startDate,
           p.endDate,
           p.policyStatus,
           case when p.policyStatus = 'Active' and p.endDate < dbo.businessToday()
                then 'Expired'
                else p.policyStatus end as displayStatus,
           p.paymentPlan,
           isnull(bal.paidSoFar, 0) as paidSoFar,
           isnull(bal.remaining, 0) as remainingBalance,
           isnull(bal.paidSoFar, 0) + isnull(bal.remaining, 0) as policyTotal,
           bal.nextDue as nextDueDate,
           -- same value on every row: the screen uses it to grey out Change coverage and Cancel
           cast(case when exists (select 1
                   from Payment pay
                   join Policy py on py.policyID = pay.policyID
                   where py.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < dbo.businessToday()) then 1 else 0 end as bit) as hasOverduePayment
    from Policy p
    join PolicyType pt on pt.policyTypeID = p.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = p.coverageLevelID
    outer apply (select sum(case when pay.paymentStatus = 'Paid' then pay.amount end)    as paidSoFar,
                        sum(case when pay.paymentStatus = 'Pending' then pay.amount end) as remaining,
                        min(case when pay.paymentStatus = 'Pending' then pay.dueDate end) as nextDue
                 from Payment pay
                 where pay.policyID = p.policyID) bal
    where p.customerID = @customerID
    order by p.startDate desc;
end
go

-- admin_product_customers.sql
-- Admin sees how many customers hold each product, and can open the list of those customers.
-- Run the two blocks one at a time.

-- block 1: one row per product with its number of customers
-- "customers" counts people with a current (Pending or Active, not past its end date) policy of that product
create or alter procedure admin_GetProductSummary
as
begin
    set nocount on;

    declare @today date = dbo.businessToday();

    select pt.policyTypeID,
           pt.typeName,
           (select string_agg(cl.levelName, ', ') within group (order by cl.sortOrder)
              from CoverageLevel cl where cl.policyTypeID = pt.policyTypeID) as levels,
           (select count(distinct p.customerID) from Policy p
             where p.policyTypeID = pt.policyTypeID
               and p.policyStatus in ('Pending', 'Active') and p.endDate >= @today) as customers
    from PolicyType pt
    order by pt.typeName;
end
go


-- block 2: the customers (with their policy details) under one product
create or alter procedure admin_GetProductCustomers
(
    @policyTypeID int
)
as
begin
    set nocount on;

    declare @today date = dbo.businessToday();

    select c.customerID, c.firstName, c.lastName, c.customerDOB, c.customerEmail, c.customerPhone, c.isActive,
           p.policyID, cl.levelName, p.coverageAmount, p.monthlyPremium, p.paymentPlan, p.startDate, p.endDate,
           (select count(*) from Payment pay
             where pay.policyID = p.policyID and pay.paymentStatus = 'Pending' and pay.dueDate < @today) as overduePayments
    from Policy p
    join Customer c on c.customerID = p.customerID
    join CoverageLevel cl on cl.coverageLevelID = p.coverageLevelID
    where p.policyTypeID = @policyTypeID
      and p.policyStatus in ('Pending', 'Active') and p.endDate >= @today
    order by c.lastName, c.firstName;
end
go