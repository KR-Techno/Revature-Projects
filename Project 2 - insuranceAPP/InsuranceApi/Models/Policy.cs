using System;
using System.Collections.Generic;

namespace InsuranceApi.Models;

public partial class Policy
{
    public int PolicyId { get; set; }

    public int CustomerId { get; set; }

    public int PolicyTypeId { get; set; }

    public decimal CoverageAmount { get; set; }

    public decimal MonthlyPremium { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly EndDate { get; set; }

    public string PolicyStatus { get; set; } = null!;

    public virtual ICollection<Claim> Claims { get; set; } = new List<Claim>();

    public virtual Customer Customer { get; set; } = null!;

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();

    public virtual PolicyType PolicyType { get; set; } = null!;
}
