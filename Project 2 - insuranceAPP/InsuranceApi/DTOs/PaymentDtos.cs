// Dtos for payments tables in DB, used for API responses.
namespace InsuranceApi.Dtos;

// matches the columns get_CustomerPayments returns
public class PaymentDto
{
    public int PaymentID { get; set; }
    public int PolicyID { get; set; }
    public string TypeName { get; set; } = "";
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public decimal LateFee { get; set; }
    public decimal TotalAmount { get; set; }
    public DateTime? PaidDate { get; set; }      // null until the payment is made
    public string PaymentStatus { get; set; } = "";
    public string DisplayStatus { get; set; } = "";   // Pending, Paid, Cancelled or Overdue
    public int DaysOverdue { get; set; }
}

// matches the receipt row pay_Payment returns
public class PaymentReceiptDto
{
    public int PaymentID { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public decimal LateFee { get; set; }
    public decimal TotalCharged { get; set; }
    public DateTime PaidDate { get; set; }
}