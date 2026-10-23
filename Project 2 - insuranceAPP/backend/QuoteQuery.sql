-- quotes.sql
-- Quotes become their own saved thing: every "Get quote" is stored, valid for 30 days,
-- and a policy is bought FROM a saved quote at the price that was quoted.
-- Run the steps ONE AT A TIME, in order. Run policy_payment_plans.sql first.
-- New error numbers: 50060 quote not found, 50061 quote expired, 50062 quote already used (all show as 400 unless you map them).

-- step 1: the Quote table
create table Quote
(
    quoteID                int,                              -- random number, like policies and payments
    customerID             int            not null,
    policyTypeID           int            not null,
    coverageLevelID        int            not null,
    coverageAmount         decimal(12, 2) not null,
    monthlyPremium         decimal(10, 2) not null,          -- the price that was shown (kept even if rates change later)
    yearlyTotal            decimal(12, 2) not null,          -- 12 monthly payments added up
    yearlyDiscountedTotal  decimal(12, 2) not null,          -- the one-time price if paying yearly
    createdDate            date           not null,
    expiryDate             date           not null,          -- created + 30 days
    quoteStatus            nvarchar(10)   not null
        constraint df_Quote_quoteStatus default 'Open',
    policyID               int            null,              -- filled in when the quote is bought

    constraint pk_Quote primary key clustered (quoteID),
    constraint fk_Quote_Customer foreign key (customerID) references Customer (customerID),
    constraint fk_Quote_PolicyType foreign key (policyTypeID) references PolicyType (policyTypeID),
    constraint fk_Quote_CoverageLevel foreign key (coverageLevelID) references CoverageLevel (coverageLevelID),
    constraint fk_Quote_Policy foreign key (policyID) references Policy (policyID),
    constraint ck_Quote_quoteStatus check (quoteStatus in ('Open', 'Accepted', 'Dismissed')),
    constraint ck_Quote_expiry check (expiryDate > createdDate),
    constraint ck_Quote_accepted check ((quoteStatus = 'Accepted' and policyID is not null) or (quoteStatus <> 'Accepted' and policyID is null))
);
go
create nonclustered index ix_Quote_customerID on Quote (customerID);
go


-- step 2: save a quote (this is what "Get quote" now calls).
-- If the customer already has an unexpired open quote for the same product, level and amount, it is refreshed
-- (new price and a new 30 days) instead of creating a duplicate.
create or alter procedure quote_Create
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
        declare @dob date, @monthly decimal(10, 2), @quoteID int;
        declare @today date = dbo.businessToday();

        select @dob = customerDOB from Customer where customerID = @customerID and isActive = 1;
        if @dob is null
            throw 50020, 'customer not found or account is deactivated.', 1;

        set @monthly = dbo.calculatePremium(@policyTypeID, @coverageLevelID, @coverageAmount, @dob);
        if @monthly is null
            throw 50021, 'invalid policy, coverage level, or coverage amount is outside the allowed range.', 1;

        select @quoteID = quoteID
        from Quote
        where customerID = @customerID and policyTypeID = @policyTypeID and coverageLevelID = @coverageLevelID
          and coverageAmount = @coverageAmount and quoteStatus = 'Open' and expiryDate >= @today;

        if @quoteID is not null
        begin
            update Quote
            set monthlyPremium = @monthly,
                yearlyTotal = cast(@monthly * 12 as decimal(12, 2)),
                yearlyDiscountedTotal = cast(dbo.yearlyPaymentTotal(@monthly) as decimal(12, 2)),
                createdDate = @today,
                expiryDate = dateadd(day, 30, @today)
            where quoteID = @quoteID;
        end
        else
        begin
            set @quoteID = abs(checksum(newid()) % 400000000) + 1400000000;
            while exists (select 1 from Quote where quoteID = @quoteID)
                set @quoteID = abs(checksum(newid()) % 400000000) + 1400000000;

            insert into Quote (quoteID, customerID, policyTypeID, coverageLevelID, coverageAmount,
                               monthlyPremium, yearlyTotal, yearlyDiscountedTotal, createdDate, expiryDate)
            values (@quoteID, @customerID, @policyTypeID, @coverageLevelID, @coverageAmount,
                    @monthly, cast(@monthly * 12 as decimal(12, 2)), cast(dbo.yearlyPaymentTotal(@monthly) as decimal(12, 2)),
                    @today, dateadd(day, 30, @today));
        end

        exec quote_GetOne @customerID, @quoteID;
    end try
    begin catch
        throw;
    end catch
end
go


-- step 3: one quote (used by quote_Create to return what it saved)
create or alter procedure quote_GetOne
(
    @customerID int,
    @quoteID    int
)
as
begin
    set nocount on;

    select q.quoteID, q.policyTypeID, pt.typeName, q.coverageLevelID, cl.levelName,
           q.coverageAmount, q.monthlyPremium, q.yearlyTotal, q.yearlyDiscountedTotal,
           q.createdDate, q.expiryDate, q.quoteStatus,
           case when q.quoteStatus = 'Accepted' then 'Accepted'
                when q.expiryDate < dbo.businessToday() then 'Expired'
                else 'Active' end as displayStatus
    from Quote q
    join PolicyType pt on pt.policyTypeID = q.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = q.coverageLevelID
    where q.quoteID = @quoteID and q.customerID = @customerID;
end
go


-- step 4: the customer's own quotes (removed ones are hidden)
create or alter procedure quote_GetByCustomer
(
    @customerID int
)
as
begin
    set nocount on;

    select q.quoteID, q.policyTypeID, pt.typeName, q.coverageLevelID, cl.levelName,
           q.coverageAmount, q.monthlyPremium, q.yearlyTotal, q.yearlyDiscountedTotal,
           q.createdDate, q.expiryDate, q.quoteStatus,
           case when q.quoteStatus = 'Accepted' then 'Accepted'
                when q.expiryDate < dbo.businessToday() then 'Expired'
                else 'Active' end as displayStatus
    from Quote q
    join PolicyType pt on pt.policyTypeID = q.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = q.coverageLevelID
    where q.customerID = @customerID and q.quoteStatus <> 'Dismissed'
    order by q.createdDate desc, q.quoteID;
end
go


-- step 5: remove a quote (soft: it is marked Dismissed, not deleted; an already-bought quote stays as history)
create or alter procedure quote_Dismiss
(
    @customerID int,
    @quoteID    int
)
as
begin
    set nocount on;

    begin try
        update Quote
        set quoteStatus = 'Dismissed'
        where quoteID = @quoteID and customerID = @customerID and quoteStatus = 'Open';

        if @@rowcount = 0
            throw 50060, 'quote not found, or it has already been used.', 1;
    end try
    begin catch
        throw;
    end catch
end
go


-- step 6: buy a policy FROM a quote. The policy gets the quote's stored price (nothing is recalculated),
-- so what the customer was shown is what they pay. Saved together or not at all.
create or alter procedure create_PolicyFromQuote
(
    @customerID  int,
    @quoteID     int,
    @paymentPlan nvarchar(10),
    @policyID    int output
)
as
begin
    set nocount on;

    begin try
        if @paymentPlan not in ('Monthly', 'Yearly')
            throw 50021, 'payment plan must be Monthly or Yearly.', 1;

        if not exists (select 1 from Customer where customerID = @customerID and isActive = 1)
            throw 50020, 'customer not found or account is deactivated.', 1;

        declare @typeID int, @levelID int, @coverage decimal(12, 2), @monthly decimal(10, 2),
                @status nvarchar(10), @expiry date;
        declare @today date = dbo.businessToday();

        select @typeID = policyTypeID, @levelID = coverageLevelID, @coverage = coverageAmount,
               @monthly = monthlyPremium, @status = quoteStatus, @expiry = expiryDate
        from Quote
        where quoteID = @quoteID and customerID = @customerID;

        if @status is null or @status = 'Dismissed'
            throw 50060, 'quote not found.', 1;
        if @status = 'Accepted'
            throw 50062, 'this quote has already been used to buy a policy.', 1;
        if @expiry < @today
            throw 50061, 'this quote has expired. please get a new quote.', 1;

        if exists (select 1 from Policy
                   where customerID = @customerID and policyTypeID = @typeID
                     and policyStatus in ('Pending', 'Active'))
            throw 50025, 'you already have this type of policy. change your coverage instead of buying another.', 1;

        begin transaction;

        declare @newID int = abs(checksum(newid()) % 400000000) + 1000000000;
        while exists (select 1 from Policy where policyID = @newID)
            set @newID = abs(checksum(newid()) % 400000000) + 1000000000;

        -- the trigger createPayments builds the payments from paymentPlan
        insert into Policy (policyID, customerID, policyTypeID, coverageLevelID, coverageAmount, monthlyPremium, startDate, endDate, paymentPlan)
        values (@newID, @customerID, @typeID, @levelID, @coverage, @monthly, @today, dateadd(year, 1, @today), @paymentPlan);

        update Quote set quoteStatus = 'Accepted', policyID = @newID where quoteID = @quoteID;

        commit transaction;

        set @policyID = @newID;
    end try
    begin catch
        if @@trancount > 0 rollback transaction;
        throw;
    end catch
end
go


-- step 7: admin - every quote, with the customer
create or alter procedure admin_GetQuotes
as
begin
    set nocount on;

    select q.quoteID, q.customerID,
           cu.firstName + ' ' + cu.lastName as customerName,
           cu.customerEmail,
           pt.typeName, cl.levelName,
           q.coverageAmount, q.monthlyPremium, q.createdDate, q.expiryDate, q.quoteStatus,
           case when q.quoteStatus = 'Accepted' then 'Accepted'
                when q.quoteStatus = 'Dismissed' then 'Removed'
                when q.expiryDate < dbo.businessToday() then 'Expired'
                else 'Active' end as displayStatus,
           q.policyID
    from Quote q
    join Customer cu on cu.customerID = q.customerID
    join PolicyType pt on pt.policyTypeID = q.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = q.coverageLevelID
    order by q.createdDate desc, q.quoteID;
end
go