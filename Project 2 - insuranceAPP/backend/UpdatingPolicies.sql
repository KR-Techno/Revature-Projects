 
 
-- Full Coverage Premium" tiers, one set per product)
-- rateFactor multiplies the price: 0.60 = 40% cheaper, 1.5 = 50% pricier.
-- ------------------------------------------------------------
create table CoverageLevel
(
    coverageLevelID int identity(1, 1),
    policyTypeID    int            not null,
    levelName       nvarchar(40)   not null,
    description     nvarchar(400)  not null,
    rateFactor      decimal(4, 2)  not null,
    sortOrder       tinyint        not null,   -- 1 = cheapest tier, shown first
 
    constraint pk_CoverageLevel primary key clustered (coverageLevelID),
    constraint fk_CoverageLevel_PolicyType foreign key (policyTypeID) references PolicyType (policyTypeID),
    constraint unq_CoverageLevel_name unique (policyTypeID, levelName),
    constraint ck_CoverageLevel_rateFactor check (rateFactor > 0)
);
go

update CoverageLevel set rateFactor = 1.50 where levelName = 'Full Coverage Premium';
update CoverageLevel set rateFactor = 1.70
  where levelName = 'Gold';
update CoverageLevel set rateFactor = 1.50
  where levelName = 'Comprehensive';
 
 
-- ------------------------------------------------------------
-- step 3: add the 4 new products
-- baseRate is a YEARLY rate on the coverage amount.
-- (Pet "coverage" = yearly benefit limit, Travel = max trip benefit,
--  Renters = belongings value, Motorcycle = bike value/liability limit)
-- ------------------------------------------------------------
insert into PolicyType (typeName, baseRate, minCoverage, maxCoverage, factorUnder25, factor25to64, factor65plus)
values
    ('Motorcycle', 0.0120, 10000.00,  75000.00, 2.20, 1.00, 1.25),
    ('Renters',    0.0050,  5000.00, 100000.00, 1.00, 1.00, 1.05),
    ('Pet',        0.0600,  2000.00,  20000.00, 1.00, 1.00, 1.00),
    ('Travel',     0.0300,  1000.00,  50000.00, 1.00, 1.00, 1.50);
go
 
 
-- ------------------------------------------------------------
-- step 4: the coverage levels + their plain-English descriptions
-- (edit the wording freely - this is what customers read)
-- ------------------------------------------------------------
insert into CoverageLevel (policyTypeID, levelName, description, rateFactor, sortOrder)
select pt.policyTypeID, v.levelName, v.description, v.rateFactor, v.sortOrder
from (values
    -- AUTO
    ('Auto', 'Liability Only', 'The legal minimum. Pays for injuries and damage you cause to other people and their property in an accident. Does not pay to repair your own car.', 0.60, 1),
    ('Auto', 'Full Coverage', 'Everything in Liability Only, plus repairs to your own car after a collision and damage from theft, fire, vandalism, weather or hitting an animal (subject to a deductible).', 1.00, 2),
    ('Auto', 'Full Coverage Premium', 'Our most complete protection. Everything in Full Coverage with a lower deductible, plus a rental car while yours is in the shop, roadside assistance and coverage for drivers with no insurance.', 1.35, 3),
 
    -- MOTORCYCLE
    ('Motorcycle', 'Liability Only', 'The legal minimum. Pays for injuries and damage you cause to others while riding. Does not cover your own motorcycle.', 0.60, 1),
    ('Motorcycle', 'Full Coverage', 'Liability plus repair or replacement of your motorcycle after a crash, theft, fire or vandalism (subject to a deductible).', 1.00, 2),
    ('Motorcycle', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, plus protection for your helmet, riding gear and accessories, and roadside assistance and towing.', 1.35, 3),
 
    -- HOME
    ('Home', 'Dwelling Only', 'Covers the structure of your house (walls, roof, floors) against fire, storms and other listed events. Does not cover your belongings or living costs.', 0.70, 1),
    ('Home', 'Full Coverage', 'Covers the structure and your personal belongings, plus liability if someone is hurt on your property (subject to a deductible).', 1.00, 2),
    ('Home', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, higher limits on valuables like jewelry and electronics, replacement at today''s cost, and hotel costs if your home becomes unlivable.', 1.30, 3),
 
    -- RENTERS
    ('Renters', 'Belongings Only', 'Covers your personal belongings (furniture, clothes, electronics) if they are stolen or damaged by fire or other listed events.', 0.70, 1),
    ('Renters', 'Full Coverage', 'Covers your belongings plus liability if you accidentally injure a guest or damage the rental unit (subject to a deductible).', 1.00, 2),
    ('Renters', 'Full Coverage Premium', 'Everything in Full Coverage with a lower deductible, replacement at today''s cost instead of depreciated value, higher limits on valuables, and hotel costs if your rental becomes unlivable.', 1.30, 3),
 
    -- HEALTH
    ('Health', 'Bronze', 'Lowest monthly price, highest out-of-pocket costs. Best if you are healthy and want protection from major medical bills.', 0.70, 1),
    ('Health', 'Silver', 'A balance of monthly price and out-of-pocket costs. Covers doctor visits, prescriptions and hospital stays with moderate deductibles.', 1.00, 2),
    ('Health', 'Gold', 'Highest monthly price, lowest out-of-pocket costs. Low deductibles and copays, best if you expect regular care or want the most predictable costs.', 1.40, 3),
 
    -- LIFE
    ('Life', 'Term Life', 'Pays your beneficiaries if you pass away during the policy term. Lower cost, no cash value, and coverage ends when the term ends.', 1.00, 1),
    ('Life', 'Whole Life', 'Lifelong protection that never expires as long as premiums are paid, and builds cash value over time that you can borrow against.', 2.50, 2),
 
    -- PET
    ('Pet', 'Accident Only', 'Covers vet bills for accidents such as broken bones, swallowed objects and bites. Does not cover illness or routine care.', 0.70, 1),
    ('Pet', 'Accident & Illness', 'Covers accidents plus illnesses like infections, allergies, cancer and digestive problems. Does not cover routine checkups.', 1.00, 2),
    ('Pet', 'Comprehensive', 'Covers accidents and illnesses plus routine care like checkups, vaccinations, dental cleanings and flea/tick prevention.', 1.30, 3),
 
    -- TRAVEL
    ('Travel', 'Trip Cancellation Only', 'Reimburses your prepaid, non-refundable trip costs if you have to cancel for a covered reason such as illness or a family emergency.', 0.60, 1),
    ('Travel', 'Full Coverage', 'Trip cancellation plus emergency medical care while abroad, trip interruption, and delayed or lost baggage.', 1.00, 2),
    ('Travel', 'Full Coverage Premium', 'Everything in Full Coverage with higher limits, cancel-for-any-reason reimbursement, emergency medical evacuation, and 24/7 travel assistance.', 1.50, 3)
) as v(typeName, levelName, description, rateFactor, sortOrder)
join PolicyType pt on pt.typeName = v.typeName;
go
 
select pt.typeName, cl.levelName, cl.rateFactor
from CoverageLevel cl join PolicyType pt on pt.policyTypeID = cl.policyTypeID
order by pt.typeName, cl.sortOrder;
go
 
 
-- ------------------------------------------------------------
-- step 5: Policy gets its coverage level (table is empty after step 1)
-- ------------------------------------------------------------
alter table Policy add coverageLevelID int not null;
alter table Policy add constraint fk_Policy_CoverageLevel
    foreign key (coverageLevelID) references CoverageLevel (coverageLevelID);
go
 
 
-- ------------------------------------------------------------
-- step 6: premium function now includes the level factor
-- monthly = coverage x baseRate x ageFactor x levelFactor / 12
-- returns NULL if the type/level don't match or coverage is out of range
-- ------------------------------------------------------------
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
           @minCoverage   = pt.minCoverage,
           @maxCoverage   = pt.maxCoverage,
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
 
 
-- ------------------------------------------------------------
-- step 7: the catalog (products + their levels) for the buy form
-- one flat list; the API groups it into product -> levels
-- ------------------------------------------------------------
create or alter procedure get_PolicyCatalog
as
begin
    set nocount on;
 
    select pt.policyTypeID, pt.typeName, pt.minCoverage, pt.maxCoverage,
           cl.coverageLevelID, cl.levelName, cl.description, cl.sortOrder
    from PolicyType pt
    join CoverageLevel cl on cl.policyTypeID = pt.policyTypeID
    order by pt.typeName, cl.sortOrder;
end
go
 
drop procedure if exists get_PolicyTypes;   -- replaced by get_PolicyCatalog
go
 
 
-- ------------------------------------------------------------
-- step 8: quote
-- ------------------------------------------------------------
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
               cast(@monthlyPremium * 12 as decimal(12, 2)) as yearlyTotal
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
 
 
-- ------------------------------------------------------------
-- step 9: buy a policy (one current policy per product per customer)
-- ------------------------------------------------------------
create or alter procedure create_Policy
(
    @customerID      int,
    @policyTypeID    int,
    @coverageLevelID int,
    @coverageAmount  decimal(12, 2),
    @policyID        int output
)
as
begin
    set nocount on;
 
    begin try
        declare @dob date;
        declare @monthlyPremium decimal(10, 2);
        declare @startDate date = dbo.businessToday();
 
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
 
        insert into Policy (policyID, customerID, policyTypeID, coverageLevelID, coverageAmount, monthlyPremium, startDate, endDate)
        values (@newID, @customerID, @policyTypeID, @coverageLevelID, @coverageAmount, @monthlyPremium,
                @startDate, dateadd(year, 1, @startDate));
 
        set @policyID = @newID;
    end try
    begin catch
        throw;
    end catch
end
go
 
 
-- ------------------------------------------------------------
-- step 10: change coverage (level and/or amount; upgrade or downgrade)
-- unpaid (Pending) payments are repriced; paid ones stay as history.
-- returns the new numbers so the screen can update.
-- ------------------------------------------------------------
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
 
        declare @dob date, @typeID int, @oldLevel int, @oldAmount decimal(12, 2);
        declare @newPremium decimal(10, 2);
 
        select @dob = c.customerDOB,
               @typeID = p.policyTypeID,
               @oldLevel = p.coverageLevelID,
               @oldAmount = p.coverageAmount
        from Policy p
        join Customer c on c.customerID = p.customerID
        where p.policyID = @policyID
          and p.customerID = @customerID
          and p.policyStatus = 'Active'
          and c.isActive = 1;
 
        if @typeID is null
            throw 50026, 'policy not found, or it can no longer be changed.', 1;
 
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
        set amount = @newPremium
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
 
 
-- ------------------------------------------------------------
-- step 11: list a customer's policies (now with the level)
-- ------------------------------------------------------------
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
                else p.policyStatus end as displayStatus
    from Policy p
    join PolicyType pt on pt.policyTypeID = p.policyTypeID
    join CoverageLevel cl on cl.coverageLevelID = p.coverageLevelID
    where p.customerID = @customerID
    order by p.startDate desc;
end
go