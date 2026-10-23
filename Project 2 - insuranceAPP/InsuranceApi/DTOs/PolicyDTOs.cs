// DTO for all POLICY information
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

// what Angular sends for an unsaved price preview (change-coverage dialog): no price, by design
public class PolicyRequestDto
{
    [Range(1, int.MaxValue)]
    public int PolicyTypeID { get; set; }

    // which tier of that product (e.g. Liability Only / Full Coverage / Full Coverage Premium)
    [Range(1, int.MaxValue)]
    public int CoverageLevelID { get; set; }

    [Range(0.01, 100000000)]
    public decimal CoverageAmount { get; set; }
}

// one flat row from get_PolicyCatalog: a product joined with one of its levels
// (only used inside the API; the repository groups these rows into PolicyTypeDto)
public class CatalogRowDto
{
    public int PolicyTypeID { get; set; }
    public string TypeName { get; set; } = "";
    public int CoverageLevelID { get; set; }
    public string LevelName { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal MinCoverage { get; set; }   // the range belongs to the level
    public decimal MaxCoverage { get; set; }
    public byte SortOrder { get; set; }   // tinyint in SQL, so byte here (int would fail to cast)
}

// what Angular receives: a product with its levels nested inside
// each level has its own allowed coverage range (a premium tier can cover more than a basic one)
public class CoverageLevelDto
{
    public int CoverageLevelID { get; set; }
    public string LevelName { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal MinCoverage { get; set; }
    public decimal MaxCoverage { get; set; }
}

// DTO for POLICY TYPES information, grabbing only what customers need to see, not the entire table from the DB.
// (moved here from PolicyTypeDto.cs; the coverage range now lives on each level instead of the product)
public class PolicyTypeDto
{
    public int PolicyTypeID { get; set; }
    public string TypeName { get; set; } = "";
    public List<CoverageLevelDto> Levels { get; set; } = [];
}

// matches the columns get_quotePolicy returns
// Remember to delete if an actual quote table gets implemented in the DB
public class QuoteDto
{
    public string TypeName { get; set; } = "";
    public string LevelName { get; set; } = "";
    public decimal CoverageAmount { get; set; }
    public decimal MonthlyPremium { get; set; }
    public decimal YearlyTotal { get; set; }                // the 12 monthly payments added up
    public decimal YearlyDiscountedTotal { get; set; }      // the one-time price if paying yearly
}

// matches the columns get_CustomerPolicies returns
public class PolicyDto
{
    public int PolicyID { get; set; }
    public int PolicyTypeID { get; set; }
    public string TypeName { get; set; } = "";
    public int CoverageLevelID { get; set; }
    public string LevelName { get; set; } = "";
    public decimal CoverageAmount { get; set; }
    public decimal MonthlyPremium { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string PolicyStatus { get; set; } = "";
    public string DisplayStatus { get; set; } = "";
    public string PaymentPlan { get; set; } = "Monthly";
    public decimal PaidSoFar { get; set; }                  // payments already made
    public decimal RemainingBalance { get; set; }           // payments still to make (late fees are shown on the Payments page)
    public decimal PolicyTotal { get; set; }                // paid so far + remaining
    public DateOnly? NextDueDate { get; set; }              // the next unpaid payment's due date (null when nothing is left)
    public bool HasOverduePayment { get; set; }             // true when the customer owes an overdue payment (blocks changing coverage and cancelling)
}

public class PolicyCreatedDto
{
    public int PolicyID { get; set; }
}

// ChangeCoverage DTOs take care of updating customer's policies per their request
// (the level, the amount, or both)
public class ChangeCoverageRequestDto
{
    [Range(1, int.MaxValue)]
    public int NewCoverageLevelID { get; set; }

    [Range(0.01, 100000000)]
    public decimal NewCoverageAmount { get; set; }
}

// matches the columns update_PolicyCoverage returns
public class CoverageChangedDto
{
    public int PolicyID { get; set; }
    public int CoverageLevelID { get; set; }
    public string LevelName { get; set; } = "";
    public decimal CoverageAmount { get; set; }
    public decimal MonthlyPremium { get; set; }
}
