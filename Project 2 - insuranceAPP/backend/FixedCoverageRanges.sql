-- Rule: 3-tier products = half / 1x / double the product's max
--       (Liability Only = 0.5x, Full Coverage = 1x, Full Coverage Premium = 2x; same for Bronze/Silver/Gold and the Pet tiers).
--       Life (2 levels) keeps the product range for both.
-- Run the steps ONE AT A TIME, in order. Run policy_revamp.sql first.

-- step 1: add the columns and fill them in
alter table CoverageLevel add minCoverage decimal(12, 2) null, maxCoverage decimal(12, 2) null;
go

update cl
set minCoverage = pt.minCoverage,
    maxCoverage = pt.maxCoverage *
        case when (select count(*) from CoverageLevel x where x.policyTypeID = cl.policyTypeID) = 3
             then case cl.sortOrder when 1 then 0.5 when 2 then 1.0 else 2.0 end
             else 1.0 end
from CoverageLevel cl
join PolicyType pt on pt.policyTypeID = cl.policyTypeID;
go

alter table CoverageLevel alter column minCoverage decimal(12, 2) not null;
alter table CoverageLevel alter column maxCoverage decimal(12, 2) not null;
alter table CoverageLevel add constraint ck_CoverageLevel_range check (minCoverage > 0 and maxCoverage >= minCoverage);
go

select pt.typeName, cl.levelName, cl.minCoverage, cl.maxCoverage
from CoverageLevel cl join PolicyType pt on pt.policyTypeID = cl.policyTypeID
order by pt.typeName, cl.sortOrder;
go


-- step 2: premium function checks the LEVEL's range instead of the product's
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


-- step 3: the catalog now returns each level's range
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