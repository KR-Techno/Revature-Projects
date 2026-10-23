-- ============================================================
-- DucklingInsurance: complete database setup
-- Creates every table, function, trigger and stored procedure the API needs, plus the product catalog.
-- Run the whole script once on an empty SQL Server / Azure SQL database.
--
-- Azure SQL Database cannot create or switch databases from a script: create the database in the portal,
-- connect to it, and run everything below the "use insuranceAppDB" line.
-- The last section shows how to turn one registered account into the admin.
-- ============================================================

if db_id('insuranceAppDB') is null
    create database insuranceAppDB;
go
use insuranceAppDB;
go

-- ============================================================
-- Functions (no table dependencies)
-- ============================================================

-- Today's date in the business time zone (Eastern) instead of the server's UTC clock.
create or alter function dbo.businessToday()
returns date
as
begin
    return cast(sysdatetimeoffset() at time zone 'Eastern Standard Time' as date);
end
go


-- Current date and time in the business time zone, used to stamp payments.
create or alter function dbo.businessNow()
returns datetime2(0)
as
begin
    return cast(sysdatetimeoffset() at time zone 'Eastern Standard Time' as datetime2(0));
end
go


-- Turns all-lowercase or all-uppercase names into proper case (bob ross -> Bob Ross).
-- Mixed-case names like McDonald are left alone.
create or alter function dbo.ProperCase (@input nvarchar(100))
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
go


-- One-time price for paying a year up front: 12 monthly premiums minus a 5% discount.
create or alter function dbo.yearlyPaymentTotal (@monthlyPremium decimal(10, 2))
returns decimal(10, 2)
as
begin
    return round(@monthlyPremium * 12 * 0.95, 2);   -- 12 months, minus 5%
end
go


-- Late fee for an overdue payment: $3 for every day late, capped at 75% of the payment amount.
create or alter function dbo.calculateLateFee
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
go


-- ============================================================
-- Tables
-- ============================================================

-- Customers and the single admin account. Stores the bcrypt hash, role, active flag,
-- and the flag that forces a new password after an admin reset.
create table Customer
(
    customerID    int,                                -- primary key, random 9-digit number set by customer_Create
    firstName     nvarchar(50)  not null,             -- nvarchar allows accent marks and other non-Latin characters
    lastName      nvarchar(50)  not null,
    customerDOB   date          not null,
    customerEmail nvarchar(254) not null,             -- customer username
    customerPhone varchar(20)   not null,
    passwordHash  nvarchar(255) not null,
    isActive      bit           not null
        constraint df_customerIsActive default 1,
    [role]        nvarchar(10)  not null
        constraint df_Customer_role default 'Customer',
    mustChangePassword bit      not null              -- 1 = must choose a new password before doing anything else
        constraint df_Customer_mustChangePassword default 0,

    constraint pk_customerID primary key clustered (customerID),
    constraint unq_customerEmail unique (customerEmail),
    constraint ck_customerEmail_format check (customerEmail like '%_@_%._%' and customerEmail not like '% %'),
    constraint ck_customerID check (customerID between 100000000 and 999999999),
    constraint ck_customerDOB check (customerDOB <= dbo.businessToday()),
    constraint ck_customerDOB_minimumAge check (customerDOB <= dateadd(year, -18, dbo.businessToday())),
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
        check (passwordHash like '$2[abxy]$%' and len(passwordHash) = 60),
    constraint ck_Customer_role check ([role] in ('Customer', 'Admin'))
);
go

-- Allows at most one admin account in the Customer table.
create unique nonclustered index ux_Customer_oneAdmin on Customer ([role]) where [role] = 'Admin';
go


-- The catalog of insurance products: base yearly rate, overall coverage range and age-based price factors.
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
go


-- The tiers of each product (e.g. Liability Only / Full Coverage / Premium), each with its own
-- price factor, plain-English description and min/max coverage. rateFactor multiplies the price.
create table CoverageLevel
(
    coverageLevelID int identity(1, 1),
    policyTypeID    int            not null,
    levelName       nvarchar(40)   not null,
    description     nvarchar(400)  not null,
    rateFactor      decimal(4, 2)  not null,
    sortOrder       tinyint        not null,   -- 1 = cheapest tier, shown first
    minCoverage     decimal(12, 2) not null,
    maxCoverage     decimal(12, 2) not null,

    constraint pk_CoverageLevel primary key clustered (coverageLevelID),
    constraint fk_CoverageLevel_PolicyType foreign key (policyTypeID) references PolicyType (policyTypeID),
    constraint unq_CoverageLevel_name unique (policyTypeID, levelName),
    constraint ck_CoverageLevel_rateFactor check (rateFactor > 0),
    constraint ck_CoverageLevel_range check (minCoverage > 0 and maxCoverage >= minCoverage)
);
go

-- A purchased policy. Level, amount and monthly premium are locked in at purchase time;
-- paymentPlan decides whether the trigger builds 12 monthly payments or one yearly payment.
create table Policy
(
    policyID        int            not null,   -- random 10-digit policy number (1000000000 - 1399999999)
    customerID      int            not null,
    policyTypeID    int            not null,
    coverageLevelID int            not null,
    coverageAmount  decimal(12, 2) not null,
    monthlyPremium  decimal(10, 2) not null,   -- amount due each month
    startDate       date           not null,
    endDate         date           not null,
    policyStatus    nvarchar(20)   not null
        constraint df_Policy_policyStatus default 'Active',
    paymentPlan     nvarchar(10)   not null
        constraint df_Policy_paymentPlan default 'Monthly',

    constraint pk_Policy primary key clustered (policyID),
    constraint fk_Policy_Customer foreign key (customerID) references Customer (customerID),
    constraint fk_Policy_PolicyType foreign key (policyTypeID) references PolicyType (policyTypeID),
    constraint fk_Policy_CoverageLevel foreign key (coverageLevelID) references CoverageLevel (coverageLevelID),
    constraint ck_Policy_policyID check (policyID between 1000000000 and 1399999999),
    constraint ck_Policy_coverageAmount check (coverageAmount > 0),
    constraint ck_Policy_monthlyPremium check (monthlyPremium > 0),
    constraint ck_Policy_dates check (endDate > startDate),
    constraint ck_Policy_policyStatus check (policyStatus in ('Pending', 'Active', 'Expired', 'Cancelled')),
    constraint ck_Policy_paymentPlan check (paymentPlan in ('Monthly', 'Yearly'))
);
go


-- Claims filed against a policy, with their status, the approved amount and the admin's decision note.
create table Claim
(
    claimID          int            not null,   -- random 10-digit claim number (1400000000 - 1799999999), set by submit_Claim
    policyID         int            not null,
    incidentDate     date           not null,
    submittedDate    date           not null
        constraint df_Claim_submittedDate default dbo.businessToday(),
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
go


-- The payment schedule and history for each policy. Overdue is not stored; it is worked out when reading
-- (Pending and past its due date).
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
go


-- Saved price quotes, valid for 30 days. A policy can be bought from a quote at the price that was stored.
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


-- Speed up looking up a customer's policies, quotes, claims and payments.
create nonclustered index ix_Policy_customerID on Policy (customerID);
create nonclustered index ix_Quote_customerID on Quote (customerID);
create nonclustered index ix_Claim_policyID on Claim (policyID);
create nonclustered index ix_Payment_policyID on Payment (policyID);
go


-- ============================================================
-- Seed data
-- ============================================================

-- The eight products customers can buy, with their base yearly rate and age factors.
insert into PolicyType (typeName, baseRate, minCoverage, maxCoverage, factorUnder25, factor25to64, factor65plus)
values
    ('Auto',       0.0100,  10000.00,  100000.00, 2.50, 1.50, 1.75),   -- young drivers cost the most
    ('Home',       0.0080,  50000.00,  500000.00, 1.00, 1.00, 1.10),   -- age barely matters
    ('Health',     0.0200,   5000.00,   50000.00, 0.80, 1.00, 3.50),   -- older customers cost the most
    ('Life',       0.0040,  50000.00, 1000000.00, 0.60, 1.75, 3.50),   -- young is cheap, older is expensive
    ('Motorcycle', 0.0120,  10000.00,   75000.00, 2.20, 1.00, 1.25),
    ('Renters',    0.0050,   5000.00,  100000.00, 1.00, 1.00, 1.05),
    ('Pet',        0.0600,   2000.00,   20000.00, 1.00, 1.00, 1.00),
    ('Travel',     0.0300,   1000.00,   50000.00, 1.00, 1.00, 1.50);
go

-- Coverage levels with customer-friendly descriptions. Three-tier products allow half / 1x / double the
-- product's max coverage (cheapest to priciest tier); two-tier products keep the full product range.
insert into CoverageLevel (policyTypeID, levelName, description, rateFactor, sortOrder, minCoverage, maxCoverage)
select pt.policyTypeID, v.levelName, v.description, v.rateFactor, v.sortOrder,
       pt.minCoverage,
       pt.maxCoverage * case when count(*) over (partition by v.typeName) = 3
                             then case v.sortOrder when 1 then 0.5 when 2 then 1.0 else 2.0 end
                             else 1.0 end
from (values
    -- AUTO
    ('Auto', 'Liability Only', 'The legal minimum. Pays for injuries and damage you cause to other people and their property in an accident. Does not pay to repair your own car.', 0.60, 1),
    ('Auto', 'Full Coverage', 'Everything in Liability Only, plus repairs to your own car after a collision and damage from theft, fire, vandalism, weather or hitting an animal (subject to a deductible).', 1.00, 2),
    ('Auto', 'Full Coverage Premium', 'Our most complete protection. Everything in Full Coverage with a lower deductible, plus a rental car while yours is in the shop, roadside assistance and coverage for drivers with no insurance.', 1.50, 3),

    -- MOTORCYCLE
    ('Motorcycle', 'Liability Only', 'The legal minimum. Pays for injuries and damage you cause to others while riding. Does not cover your own motorcycle.', 0.60, 1),
    ('Motorcycle', 'Full Coverage', 'Liability plus repair or replacement of your motorcycle after a crash, theft, fire or vandalism (subject to a deductible).', 1.00, 2),
    ('Motorcycle', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, plus protection for your helmet, riding gear and accessories, and roadside assistance and towing.', 1.50, 3),

    -- HOME
    ('Home', 'Dwelling Only', 'Covers the structure of your house (walls, roof, floors) against fire, storms and other listed events. Does not cover your belongings or living costs.', 0.70, 1),
    ('Home', 'Full Coverage', 'Covers the structure and your personal belongings, plus liability if someone is hurt on your property (subject to a deductible).', 1.00, 2),
    ('Home', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, higher limits on valuables like jewelry and electronics, replacement at today''s cost, and hotel costs if your home becomes unlivable.', 1.50, 3),

    -- RENTERS
    ('Renters', 'Belongings Only', 'Covers your personal belongings (furniture, clothes, electronics) if they are stolen or damaged by fire or other listed events.', 0.70, 1),
    ('Renters', 'Full Coverage', 'Covers your belongings plus liability if you accidentally injure a guest or damage the rental unit (subject to a deductible).', 1.00, 2),
    ('Renters', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, replacement at today''s cost instead of depreciated value, higher limits on valuables, and hotel costs if your rental becomes unlivable.', 1.50, 3),

    -- HEALTH
    ('Health', 'Bronze', 'Lowest monthly price, highest out-of-pocket costs. Best if you are healthy and want protection from major medical bills.', 0.70, 1),
    ('Health', 'Silver', 'A balance of monthly price and out-of-pocket costs. Covers doctor visits, prescriptions and hospital stays with moderate deductibles.', 1.00, 2),
    ('Health', 'Gold', 'Highest monthly price, lowest out-of-pocket costs. Low deductibles and copays, best if you expect regular care or want the most predictable costs.', 1.70, 3),

    -- LIFE
    ('Life', 'Term Life', 'Pays your beneficiaries if you pass away during the policy term. Lower cost, no cash value, and coverage ends when the term ends.', 1.00, 1),
    ('Life', 'Whole Life', 'Lifelong protection that never expires as long as premiums are paid, and builds cash value over time that you can borrow against.', 2.50, 2),

    -- PET
    ('Pet', 'Accident Only', 'Covers vet bills for accidents such as broken bones, swallowed objects and bites. Does not cover illness or routine care.', 0.70, 1),
    ('Pet', 'Accident & Illness', 'Covers accidents plus illnesses like infections, allergies, cancer and digestive problems. Does not cover routine checkups.', 1.00, 2),
    ('Pet', 'Comprehensive', 'Covers accidents and illnesses plus routine care like checkups, vaccinations, dental cleanings and flea/tick prevention.', 1.50, 3),

    -- TRAVEL
    ('Travel', 'Trip Cancellation Only', 'Reimburses your prepaid, non-refundable trip costs if you have to cancel for a covered reason such as illness or a family emergency.', 0.60, 1),
    ('Travel', 'Full Coverage', 'Trip cancellation plus emergency medical care while abroad, trip interruption, and delayed or lost baggage.', 1.00, 2),
    ('Travel', 'Full Coverage Premium', 'Everything in Full Coverage with higher limits, cancel-for-any-reason reimbursement, emergency medical evacuation, and 24/7 travel assistance.', 1.50, 3)
) as v(typeName, levelName, description, rateFactor, sortOrder)
join PolicyType pt on pt.typeName = v.typeName;
go


-- ============================================================
-- Premium function (needs the tables above)
-- ============================================================

-- Monthly premium = coverage x base rate x age factor x level factor / 12.
-- Returns NULL if the level is not part of the product or the amount is outside that level's range.
create or alter function dbo.calculatePremium
(
    @policyTypeID    int,
    @coverageLevelID int,
    @coverageAmount  decimal(12, 2),
    @customerDOB     date
)
returns decimal(10, 2)
as
begin
    declare @baseRate      decimal(6, 4),
            @minCoverage   decimal(12, 2),
            @maxCoverage   decimal(12, 2),
            @factorUnder25 decimal(4, 2),
            @factor25to64  decimal(4, 2),
            @factor65plus  decimal(4, 2),
            @levelFactor   decimal(4, 2);

    select @baseRate      = pt.baseRate,
           @minCoverage   = cl.minCoverage,
           @maxCoverage   = cl.maxCoverage,
           @factorUnder25 = pt.factorUnder25,
           @factor25to64  = pt.factor25to64,
           @factor65plus  = pt.factor65plus,
           @levelFactor   = cl.rateFactor
    from PolicyType pt
    join CoverageLevel cl on cl.policyTypeID = pt.policyTypeID
    where pt.policyTypeID = @policyTypeID
      and cl.coverageLevelID = @coverageLevelID;   -- level must belong to this product

    if @baseRate is null or @coverageAmount < @minCoverage or @coverageAmount > @maxCoverage
        return null;

    declare @today date = dbo.businessToday();
    declare @age int = datediff(year, @customerDOB, @today)
        - case when dateadd(year, datediff(year, @customerDOB, @today), @customerDOB) > @today then 1 else 0 end;

    declare @ageFactor decimal(4, 2) =
        case when @age < 25 then @factorUnder25
             when @age >= 65 then @factor65plus
             else @factor25to64 end;

    return round(@coverageAmount * @baseRate * @ageFactor * @levelFactor / 12, 2);
end
go


-- ============================================================
-- Triggers
-- ============================================================

-- After a policy is inserted, builds its payments: 12 monthly payments, or one discounted payment on the Yearly plan.
-- Each payment gets a random 10-digit number.
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


-- When a policy is cancelled, marks its unpaid payments Cancelled. Payments already paid stay as history.
create or alter trigger cancelPayments
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
go


-- ============================================================
-- Procedures: customer accounts
-- ============================================================

-- Registers a customer (proper-cases the name, checks email and age) and returns a random 9-digit customerID.
create or alter procedure customer_Create
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
		if @customerDOB > dateadd(year, -18, dbo.businessToday())
			throw 50003, 'you must be at least 18 years old to create an account.', 1;

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
go


-- Lists all customers without password hashes.
create or alter procedure get_AllCustomers
as
begin
    set nocount on;

    select customerID, firstName, lastName, customerDOB, customerEmail, customerPhone, isActive
    from Customer
    order by lastName, firstName;
end
go


-- Returns one customer's profile; never returns the password hash.
create or alter procedure get_CustomerByID
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
go


-- Login lookup by email: returns the hash, active flag, role and must-change-password flag that go into the token.
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


-- Saves a new (already hashed) password and clears the must-change-password flag.
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


-- Returns the stored hash so the API can verify the current password.
create or alter procedure customer_GetPasswordHash
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
go


-- Updates a customer's email and phone, blocking an email that belongs to someone else.
create or alter procedure customer_UpdateContactInfo
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
go


-- Reactivates a deactivated account (used by the admin).
create or alter procedure customer_Reactivate
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
go


-- Customer closes their own account. Blocked while they have an active policy, an open claim or an overdue payment.
create or alter procedure customer_Deactivate
(
    @customerID int
)
as
begin
    set nocount on;

    begin try
        declare @today date = dbo.businessToday();

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
go


-- ============================================================
-- Procedures: catalog, quotes and policies
-- ============================================================

-- Flat list of every product and its coverage levels (with ranges) for the buy form; the API groups it.
create or alter procedure get_PolicyCatalog
as
begin
    set nocount on;

    select pt.policyTypeID, pt.typeName,
           cl.coverageLevelID, cl.levelName, cl.description,
           cl.minCoverage, cl.maxCoverage, cl.sortOrder
    from PolicyType pt
    join CoverageLevel cl on cl.policyTypeID = pt.policyTypeID
    order by pt.typeName, cl.sortOrder;
end
go


-- Shows the monthly and yearly price for a product, level and amount without saving anything.
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


-- Returns one of a customer's quotes with its display status (Active, Expired or Accepted).
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


-- Saves a quote (what "Get quote" calls). An identical open quote is refreshed instead of duplicated.
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


-- Lists a customer's own quotes, hiding the ones they removed.
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


-- Removes a quote softly by marking it Dismissed; quotes already used to buy a policy stay as history.
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


-- Buys a policy from a saved quote at the stored price, and marks the quote Accepted, all in one transaction.
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


-- Buys a policy directly, recalculating the price on the server. One current policy per product per customer.
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


-- Changes a policy's level and/or amount and reprices unpaid payments.
-- Blocked by any overdue payment or by a yearly plan that is already paid.
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


-- Cancels a policy. Blocked by an open claim or any overdue payment; the cancelPayments trigger voids unpaid payments.
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


-- A customer's policies with level, payment plan, balance figures and a flag for overdue payments.
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


-- ============================================================
-- Procedures: payments
-- ============================================================

-- A customer's payment history with live late fees and an Overdue display status.
create or alter procedure get_CustomerPayments
(
    @customerID int
)
as
begin
    set nocount on;

    declare @today date = dbo.businessToday();

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
go


-- Pays the oldest unpaid payment on a policy (simulated), stores the late fee and returns a receipt row.
create or alter procedure pay_Payment
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
            paidDate = dbo.businessNow(),
            lateFee = dbo.calculateLateFee(dueDate, amount, dbo.businessToday())
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
go


-- ============================================================
-- Procedures: claims
-- ============================================================

-- Files a claim on an active policy after checking the incident date and amount; returns a random claim number.
create or alter procedure submit_Claim
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
        declare @today date = dbo.businessToday();
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
go


-- Lists a customer's own claims.
create or alter procedure get_CustomerClaims
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
go


-- Withdraws a claim that is still Submitted or Under Review.
create or alter procedure withdraw_Claim
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
            resolvedDate = dbo.businessToday()
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
go


-- Older claim status workflow (Submitted, Under Review, Approved or Denied, Closed).
-- The admin screen uses admin_DecideClaim instead.
create or alter procedure update_ClaimStatus
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
                                  then dbo.businessToday() else resolvedDate end
        where claimID = @claimID;
    end try
    begin catch
        throw;
    end catch
end
go


-- ============================================================
-- Procedures: admin
-- ============================================================

-- Lists customers with their active policies, open claims and overdue payments (the admin account is excluded).
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


-- Admin edits a customer's name and date of birth, using the same validation as registration.
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


-- Admin deactivates a customer. Blocked by an active policy, open claim or overdue payment, and never applies to the admin.
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


-- Stores a hashed temporary password and forces the customer to choose a new one at their next login.
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


-- Every claim with its customer and policy details, open claims first.
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


-- Approves (with an amount) or denies (with a required reason) an open claim.
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


-- Creates a new product and its coverage levels from JSON in one transaction, validating names, rates and ranges.
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


-- Every payment with customer contact details and live late fees, overdue payments first.
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


-- Every saved quote with its customer, newest first.
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


-- Each product with its level names and how many customers currently hold it.
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


-- The customers (with their policy details) who currently hold one product.
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


-- ============================================================
-- Creating the admin account
-- ============================================================

-- There is no admin until you make one. Register a normal account in the app, put that email below,
-- and run the update once. Only one admin can exist (see ux_Customer_oneAdmin).
-- update Customer set [role] = 'Admin' where customerEmail = 'your-admin-email@example.com';
-- select customerID, customerEmail, [role] from Customer where [role] = 'Admin';