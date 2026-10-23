// DTOs for saved QUOTES
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

// what Angular sends to get (and save) a quote: no price, by design
public class CreateQuoteRequestDto
{
    [Range(1, int.MaxValue)] public int PolicyTypeID { get; set; }
    [Range(1, int.MaxValue)] public int CoverageLevelID { get; set; }
    [Range(0.01, 100000000)] public decimal CoverageAmount { get; set; }
}

// buying from a saved quote: which way the customer will pay
// (only the plan is sent; the price comes from the saved quote in the database)
public class BuyQuoteRequestDto
{
    [Required, RegularExpression("^(Monthly|Yearly)$", ErrorMessage = "Payment plan must be Monthly or Yearly.")]
    public string PaymentPlan { get; set; } = "Monthly";
}

// matches the columns quote_Create / quote_GetByCustomer return
public class SavedQuoteDto
{
    public int QuoteID { get; set; }
    public int PolicyTypeID { get; set; }
    public string TypeName { get; set; } = "";
    public int CoverageLevelID { get; set; }
    public string LevelName { get; set; } = "";
    public decimal CoverageAmount { get; set; }
    public decimal MonthlyPremium { get; set; }
    public decimal YearlyTotal { get; set; }                // the 12 monthly payments added up
    public decimal YearlyDiscountedTotal { get; set; }      // the one-time price if paying yearly
    public DateOnly CreatedDate { get; set; }
    public DateOnly ExpiryDate { get; set; }                // 30 days after it was created
    public string QuoteStatus { get; set; } = "";      // stored: Open, Accepted, Dismissed
    public string DisplayStatus { get; set; } = "";    // shown: Active, Expired or Accepted (Expired is worked out from the date)
}

// matches the columns admin_GetQuotes returns: every customer's quotes, with who asked for them
public class AdminQuoteDto
{
    public int QuoteID { get; set; }
    public int CustomerID { get; set; }
    public string CustomerName { get; set; } = "";
    public string CustomerEmail { get; set; } = "";
    public string TypeName { get; set; } = "";
    public string LevelName { get; set; } = "";
    public decimal CoverageAmount { get; set; }
    public decimal MonthlyPremium { get; set; }
    public DateOnly CreatedDate { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public string QuoteStatus { get; set; } = "";
    public string DisplayStatus { get; set; } = "";
    public int? PolicyID { get; set; }                 // the policy bought from this quote, if any
}
