alter table Customer add [role] nvarchar(10) not null
    constraint df_Customer_role default 'Customer';
go
alter table Customer add constraint ck_Customer_role check ([role] in ('Customer', 'Admin'));
go

create unique nonclustered index ux_Customer_oneAdmin on Customer ([role]) where [role] = 'Admin';
go

create or alter procedure get_CustomerLogin
(
    @customerEmail nvarchar(254)
)
as
begin
    set nocount on;
 
    select customerID, customerEmail, passwordHash, isActive, [role]
    from Customer
    where customerEmail = @customerEmail;
end
go


create or alter procedure admin_GetCustomers
as
begin
    set nocount on;
 
    select c.customerID, c.firstName, c.lastName, c.customerDOB, c.customerEmail, c.customerPhone, c.isActive,
           (select count(*) from Policy p
             where p.customerID = c.customerID and p.policyStatus in ('Pending', 'Active')) as activePolicies,
           (select count(*) from Claim cl
             join Policy p on p.policyID = cl.policyID
             where p.customerID = c.customerID and cl.claimStatus in ('Submitted', 'Under Review')) as openClaims
    from Customer c
    where c.[role] = 'Customer'
    order by c.lastName, c.firstName;
end
go


create or alter procedure admin_UpdateCustomer
(
    @customerID  int,
    @firstName   nvarchar(50),
    @lastName    nvarchar(50),
    @customerDOB date
)
as
begin
    set nocount on;
 
    begin try
        set @firstName = dbo.fn_ProperCase(@firstName);
        set @lastName  = dbo.fn_ProperCase(@lastName);
 
        -- same name rules as the table, checked here so the admin gets a clear message
        if len(isnull(@firstName, '')) = 0 or len(isnull(@lastName, '')) = 0
           or @firstName like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%' or @firstName like '%[[]%' or @firstName like '%]%'
           or @lastName  like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%' or @lastName  like '%[[]%' or @lastName  like '%]%'
            throw 50052, 'names cannot be empty or contain numbers or symbols.', 1;
 
        if @customerDOB > dateadd(year, -18, dbo.businessToday())
            throw 50003, 'customers must be at least 18 years old.', 1;
 
        update Customer
        set firstName = @firstName,
            lastName = @lastName,
            customerDOB = @customerDOB
        where customerID = @customerID
          and [role] = 'Customer';
 
        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;
 
        select customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, isActive
        from Customer
        where customerID = @customerID;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure admin_DeactivateCustomer
(
    @customerID int
)
as
begin
    set nocount on;
 
    begin try
        declare @today date = dbo.businessToday();
 
        if exists (select 1 from Customer where customerID = @customerID and [role] = 'Admin')
            throw 50049, 'the admin account cannot be deactivated.', 1;
 
        if exists (select 1 from Policy
                   where customerID = @customerID
                     and policyStatus in ('Pending', 'Active')
                     and endDate >= @today)
            throw 50010, 'cannot deactivate: this customer still has an active policy.', 1;
 
        if exists (select 1
                   from Claim c
                   join Policy p on p.policyID = c.policyID
                   where p.customerID = @customerID
                     and c.claimStatus in ('Submitted', 'Under Review'))
            throw 50011, 'cannot deactivate: this customer still has an open claim.', 1;
 
        if exists (select 1
                   from Payment pay
                   join Policy p on p.policyID = pay.policyID
                   where p.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < @today)
            throw 50012, 'cannot deactivate: this customer has an overdue payment.', 1;
 
        update Customer
        set isActive = 0
        where customerID = @customerID and isActive = 1 and [role] = 'Customer';
 
        if @@rowcount = 0
            throw 50002, 'customer not found or already deactivated.', 1;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure admin_GetClaims
as
begin
    set nocount on;
 
    select c.claimID, c.policyID, p.customerID,
           cu.firstName + ' ' + cu.lastName as customerName,
           pt.typeName, cl.levelName,
           c.incidentDate, c.submittedDate, c.claimDescription, c.claimAmount,
           c.claimStatus, c.approvedAmount, c.resolvedDate, c.decisionNote
    from Claim c
    join Policy p        on p.policyID = c.policyID
    join Customer cu     on cu.customerID = p.customerID
    join PolicyType pt   on pt.policyTypeID = p.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = p.coverageLevelID
    order by case when c.claimStatus in ('Submitted', 'Under Review') then 0 else 1 end,
             c.submittedDate desc;
end
go

create or alter procedure admin_DecideClaim
(
    @claimID        int,
    @decision       nvarchar(20),          -- 'Approved' or 'Denied'
    @approvedAmount decimal(12, 2) = null,
    @decisionNote   nvarchar(500)  = null
)
as
begin
    set nocount on;
 
    begin try
        declare @status nvarchar(20), @claimAmount decimal(12, 2);
 
        select @status = claimStatus, @claimAmount = claimAmount
        from Claim
        where claimID = @claimID;
 
        if @status is null
            throw 50045, 'claim not found.', 1;
 
        if @status not in ('Submitted', 'Under Review')
            throw 50046, 'this claim has already been decided or withdrawn.', 1;
 
        if @decision not in ('Approved', 'Denied')
            throw 50050, 'decision must be Approved or Denied.', 1;
 
        if @decision = 'Approved'
        begin
            if @approvedAmount is null
                throw 50047, 'an approved amount is required when accepting a claim.', 1;
            if @approvedAmount < 0 or @approvedAmount > @claimAmount
                throw 50051, 'the approved amount cannot be negative or more than the amount claimed.', 1;
        end
        else
        begin
            if @decisionNote is null or len(ltrim(rtrim(@decisionNote))) = 0
                throw 50048, 'a reason is required when rejecting a claim.', 1;
            set @approvedAmount = null;
        end
 
        update Claim
        set claimStatus = @decision,
            approvedAmount = @approvedAmount,
            decisionNote = nullif(ltrim(rtrim(@decisionNote)), ''),
            resolvedDate = dbo.businessToday()
        where claimID = @claimID;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure admin_CreatePolicyType
(
    @typeName      nvarchar(30),
    @baseRate      decimal(6, 4),
    @factorUnder25 decimal(4, 2),
    @factor25to64  decimal(4, 2),
    @factor65plus  decimal(4, 2),
    @levelsJson    nvarchar(max),
    @policyTypeID  int output
)
as
begin
    set nocount on;
 
    begin try
        set @typeName = ltrim(rtrim(@typeName));
 
        if len(isnull(@typeName, '')) = 0
            throw 50053, 'a product name is required (30 characters at most).', 1;
 
        if @baseRate <= 0 or @factorUnder25 <= 0 or @factor25to64 <= 0 or @factor65plus <= 0
            throw 50053, 'the base rate and all age factors must be above zero.', 1;
 
        if exists (select 1 from PolicyType where typeName = @typeName)
            throw 50054, 'a product with that name already exists.', 1;
 
        if isjson(@levelsJson) = 0
            throw 50055, 'coverage levels are missing or not valid.', 1;
 
        declare @levels table
        (
            sortOrder   tinyint,
            levelName   nvarchar(200),
            description nvarchar(1000),
            rateFactor  decimal(10, 2),
            minCoverage decimal(14, 2),
            maxCoverage decimal(14, 2)
        );
 
        insert into @levels (sortOrder, levelName, description, rateFactor, minCoverage, maxCoverage)
        select cast(j.[key] as int) + 1, x.levelName, x.description, x.rateFactor, x.minCoverage, x.maxCoverage
        from openjson(@levelsJson) as j
        cross apply openjson(j.value) with
        (
            levelName   nvarchar(200)  '$.levelName',
            description nvarchar(1000) '$.description',
            rateFactor  decimal(10, 2) '$.rateFactor',
            minCoverage decimal(14, 2) '$.minCoverage',
            maxCoverage decimal(14, 2) '$.maxCoverage'
        ) as x;
 
        if (select count(*) from @levels) not between 1 and 5
            throw 50055, 'a product needs between 1 and 5 coverage levels.', 1;
 
        if exists (select 1 from @levels
                   where len(isnull(levelName, '')) not between 1 and 40
                      or len(isnull(description, '')) not between 1 and 400
                      or isnull(rateFactor, 0) not between 0.01 and 9.99
                      or isnull(minCoverage, 0) <= 0
                      or isnull(maxCoverage, 0) < isnull(minCoverage, 0)
                      or maxCoverage > 999999999999)
            or exists (select levelName from @levels group by levelName having count(*) > 1)
            throw 50055, 'every coverage level needs a unique name (40 characters max), a description (400 max), a price factor from 0.01 to 9.99, and a valid min/max coverage.', 1;
 
        begin transaction;
 
        insert into PolicyType (typeName, baseRate, minCoverage, maxCoverage, factorUnder25, factor25to64, factor65plus)
        select @typeName, @baseRate, min(minCoverage), max(maxCoverage), @factorUnder25, @factor25to64, @factor65plus
        from @levels;
 
        set @policyTypeID = scope_identity();
 
        insert into CoverageLevel (policyTypeID, levelName, description, rateFactor, sortOrder, minCoverage, maxCoverage)
        select @policyTypeID, levelName, description, rateFactor, sortOrder, minCoverage, maxCoverage
        from @levels;
 
        commit transaction;
    end try
    begin catch
        if @@trancount > 0 rollback transaction;
        throw;
    end catch
end
go

-- step 1: flag on Customer (0 = normal, 1 = must pick a new password before doing anything else)
alter table Customer add mustChangePassword bit not null
    constraint df_Customer_mustChangePassword default 0;
go

-- step 2: login lookup also returns the flag (it goes into the token)
create or alter procedure get_CustomerLogin
(
    @customerEmail nvarchar(254)
)
as
begin
    set nocount on;
 
    select customerID, customerEmail, passwordHash, isActive, [role], mustChangePassword
    from Customer
    where customerEmail = @customerEmail;
end
go
 
-- step 3: a normal password change clears the flag
create or alter procedure customer_ChangePassword
(
    @customerID   int,
    @passwordHash nvarchar(255)
)
as
begin
    set nocount on;
 
    begin try
        update Customer
        set passwordHash = @passwordHash,
            mustChangePassword = 0
        where customerID = @customerID;
 
        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure admin_ResetCustomerPassword
(
    @customerID   int,
    @passwordHash nvarchar(255)
)
as
begin
    set nocount on;
 
    begin try
        update Customer
        set passwordHash = @passwordHash,
            mustChangePassword = 1
        where customerID = @customerID
          and [role] = 'Customer';
 
        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;
    end try
    begin catch
        throw;
    end catch
end
go
 

-- step 9: make YOUR admin account (run once, by hand, after you have registered it in the app).
-- change the email, then run. This is the only way to create an admin.
-- ------------------------------------------------------------
-- update Customer set [role] = 'Admin' where customerEmail = 'your-admin-email@example.com';
-- nselect customerID, customerEmail, [role] from Customer where [role] = 'Admin';

-- re-run this one procedure (it now calls your dbo.ProperCase function)
create or alter procedure admin_UpdateCustomer
(
    @customerID  int,
    @firstName   nvarchar(50),
    @lastName    nvarchar(50),
    @customerDOB date
)
as
begin
    set nocount on;

    begin try
        set @firstName = dbo.ProperCase(@firstName);
        set @lastName  = dbo.ProperCase(@lastName);

        -- same name rules as the table, checked here so the admin gets a clear message
        if len(isnull(@firstName, '')) = 0 or len(isnull(@lastName, '')) = 0
           or @firstName like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%' or @firstName like '%[[]%' or @firstName like '%]%'
           or @lastName  like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%' or @lastName  like '%[[]%' or @lastName  like '%]%'
            throw 50052, 'names cannot be empty or contain numbers or symbols.', 1;

        if @customerDOB > dateadd(year, -18, dbo.businessToday())
            throw 50003, 'customers must be at least 18 years old.', 1;

        update Customer
        set firstName = @firstName,
            lastName = @lastName,
            customerDOB = @customerDOB
        where customerID = @customerID
          and [role] = 'Customer';

        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;

        select customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, isActive
        from Customer
        where customerID = @customerID;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure admin_GetPayments
as
begin
    set nocount on;
 
    declare @today date = dbo.businessToday();
 
    select pay.paymentID,
           pay.policyID,
           p.customerID,
           cu.firstName + ' ' + cu.lastName as customerName,
           cu.customerEmail,
           cu.customerPhone,
           pt.typeName,
           cl.levelName,
           pay.dueDate,
           pay.amount,
           fee.lateFee,
           pay.amount + fee.lateFee as totalAmount,
           pay.paidDate,
           pay.paymentStatus,
           case when pay.paymentStatus = 'Pending' and pay.dueDate < @today
                then 'Overdue'
                else pay.paymentStatus end as displayStatus,
           case when pay.paymentStatus = 'Pending' and pay.dueDate < @today
                then datediff(day, pay.dueDate, @today)
                else 0 end as daysOverdue
    from Payment pay
    join Policy p          on p.policyID = pay.policyID
    join Customer cu       on cu.customerID = p.customerID
    join PolicyType pt     on pt.policyTypeID = p.policyTypeID
    join CoverageLevel cl  on cl.coverageLevelID = p.coverageLevelID
    cross apply (select case when pay.paymentStatus = 'Pending'
                             then dbo.calculateLateFee(pay.dueDate, pay.amount, @today)
                             else pay.lateFee end as lateFee) fee
    order by case when pay.paymentStatus = 'Pending' and pay.dueDate < @today then 0 else 1 end,
             case when pay.paymentStatus = 'Pending' and pay.dueDate < @today
                  then datediff(day, pay.dueDate, @today) else 0 end desc,
             pay.dueDate desc, pay.paymentID;
end
go
 
 
-- step 2: the customers list also counts each customer's overdue payments
create or alter procedure admin_GetCustomers
as
begin
    set nocount on;
 
    declare @today date = dbo.businessToday();
 
    select c.customerID, c.firstName, c.lastName, c.customerDOB, c.customerEmail, c.customerPhone, c.isActive,
           (select count(*) from Policy p
             where p.customerID = c.customerID and p.policyStatus in ('Pending', 'Active')) as activePolicies,
           (select count(*) from Claim cl
             join Policy p on p.policyID = cl.policyID
             where p.customerID = c.customerID and cl.claimStatus in ('Submitted', 'Under Review')) as openClaims,
           (select count(*) from Payment pay
             join Policy p on p.policyID = pay.policyID
             where p.customerID = c.customerID and pay.paymentStatus = 'Pending' and pay.dueDate < @today) as overduePayments
    from Customer c
    where c.[role] = 'Customer'
    order by c.lastName, c.firstName;
end
go
 
alter table Policy add paymentPlan nvarchar(10) not null
    constraint df_Policy_paymentPlan default 'Monthly';
alter table Policy add constraint ck_Policy_paymentPlan check (paymentPlan in ('Monthly', 'Yearly'));
go
 
create or alter function dbo.yearlyPaymentTotal (@monthlyPremium decimal(10, 2))
returns decimal(10, 2)
as
begin
    return round(@monthlyPremium * 12 * 0.95, 2);   -- 12 months, minus 5%
end
go


 create or alter trigger createPayments
on Policy
after insert
as
begin
    set nocount on;
 
    declare @newPayments table
    (
        rowNum   int identity(1, 1),
        policyID int,
        dueDate  date,
        amount   decimal(10, 2)
    );
 
    -- Monthly: 12 rows (month 0 to 11). Yearly: only month 0, for the discounted yearly total.
    insert into @newPayments (policyID, dueDate, amount)
    select i.policyID,
           dateadd(month, n.number, i.startDate),
           case when i.paymentPlan = 'Yearly' then dbo.yearlyPaymentTotal(i.monthlyPremium) else i.monthlyPremium end
    from inserted i
    cross join (values (0), (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11)) as n(number)
    where i.paymentPlan = 'Monthly' or n.number = 0;
 
    declare @rowNum int = 1;
    declare @rowCount int = (select count(*) from @newPayments);
    declare @newID int;
 
    while @rowNum <= @rowCount
    begin
        -- random payment number (1800000000 - 2147483647), re-roll if already used
        set @newID = abs(checksum(newid()) % 347483648) + 1800000000;
 
        while exists (select 1 from Payment where paymentID = @newID)
            set @newID = abs(checksum(newid()) % 347483648) + 1800000000;
 
        insert into Payment (paymentID, policyID, dueDate, amount)
        select @newID, policyID, dueDate, amount
        from @newPayments
        where rowNum = @rowNum;
 
        set @rowNum += 1;
    end
end
go

create or alter procedure get_quotePolicy
(
    @customerID      int,
    @policyTypeID    int,
    @coverageLevelID int,
    @coverageAmount  decimal(12, 2)
)
as
begin
    set nocount on;
 
    begin try
        declare @dob date;
        declare @monthlyPremium decimal(10, 2);
 
        select @dob = customerDOB
        from Customer
        where customerID = @customerID and isActive = 1;
 
        if @dob is null
            throw 50020, 'customer not found or account is deactivated.', 1;
 
        set @monthlyPremium = dbo.calculatePremium(@policyTypeID, @coverageLevelID, @coverageAmount, @dob);
 
        if @monthlyPremium is null
            throw 50021, 'invalid policy, coverage level, or coverage amount is outside the allowed range.', 1;
 
        select pt.typeName,
               cl.levelName,
               @coverageAmount as coverageAmount,
               @monthlyPremium as monthlyPremium,
               cast(@monthlyPremium * 12 as decimal(12, 2)) as yearlyTotal,                    -- 12 monthly payments added up
               cast(dbo.yearlyPaymentTotal(@monthlyPremium) as decimal(12, 2)) as yearlyDiscountedTotal   -- the one-time yearly price
        from PolicyType pt
        join CoverageLevel cl on cl.policyTypeID = pt.policyTypeID
        where pt.policyTypeID = @policyTypeID
          and cl.coverageLevelID = @coverageLevelID;
    end try
    begin catch
        throw;
    end catch
end
go

create or alter procedure create_Policy
(
    @customerID      int,
    @policyTypeID    int,
    @coverageLevelID int,
    @coverageAmount  decimal(12, 2),
    @paymentPlan     nvarchar(10),
    @policyID        int output
)
as
begin
    set nocount on;
 
    begin try
        declare @dob date;
        declare @monthlyPremium decimal(10, 2);
        declare @startDate date = dbo.businessToday();
 
        if @paymentPlan not in ('Monthly', 'Yearly')
            throw 50021, 'payment plan must be Monthly or Yearly.', 1;
 
        select @dob = customerDOB
        from Customer
        where customerID = @customerID and isActive = 1;
 
        if @dob is null
            throw 50020, 'customer not found or account is deactivated.', 1;
 
        if exists (select 1 from Policy
                   where customerID = @customerID
                     and policyTypeID = @policyTypeID
                     and policyStatus in ('Pending', 'Active'))
            throw 50025, 'you already have this type of policy. change your coverage instead of buying another.', 1;
 
        set @monthlyPremium = dbo.calculatePremium(@policyTypeID, @coverageLevelID, @coverageAmount, @dob);
 
        if @monthlyPremium is null
            throw 50021, 'invalid policy, coverage level, or coverage amount is outside the allowed range.', 1;
 
        declare @newID int = abs(checksum(newid()) % 400000000) + 1000000000;
        while exists (select 1 from Policy where policyID = @newID)
            set @newID = abs(checksum(newid()) % 400000000) + 1000000000;
 
        -- the trigger createPayments reads paymentPlan and builds the payments
        insert into Policy (policyID, customerID, policyTypeID, coverageLevelID, coverageAmount, monthlyPremium, startDate, endDate, paymentPlan)
        values (@newID, @customerID, @policyTypeID, @coverageLevelID, @coverageAmount, @monthlyPremium,
                @startDate, dateadd(year, 1, @startDate), @paymentPlan);
 
        set @policyID = @newID;
    end try
    begin catch
        throw;
    end catch
end
go

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
           bal.nextDue as nextDueDate
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

 