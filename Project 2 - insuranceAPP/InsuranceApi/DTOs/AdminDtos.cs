// DTOs for the ADMIN endpoints
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

// matches the columns admin_GetCustomers returns (never includes the password hash)
public class AdminCustomerDto
{
    public int CustomerID { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateOnly CustomerDOB { get; set; }
    public string CustomerEmail { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public bool IsActive { get; set; }
    public int ActivePolicies { get; set; }
    public int OpenClaims { get; set; }
    public int OverduePayments { get; set; }   // unpaid payments past their due date
}

// matches the columns admin_GetPayments returns: one payment, with the customer's contact details for following up
public class AdminPaymentDto
{
    public int PaymentID { get; set; }
    public int PolicyID { get; set; }
    public int CustomerID { get; set; }
    public string CustomerName { get; set; } = "";
    public string CustomerEmail { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public string TypeName { get; set; } = "";
    public string LevelName { get; set; } = "";
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public decimal LateFee { get; set; }
    public decimal TotalAmount { get; set; }                // amount + late fee
    public DateTime? PaidDate { get; set; }                 // null until paid
    public string PaymentStatus { get; set; } = "";         // stored: Pending / Paid / Cancelled
    public string DisplayStatus { get; set; } = "";         // shown: adds Overdue
    public int DaysOverdue { get; set; }
}

// the admin re-enters their own password for sensitive actions
public class AdminPasswordRequestDto
{
    [Required] public string Password { get; set; } = "";
}

// what the admin can change on a customer: name and date of birth (the customer edits email/phone themselves)
public class AdminUpdateCustomerRequestDto
{
    [Required] public string Password { get; set; } = "";
    [Required, StringLength(50)] public string FirstName { get; set; } = "";
    [Required, StringLength(50)] public string LastName { get; set; } = "";
    public DateOnly DateOfBirth { get; set; }
}

// matches the columns admin_GetClaims returns
public class AdminClaimDto
{
    public int ClaimID { get; set; }
    public int PolicyID { get; set; }
    public int CustomerID { get; set; }
    public string CustomerName { get; set; } = "";
    public string TypeName { get; set; } = "";
    public string LevelName { get; set; } = "";
    public DateOnly IncidentDate { get; set; }
    public DateOnly SubmittedDate { get; set; }
    public string ClaimDescription { get; set; } = "";
    public decimal ClaimAmount { get; set; }
    public string ClaimStatus { get; set; } = "";
    public decimal? ApprovedAmount { get; set; }
    public DateOnly? ResolvedDate { get; set; }
    public string? DecisionNote { get; set; }
}

// the admin's decision on a claim; the approved amount only applies when the decision is Approved
public class DecideClaimRequestDto
{
    [Required, RegularExpression("^(Approved|Denied)$", ErrorMessage = "Decision must be Approved or Denied.")]
    public string Decision { get; set; } = "";

    [Range(0, 100000000)]
    public decimal? ApprovedAmount { get; set; }

    [StringLength(500)]
    public string? DecisionNote { get; set; }
}

// creating a new policy product with its coverage levels
public class NewCoverageLevelDto
{
    [Required, StringLength(40)] public string LevelName { get; set; } = "";
    [Required, StringLength(400)] public string Description { get; set; } = "";
    [Range(0.01, 9.99)] public decimal RateFactor { get; set; }
    [Range(1, 999999999999)] public decimal MinCoverage { get; set; }
    [Range(1, 999999999999)] public decimal MaxCoverage { get; set; }
}

public class CreatePolicyTypeRequestDto
{
    [Required] public string Password { get; set; } = "";
    [Required, StringLength(30)] public string TypeName { get; set; } = "";

    // yearly rate on the coverage amount: 0.0100 = 1% a year
    [Range(0.0001, 99.9999)] public decimal BaseRate { get; set; }
    [Range(0.01, 99.99)] public decimal FactorUnder25 { get; set; }
    [Range(0.01, 99.99)] public decimal Factor25to64 { get; set; }
    [Range(0.01, 99.99)] public decimal Factor65plus { get; set; }

    [Required, MinLength(1), MaxLength(5)]
    public List<NewCoverageLevelDto> Levels { get; set; } = [];
}

// the generated temporary password, shown to the admin once
public class TemporaryPasswordDto
{
    public string TemporaryPassword { get; set; } = "";
}

public class PolicyTypeCreatedDto
{
    public int PolicyTypeID { get; set; }
}
