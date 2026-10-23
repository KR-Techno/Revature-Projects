create database insuranceAppDB;
use insuranceAppDB;

 
create table Customer
(
    customerID    int,                                -- primary key, random 9-digit number set by customer_Create
    firstName     nvarchar(50)  not null,             -- nvarchar allows for accent marks and other non-Latin characters
    lastName      nvarchar(50)  not null,
    customerDOB   date          not null,
    customerEmail nvarchar(254) not null,             -- customer username
    customerPhone varchar(20)   not null,
    passwordHash  nvarchar(255) not null,
    isActive      bit           not null
        constraint df_customerIsActive default 1,
 
    constraint pk_customerID primary key clustered (customerID),
    constraint unq_customerEmail unique (customerEmail),
	constraint ck_customerEmail_format check (customerEmail like '%_@_%._%' and customerEmail not like '% %'),

    constraint ck_customerID check (customerID between 100000000 and 999999999),
    constraint ck_customerDOB check (customerDOB <= cast(getdate() as date)),
    constraint ck_customer_firstName check (len(firstName) > 0),
    constraint ck_firstName_chars check               -- error when a name contains numbers or symbols
    (
        firstName not like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%'
        and firstName not like '%[[]%'
        and firstName not like '%]%'
    ),
    constraint ck_customer_lastName check (len(lastName) > 0),
    constraint ck_lastName_chars check
    (
        lastName not like '%[0-9!@#$%^&*()_+=<>?/\|{}~`;:,"]%'
        and lastName not like '%[[]%'
        and lastName not like '%]%'
    ),
	constraint ck_customerPhone_format
    check (customerPhone like '+[0-9]%'
           and customerPhone not like '%[^0-9+-]%'
           and len(customerPhone) >= 8),
	constraint ck_customerPasswordHash_format
    check (passwordHash like '$2[abxy]$%' and len(passwordHash) = 60)
);

 

-- Function: turns all-lowercase or all-uppercase names into proper case
-- (bob ross = Bob Ross, JERMAINE COLE = Jermaine Cole). mixed case is left alone.
create function ProperCase (@input nvarchar(100))
returns nvarchar(100)
as
begin
    if @input is null return null;
 
    set @input = ltrim(rtrim(@input));
 
    -- leave mixed-case input alone (McDonald, DeShawn, Garcia-Lopez)
    if @input collate Latin1_General_CS_AS <> lower(@input)
       and @input collate Latin1_General_CS_AS <> upper(@input)
        return @input;
 
    declare @result nvarchar(100) = lower(@input);
    declare @i int = 1;
    declare @capitalizeNext bit = 1;
    declare @ch nchar(1);
 
    while @i <= len(@result)
    begin
        set @ch = substring(@result, @i, 1);
 
        if @capitalizeNext = 1
            set @result = stuff(@result, @i, 1, upper(@ch));
 
        -- capitalize the letter after a space, hyphen, or apostrophe
        set @capitalizeNext = case when @ch in (N' ', N'-', N'''') then 1 else 0 end;
        set @i += 1;
    end
 
    return @result;
end
 

-- procedure customer: create (registers a customer and returns the random 9-digit ID)
create procedure customer_Create
(
    @firstName     nvarchar(50),
    @lastName      nvarchar(50),
    @customerDOB   date,
    @customerEmail nvarchar(254),
    @customerPhone varchar(20),
    @passwordHash  nvarchar(255),
    @customerID    int output
)
as
begin
    set nocount on;
 
    begin try
        set @firstName = dbo.ProperCase(@firstName);
        set @lastName  = dbo.ProperCase(@lastName);
 
        if exists (select 1 from Customer where customerEmail = @customerEmail)
            throw 50001, 'this email has already been taken.', 1;
 
        -- random 9-digit number between 100000000 - 999999999, re-roll if already used
        declare @newID int;
        set @newID = abs(checksum(newid()) % 900000000) + 100000000;
 
        while exists (select 1 from Customer where customerID = @newID)
            set @newID = abs(checksum(newid()) % 900000000) + 100000000;
 
        insert into Customer
            (customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, passwordHash)
        values
            (@newID, @firstName, @lastName, @customerDOB, @customerEmail, @customerPhone, @passwordHash);
 
        set @customerID = @newID;
    end try
    begin catch
        throw; -- pass the original error to the api
    end catch
end

 
 
-- procedure customer: get all (full implementation when admin gets implemented)
create procedure get_AllCustomers
as
begin
    set nocount on;
 
    select customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, isActive
    from Customer
    order by lastName, firstName;
end
 
 
-- procedure customer: get one by ID (never returns passwordHash)
create procedure get_CustomerByID
(
    @customerID int
)
as
begin
    set nocount on;
 
    select customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, isActive
    from Customer
    where customerID = @customerID;
end

 
 
-- procedure customer: login lookup 
create procedure get_CustomerLogin
(
    @customerEmail nvarchar(254)
)
as
begin
    set nocount on;
 
    select customerID, customerEmail, passwordHash, isActive
    from Customer
    where customerEmail = @customerEmail;
end

 
 
-- procedure customer: change password (api sends an already-hashed value)
create procedure customer_ChangePassword
(
    @customerID   int,
    @passwordHash nvarchar(255)
)
as
begin
    set nocount on;
 
    begin try
        update Customer
        set passwordHash = @passwordHash
        where customerID = @customerID;
 
        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;
    end try
    begin catch
        throw;
    end catch
end

 
 

-- procedure customer: get the stored hash by ID (the api verifies the current password with it)
create procedure customer_GetPasswordHash
(
    @customerID int
)
as
begin
    set nocount on;
 
    select passwordHash
    from Customer
    where customerID = @customerID;
end
 
 

-- procedure customer: update contact info (profile page)
create procedure customer_UpdateContactInfo
(
    @customerID    int,
    @customerEmail nvarchar(254),
    @customerPhone varchar(20)
)
as
begin
    set nocount on;
 
    begin try
        -- email must not belong to a different customer
        if exists (select 1 from Customer
                   where customerEmail = @customerEmail
                     and customerID <> @customerID)
            throw 50001, 'this email has already been taken.', 1;
 
        update Customer
        set customerEmail = @customerEmail,
            customerPhone = @customerPhone
        where customerID = @customerID;
 
        if @@rowcount = 0
            throw 50002, 'customer not found.', 1;
    end try
    begin catch
        throw;
    end catch
end
 
 
-- procedure customer: reactivate (admin control; run manually until an admin portal exists)
create procedure customer_Reactivate
(
    @customerID int
)
as
begin
    set nocount on;
 
    begin try
        update Customer
        set isActive = 1
        where customerID = @customerID
          and isActive = 0;
 
        if @@rowcount = 0
            throw 50002, 'customer not found or already active.', 1;
    end try
    begin catch
        throw;
    end catch
end

 
-- procedure customer: deactivate
-- blocked while the customer has an active policy, an open claim, or an overdue payment.
create procedure customer_Deactivate
(
    @customerID int
)
as
begin
    set nocount on;
 
    begin try
        declare @today date = cast(getdate() as date);
 
        if exists (select 1 from Policy
                   where customerID = @customerID
                     and policyStatus in ('Pending', 'Active')
                     and endDate >= @today)
            throw 50010, 'cannot deactivate: you still have an active policy. cancel it first.', 1;
 
        if exists (select 1
                   from Claim c
                   join Policy p on p.policyID = c.policyID
                   where p.customerID = @customerID
                     and c.claimStatus in ('Submitted', 'Under Review'))
            throw 50011, 'cannot deactivate: you still have an open claim.', 1;
 
        if exists (select 1
                   from Payment pay
                   join Policy p on p.policyID = pay.policyID
                   where p.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < @today)
            throw 50012, 'cannot deactivate: you have an overdue payment.', 1;
 
        update Customer
        set isActive = 0
        where customerID = @customerID
          and isActive = 1;
 
        if @@rowcount = 0
            throw 50002, 'customer not found or already deactivated.', 1;
    end try
    begin catch
        throw;
    end catch
end


-- Table PolicyType: the catalog of products a customer can buy.
create table PolicyType
(
    policyTypeID  int identity(1, 1),
    typeName      nvarchar(30)   not null,
    baseRate      decimal(6, 4)  not null,
    minCoverage   decimal(12, 2) not null,
    maxCoverage   decimal(12, 2) not null,
    factorUnder25 decimal(4, 2)  not null,
    factor25to64  decimal(4, 2)  not null,
    factor65plus  decimal(4, 2)  not null,
 
    constraint pk_PolicyType primary key clustered (policyTypeID),
    constraint unq_PolicyType_typeName unique (typeName),
    constraint ck_PolicyType_baseRate check (baseRate > 0),
    constraint ck_PolicyType_minCoverage check (minCoverage > 0),
    constraint ck_PolicyType_maxCoverage check (maxCoverage >= minCoverage),
    constraint ck_PolicyType_ageFactors check (factorUnder25 > 0 and factor25to64 > 0 and factor65plus > 0)
);


 
-- seed data: the policy catalog
insert into PolicyType (typeName, baseRate, minCoverage, maxCoverage, factorUnder25, factor25to64, factor65plus)
values
    ('Auto',   0.0100,  10000.00,  100000.00, 2.50, 1.50, 1.75),   -- young drivers cost the most
    ('Home',   0.0080,  50000.00,  500000.00, 1.00, 1.00, 1.10),   -- age barely matters
    ('Health', 0.0200,   5000.00,   50000.00, 0.80, 1.00, 3.50),   -- older customers cost the most
    ('Life',   0.0040,  50000.00, 1000000.00, 0.60, 1.75, 3.50);   -- young is cheap, older is expensive

 

-- Table Policy
-- monthlyPremium and coverageAmount are locked in at purchase time.
create table Policy
(
    policyID       int            not null,   -- random 10-digit policy number (1000000000 - 1399999999), set by create_Policy
    customerID     int            not null,
    policyTypeID   int            not null,
    coverageAmount decimal(12, 2) not null,
    monthlyPremium decimal(10, 2) not null,   -- amount due each month
    startDate      date           not null,
    endDate        date           not null,
    policyStatus   nvarchar(20)   not null
        constraint df_Policy_policyStatus default 'Active',
 
    constraint pk_Policy primary key clustered (policyID),
    constraint fk_Policy_Customer foreign key (customerID) references Customer (customerID),
    constraint fk_Policy_PolicyType foreign key (policyTypeID) references PolicyType (policyTypeID),
    constraint ck_Policy_policyID check (policyID between 1000000000 and 1399999999),
    constraint ck_Policy_coverageAmount check (coverageAmount > 0),
    constraint ck_Policy_monthlyPremium check (monthlyPremium > 0),
    constraint ck_Policy_dates check (endDate > startDate),
    constraint ck_Policy_policyStatus check (policyStatus in ('Pending', 'Active', 'Expired', 'Cancelled'))
);

 
 
-- Table Claim
create table Claim
(
    claimID          int            not null,   -- random 10-digit claim number (1400000000 - 1799999999), set by submit_Claim
    policyID         int            not null,
    incidentDate     date           not null,
    submittedDate    date           not null
        constraint df_Claim_submittedDate default cast(getdate() as date),
    claimDescription nvarchar(1000) not null,
    claimAmount      decimal(12, 2) not null,
    claimStatus      nvarchar(20)   not null
        constraint df_Claim_claimStatus default 'Submitted',
    approvedAmount   decimal(12, 2) null,       -- what will be paid by the insurer
    resolvedDate     date           null,       -- when the claim was decided/withdrawn
    decisionNote     nvarchar(500)  null,       -- reason for the decision (for example, why it was denied)
 
    constraint pk_Claim primary key clustered (claimID),
    constraint fk_Claim_Policy foreign key (policyID) references Policy (policyID),
    constraint ck_Claim_claimID check (claimID between 1400000000 and 1799999999),
    constraint ck_Claim_claimAmount check (claimAmount > 0),
    constraint ck_Claim_claimDescription check (len(claimDescription) > 0),
    constraint ck_Claim_incidentDate check (incidentDate <= submittedDate),
    constraint ck_Claim_claimStatus check (claimStatus in ('Submitted', 'Under Review', 'Approved', 'Denied', 'Closed', 'Withdrawn')),
    constraint ck_Claim_approvedAmount check (approvedAmount is null or (approvedAmount >= 0 and approvedAmount <= claimAmount)),
    constraint ck_Claim_resolvedDate check (resolvedDate is null or resolvedDate >= submittedDate)
);

 

-- Table Payment: the monthly payment schedule and transaction history.
-- "Overdue" is not stored; it is worked out when reading
-- (Pending and the due date is in the past).
create table Payment
(
    paymentID     int            not null,   -- random 10-digit payment number (1800000000 - 2147483647), set by the createPayments trigger
    policyID      int            not null,
    dueDate       date           not null,
    amount        decimal(10, 2) not null,
    paidDate      datetime2(0)   null,        -- filled in when the payment is made
    paymentStatus nvarchar(20)   not null
        constraint df_Payment_paymentStatus default 'Pending',
	lateFee decimal(10, 2) not null
        constraint df_Payment_lateFee default 0,
 
    constraint pk_Payment primary key clustered (paymentID),
    constraint fk_Payment_Policy foreign key (policyID) references Policy (policyID),
    constraint ck_Payment_paymentID check (paymentID between 1800000000 and 2147483647),
    constraint unq_Payment_policy_dueDate unique (policyID, dueDate),   -- no duplicate months
    constraint ck_Payment_amount check (amount > 0),
    constraint ck_Payment_paymentStatus check (paymentStatus in ('Pending', 'Paid', 'Cancelled')),
	constraint ck_Payment_lateFee check (lateFee >= 0),
    -- paidDate must be filled in exactly when the payment is Paid
    constraint ck_Payment_paidDate check
    (
        (paymentStatus = 'Paid' and paidDate is not null)
        or (paymentStatus <> 'Paid' and paidDate is null)
    )
);

 

-- indexes: speed up "show me my policies / claims / payments"
create nonclustered index ix_Policy_customerID on Policy (customerID);
go
create nonclustered index ix_Claim_policyID on Claim (policyID);
go
create nonclustered index ix_Payment_policyID on Payment (policyID);
go
 
 
-- Trigger createPayments: build the 12 monthly payments when a policy is created.
-- the first payment is due on the policy start date.
create trigger createPayments
on Policy
after insert
as
begin
    set nocount on;

    -- the 12 monthly payments for every policy that was just inserted
    declare @newPayments table
    (
        rowNum   int identity(1, 1),
        policyID int,
        dueDate  date,
        amount   decimal(10, 2)
    );

    insert into @newPayments (policyID, dueDate, amount)
    select i.policyID, dateadd(month, n.number, i.startDate), i.monthlyPremium
    from inserted i
    cross join (values (0), (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11)) as n(number);

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

 
-- Trigger cancelPayments: cancel the unpaid payments when a policy is cancelled.
-- payments already paid are left alone as history.
create trigger cancelPayments
on Policy
after update
as
begin
    set nocount on;
 
    if not update(policyStatus)
        return;
 
    update pay
    set paymentStatus = 'Cancelled'
    from Payment pay
    join inserted i on i.policyID = pay.policyID
    join deleted d on d.policyID = i.policyID
    where i.policyStatus = 'Cancelled'
      and d.policyStatus <> 'Cancelled'
      and pay.paymentStatus = 'Pending';
end


 
 

-- Function calculatePremium: monthly premium = (coverage x baseRate x ageFactor) / 12
-- the age factor comes from the policy type's own factors.
-- returns NULL if the type does not exist or the coverage is outside
-- that type's min/max, so the calling procedure can reject it.
create function calculatePremium
(
    @policyTypeID   int,
    @coverageAmount decimal(12, 2),
    @customerDOB    date
)
returns decimal(10, 2)
as
begin
    declare @baseRate      decimal(6, 4),
            @minCoverage   decimal(12, 2),
            @maxCoverage   decimal(12, 2),
            @factorUnder25 decimal(4, 2),
            @factor25to64  decimal(4, 2),
            @factor65plus  decimal(4, 2);
 
    select @baseRate      = baseRate,
           @minCoverage   = minCoverage,
           @maxCoverage   = maxCoverage,
           @factorUnder25 = factorUnder25,
           @factor25to64  = factor25to64,
           @factor65plus  = factor65plus
    from PolicyType
    where policyTypeID = @policyTypeID;
 
    if @baseRate is null or @coverageAmount < @minCoverage or @coverageAmount > @maxCoverage
        return null;
 
    -- exact age in years
    declare @today date = cast(getdate() as date);
    declare @age int = datediff(year, @customerDOB, @today)
        - case when dateadd(year, datediff(year, @customerDOB, @today), @customerDOB) > @today then 1 else 0 end;
 
    declare @ageFactor decimal(4, 2) =
        case when @age < 25 then @factorUnder25
             when @age >= 65 then @factor65plus
             else @factor25to64 end;
 
    -- baseRate is a yearly rate, so divide by 12 for the monthly payment
    return round(@coverageAmount * @baseRate * @ageFactor / 12, 2);
end

 
 
-- procedure policy type: list the catalog (fills the angular dropdown)
create procedure get_PolicyTypes
as
begin
    set nocount on;
 
    select policyTypeID, typeName, minCoverage, maxCoverage
    from PolicyType
    order by typeName;
end

 
-- procedure policy: quote (shows the price, saves nothing)
create procedure get_quotePolicy
(
    @customerID     int,
    @policyTypeID   int,
    @coverageAmount decimal(12, 2)
)
as
begin
    set nocount on;
 
    begin try
        declare @dob date;
        declare @monthlyPremium decimal(10, 2);
 
        select @dob = customerDOB
        from Customer
        where customerID = @customerID
          and isActive = 1;
 
        if @dob is null
            throw 50020, 'customer not found or account is deactivated.', 1;
 
        set @monthlyPremium = dbo.calculatePremium(@policyTypeID, @coverageAmount, @dob);
 
        if @monthlyPremium is null
            throw 50021, 'invalid policy type, or coverage amount is outside the allowed range for that type.', 1;
 
        select pt.typeName,
               @coverageAmount as coverageAmount,
               @monthlyPremium as monthlyPremium,
               cast(@monthlyPremium * 12 as decimal(12, 2)) as yearlyTotal
        from PolicyType pt
        where pt.policyTypeID = @policyTypeID;
    end try
    begin catch
        throw;
    end catch
end

 
 
-- procedure policy: create (buy a policy)
-- recalculates the premium here, so the browser can never set the price.
-- the trigger create_policy builds the 12 payments.
create procedure create_Policy
(
    @customerID     int,
    @policyTypeID   int,
    @coverageAmount decimal(12, 2),
    @policyID       int output
)
as
begin
    set nocount on;
 
    begin try
        declare @dob date;
        declare @monthlyPremium decimal(10, 2);
        declare @startDate date = cast(getdate() as date);
 
        select @dob = customerDOB
        from Customer
        where customerID = @customerID
          and isActive = 1;
 
        if @dob is null
            throw 50020, 'customer not found or account is deactivated.', 1;
 
        set @monthlyPremium = dbo.calculatePremium(@policyTypeID, @coverageAmount, @dob);
 
        if @monthlyPremium is null
            throw 50021, 'invalid policy type, or coverage amount is outside the allowed range for that type.', 1;
 
        -- random policy number (1000000000 - 1399999999), re-roll if already used
        declare @newID int;
        set @newID = abs(checksum(newid()) % 400000000) + 1000000000;

        while exists (select 1 from Policy where policyID = @newID)
            set @newID = abs(checksum(newid()) % 400000000) + 1000000000;

        insert into Policy (policyID, customerID, policyTypeID, coverageAmount, monthlyPremium, startDate, endDate)
        values (@newID, @customerID, @policyTypeID, @coverageAmount, @monthlyPremium,
                @startDate, dateadd(year, 1, @startDate));

        set @policyID = @newID;
    end try
    begin catch
        throw;
    end catch
end


 
 
-- procedure customerpolicy: list a customer's own policies
-- displayStatus shows 'Expired' once an active policy passes its end date
create procedure get_CustomerPolicies
(
    @customerID int
)
as
begin
    set nocount on;
 
    select p.policyID,
           pt.typeName,
           p.coverageAmount,
           p.monthlyPremium,
           p.startDate,
           p.endDate,
           p.policyStatus,
           case when p.policyStatus = 'Active' and p.endDate < cast(getdate() as date)
                then 'Expired'
                else p.policyStatus end as displayStatus
    from Policy p
    join PolicyType pt on pt.policyTypeID = p.policyTypeID
    where p.customerID = @customerID
    order by p.startDate desc;
end
 
 -- procedure policy: cancel (replaces deleting a policy)
-- the trigger cancel_Policy cancels the unpaid payments.
create procedure cancel_Policy
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
 
        if exists (select 1
                   from Payment pay
                   join Policy p on p.policyID = pay.policyID
                   where pay.policyID = @policyID
                     and p.customerID = @customerID
                     and pay.paymentStatus = 'Pending'
                     and pay.dueDate < cast(getdate() as date))
            throw 50024, 'cannot cancel: this policy has an overdue payment. pay it first.', 1;
 
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

 

 -- procedure payment: list a customer's payments / transactions
-- displayStatus shows 'Overdue' for unpaid payments past their due date
create procedure get_CustomerPayments
(
    @customerID int
)
as
begin
    set nocount on;
 
    declare @today date = cast(getdate() as date);
 
    select pay.paymentID,
           pay.policyID,
           pt.typeName,
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
    join Policy p on p.policyID = pay.policyID
    join PolicyType pt on pt.policyTypeID = p.policyTypeID
    -- unpaid: fee is calculated live. paid or cancelled: the stored fee is used.
    cross apply (select case when pay.paymentStatus = 'Pending'
                             then dbo.calculateLateFee(pay.dueDate, pay.amount, @today)
                             else pay.lateFee end as lateFee) fee
    where p.customerID = @customerID
    order by case pay.paymentStatus when 'Pending' then 0 when 'Paid' then 1 else 2 end,
         pay.dueDate,
         pay.paymentID;
end

-- Function calculateLateFee: Calculate late fee for customers who have overdue payments. $3 a day, caps at 0.75 of the original payment.
create function calculateLateFee
(
    @dueDate  date,
    @amount   decimal(10, 2),
    @asOfDate date
)
returns decimal(10, 2)
as
begin
    -- $3 for every day after the due date; nothing if it is not late
    declare @fee decimal(12, 2) =
        case when @asOfDate > @dueDate
             then datediff(day, @dueDate, @asOfDate) * 3.00
             else 0.00 end;
 
    -- cap: the fee can never be more than 3/4 of the payment
    declare @maxFee decimal(12, 2) = round(@amount * 0.75, 2, 1);
 
    return case when @fee > @maxFee then @maxFee else @fee end;
end
 
-- procedure payment: pay (simulated). settles the OLDEST unpaid payment of the
-- policy, so months can't be skipped. returns a receipt row.
create procedure pay_Payment
(
    @customerID int,
    @policyID   int
)
as
begin
    set nocount on;
 
    begin try
        ;with nextpayment as
        (
            select top (1) pay.paymentID, pay.dueDate, pay.amount, pay.lateFee, pay.paidDate, pay.paymentStatus
            from Payment pay
            join Policy p on p.policyID = pay.policyID
            where pay.policyID = @policyID
              and p.customerID = @customerID
              and p.policyStatus = 'Active'
              and pay.paymentStatus = 'Pending'
            order by pay.dueDate
        )
        update nextpayment
        set paymentStatus = 'Paid',
            paidDate = sysdatetime(),
            lateFee = dbo.calculateLateFee(dueDate, amount, cast(getdate() as date))
        output inserted.paymentID,
               inserted.dueDate,
               inserted.amount,
               inserted.lateFee,
               inserted.amount + inserted.lateFee as totalCharged,
               inserted.paidDate;
 
        if @@rowcount = 0
            throw 50030, 'no payment is due, or the policy was not found or is not active.', 1;
    end try
    begin catch
        throw;
    end catch
end

 
 
-- claim: submit
create procedure submit_Claim
(
    @customerID       int,
    @policyID         int,
    @incidentDate     date,
    @claimDescription nvarchar(1000),
    @claimAmount      decimal(12, 2),
    @claimID          int output
)
as
begin
    set nocount on;

    begin try
        declare @today date = cast(getdate() as date);
        declare @status nvarchar(20), @startDate date, @endDate date, @coverage decimal(12, 2);

        -- the policy must belong to this customer
        select @status = policyStatus, @startDate = startDate, @endDate = endDate, @coverage = coverageAmount
        from Policy
        where policyID = @policyID
          and customerID = @customerID;

        if @status is null
            throw 50040, 'policy not found.', 1;

        if @status <> 'Active' or @endDate < @today
            throw 50041, 'claims can only be filed on an active policy.', 1;

        if @incidentDate < @startDate or @incidentDate > @endDate or @incidentDate > @today
            throw 50042, 'the incident date must fall within the policy period and cannot be in the future.', 1;

        if @claimAmount > @coverage
            throw 50043, 'the claim amount cannot be more than the policy coverage.', 1;

        -- random claim number (1400000000 - 1799999999), re-roll if already used
        declare @newID int;
        set @newID = abs(checksum(newid()) % 400000000) + 1400000000;

        while exists (select 1 from Claim where claimID = @newID)
            set @newID = abs(checksum(newid()) % 400000000) + 1400000000;

        insert into Claim (claimID, policyID, incidentDate, claimDescription, claimAmount)
        values (@newID, @policyID, @incidentDate, @claimDescription, @claimAmount);

        set @claimID = @newID;
    end try
    begin catch
        throw;
    end catch
end

 
-- procedure claim: list a customer's own claims
create procedure get_CustomerClaims
(
    @customerID int
)
as
begin
    set nocount on;
 
    select c.claimID,
           c.policyID,
           pt.typeName,
           c.incidentDate,
           c.submittedDate,
           c.claimDescription,
           c.claimAmount,
           c.claimStatus,
           c.approvedAmount,
           c.resolvedDate,
           c.decisionNote
    from Claim c
    join Policy p on p.policyID = c.policyID
    join PolicyType pt on pt.policyTypeID = p.policyTypeID
    where p.customerID = @customerID
    order by c.submittedDate desc, c.claimID desc;
end

 
-- procedure claim: withdraw (replaces deleting a claim)
-- only while the claim is still submitted or under review
create procedure withdraw_Claim
(
    @customerID int,
    @claimID    int
)
as
begin
    set nocount on;
 
    begin try
        update c
        set claimStatus = 'Withdrawn',
            resolvedDate = cast(getdate() as date)
        from Claim c
        join Policy p on p.policyID = c.policyID
        where c.claimID = @claimID
          and p.customerID = @customerID
          and c.claimStatus in ('Submitted', 'Under Review');
 
        if @@rowcount = 0
            throw 50044, 'claim not found, or it can no longer be withdrawn.', 1;
    end try
    begin catch
        throw;
    end catch
end

 
 
-- procedure claim: review / update status  (ADMIN ONLY)
-- allowed moves: submitted -> under review -> approved or denied -> closed
create procedure update_ClaimStatus
(
    @claimID        int,
    @newStatus      nvarchar(20),
    @approvedAmount decimal(12, 2) = null,
    @decisionNote   nvarchar(500)  = null
)
as
begin
    set nocount on;
 
    begin try
        declare @current nvarchar(20);
 
        select @current = claimStatus
        from Claim
        where claimID = @claimID;
 
        if @current is null
            throw 50045, 'claim not found.', 1;
 
        -- store the status in its proper casing, however the api typed it
        set @newStatus = case @newStatus
                             when 'Under Review' then 'Under Review'
                             when 'Approved'     then 'Approved'
                             when 'Denied'       then 'Denied'
                             when 'Closed'       then 'Closed'
                             else @newStatus end;
 
        if not (   (@current = 'Submitted'    and @newStatus = 'Under Review')
                or (@current = 'Under Review' and @newStatus in ('Approved', 'Denied'))
                or (@current in ('Approved', 'Denied') and @newStatus = 'Closed'))
            throw 50046, 'that status change is not allowed.', 1;
 
        if @newStatus = 'Approved' and @approvedAmount is null
            throw 50047, 'an approved amount is required when approving a claim.', 1;
 
        if @newStatus = 'Denied' and (@decisionNote is null or len(@decisionNote) = 0)
            throw 50048, 'a decision note is required when denying a claim.', 1;
 
        update Claim
        set claimStatus    = @newStatus,
            approvedAmount = case when @newStatus = 'Approved' then @approvedAmount else approvedAmount end,
            decisionNote   = coalesce(@decisionNote, decisionNote),
            resolvedDate   = case when @newStatus in ('Approved', 'Denied')
                                  then cast(getdate() as date) else resolvedDate end
        where claimID = @claimID;
    end try
    begin catch
        throw;
    end catch
end

select * from Customer
select * from Policy
select * from Payment
select * from Claim