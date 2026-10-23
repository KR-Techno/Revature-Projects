using System;
using System.Collections.Generic;

namespace InsuranceApi.Models;

public partial class PolicyType
{
    public int PolicyTypeId { get; set; }

    public string TypeName { get; set; } = null!;

    public decimal BaseRate { get; set; }

    public decimal MinCoverage { get; set; }

    public decimal MaxCoverage { get; set; }

    public decimal FactorUnder25 { get; set; }

    public decimal Factor25to64 { get; set; }

    public decimal Factor65plus { get; set; }

    public virtual ICollection<Policy> Policies { get; set; } = new List<Policy>();
}
