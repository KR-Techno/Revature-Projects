using System;
using System.Collections.Generic;

namespace InsuranceApi.Models;

public partial class Claim
{
    public int ClaimId { get; set; }

    public int PolicyId { get; set; }

    public DateOnly IncidentDate { get; set; }

    public DateOnly SubmittedDate { get; set; }

    public string ClaimDescription { get; set; } = null!;

    public decimal ClaimAmount { get; set; }

    public string ClaimStatus { get; set; } = null!;

    public decimal? ApprovedAmount { get; set; }

    public DateOnly? ResolvedDate { get; set; }

    public string? DecisionNote { get; set; }

    public virtual Policy Policy { get; set; } = null!;
}
