namespace Project_1___bankingAPP.DB;

public class CheckbookRequest
{
    public int RequestId { get; set; }
    public int CustAccNo { get; set; }
    public DateTime RequestDate { get; set; }
    public DateTime? ResponseDate { get; set; }
    public string RequestStatus { get; set; } = "Pending";
}