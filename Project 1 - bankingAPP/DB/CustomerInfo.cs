namespace Project_1___bankingAPP.DB;

public class CustomerInfo
{
    public int CustAccNo { get; set; }
    public string CustName { get; set; } = "";
    public string CustAccBranchLoc { get; set; } = "";
    public string CustuName { get; set; } = "";
    public string CustPwd { get; set; } = "";
    public bool CustActive { get; set; }
    public List<Account> Accounts { get; set; } = new List<Account>();
}