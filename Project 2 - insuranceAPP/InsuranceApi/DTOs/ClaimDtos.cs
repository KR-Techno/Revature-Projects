// DTOs for Claim-related requests and responses in the Insurance API
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

// Only retrieves the fields needed for the API response, not the entire Claim entity.
public class SubmitClaimRequestDto
{
    [Range(1, int.MaxValue)]
    public int PolicyID { get; set; }

    public DateOnly IncidentDate { get; set; }

    [Required, StringLength(1000)]
    public string ClaimDescription { get; set; } = "";

    [Range(0.01, 100000000)]
    public decimal ClaimAmount { get; set; }
}

// Retrieves ClaimId from DB
public class ClaimCreatedDto
{
    public int ClaimID { get; set; }
}

// matches the columns get_CustomerClaims returns
public class ClaimDto
{
    public int ClaimID { get; set; }
    public int PolicyID { get; set; }
    public string TypeName { get; set; } = "";
    public DateOnly IncidentDate { get; set; }
    public DateOnly SubmittedDate { get; set; }
    public string ClaimDescription { get; set; } = "";
    public decimal ClaimAmount { get; set; }
    public string ClaimStatus { get; set; } = "";
    public decimal? ApprovedAmount { get; set; }    // null until the claim is approved
    public DateOnly? ResolvedDate { get; set; }     // null until it is decided or withdrawn
    public string? DecisionNote { get; set; }       // null unless the reviewer wrote one
}