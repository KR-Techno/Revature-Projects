namespace Project_1___bankingAPP.DB;

public class Transaction
{
    public int TransactionId { get; set; }
    public int CustAccNo { get; set; }
    public string AcctType { get; set; } = "";
    public string TransactionType { get; set; } = "";
    public decimal Amount { get; set; }
    public DateTime TransactionDate { get; set; }
}