using System;
using System.Collections.Generic;

namespace InsuranceApi.Models;

public partial class Payment
{
    public int PaymentId { get; set; }

    public int PolicyId { get; set; }

    public DateOnly DueDate { get; set; }

    public decimal Amount { get; set; }

    public DateTime? PaidDate { get; set; }

    public string PaymentStatus { get; set; } = null!;

    public decimal LateFee { get; set; }

    public virtual Policy Policy { get; set; } = null!;
}
