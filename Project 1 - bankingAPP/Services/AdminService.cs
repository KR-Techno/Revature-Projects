using Microsoft.EntityFrameworkCore;
using Project_1___bankingAPP.DB;

namespace Project_1___bankingAPP.Services;

public class AdminService
{
    private readonly BankingAppDbContext _db;

    public AdminService(BankingAppDbContext db)
    {
        _db = db;
    }

    public AdminInfo? ValidateLogin(string? username, string? password)
    {
        return _db.AdminInfos.FirstOrDefault(a => a.AdminuName == username  && a.AdminPwd == password);
    }

    public CustomerInfo? FindCustomerByUsername(string username)
    {
        return _db.CustomerInfos.FirstOrDefault(c => c.CustuName == username);
    }

    // Attempts to find customer using admin input, which can be either account num or username.
    // Tries to parse input as int, if succeeds tries to find customer through 'FindCustomerByAccNo'.
    // If fails, input is treated as username and customer is searched through 'FindCustomerByUserName'.
    public CustomerInfo? FindCustomer(string input)
    {
        if (int.TryParse(input, out int accNo))
        {
            return FindCustomerByAccNo(accNo);
        }

        return FindCustomerByUsername(input);
    }

    #region Validate Entries made by User
    // Establish bank branches that customer can bank at
    private static readonly string[] ValidBranches =
    {
        "New York", "Miami", "Los Angeles", "Las Vegas", "Hartford",
        "Dallas", "Phoenix", "Chicago", "Philadelphia", "Boston"
    };

    // count number of customers in Database
    public int GetCustomerCount()
    {
        return _db.CustomerInfos.Count();
    }

    public void ValidateCustomerName(string name)
    {
        if (name.Length < 2)
        {
            throw new ArgumentException("Customer name must be at least 2 characters long.");
        }
    }

    public void ValidatePassword(string password)
    {
        if (password.Length < 6)
        {
            throw new ArgumentException("Password must be at least 6 characters long.");
        }
    }

    public void ValidateBranch(string branchLoc)
    {
        if (!ValidBranches.Contains(branchLoc))
        {
            throw new ArgumentException($"'{branchLoc}' is not a valid branch location.");
        }
    }
    #endregion

    #region Create Account
    public CustomerInfo CreateCustomerWithAccount(string name, string branchLoc, string username, string password, string acctType)
    {
        if (name.Length < 2)
        {
            throw new ArgumentException("Customer name must be at least 2 characters long.");
        }
        if (password.Length < 6)
        {
            throw new ArgumentException("Password must be at least 6 characters long.");
        }
        if (!ValidBranches.Contains(branchLoc))
        {
            throw new ArgumentException($"'{branchLoc}' is not a valid branch location.");
        }
        if (acctType != "Checking" && acctType != "Savings" && acctType != "Loan")
        {
            throw new ArgumentException("A valid account type must be selected to create a customer.");
        }

        using var transaction = _db.Database.BeginTransaction();
        try
        {
            CustomerInfo newCustomer = new CustomerInfo
            {
                CustName = name,
                CustAccBranchLoc = branchLoc,
                CustuName = username,
                CustPwd = password,
                CustActive = true
            };
            _db.CustomerInfos.Add(newCustomer);
            _db.SaveChanges();

            Account newAccount = CreateAccount(newCustomer.CustAccNo, acctType);

            transaction.Commit();
            return newCustomer;
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public Account CreateAccount(int custAccNo, string acctType)
    {
        Account newAccount;

        switch (acctType)
        {
            case "Checking":
                newAccount = new Checking { CustAccNo = custAccNo, AcctType = "Checking", AcctBalance = 0};
                break;
            case "Savings":
                newAccount = new Savings { CustAccNo = custAccNo, AcctType = "Savings", AcctBalance = 0};
                break;
            case "Loan":
                newAccount = new Loan { CustAccNo = custAccNo, AcctType = "Loan", AcctBalance = 0};
                break;
            default:
                throw new ArgumentException($"'{acctType}' is not a valid account type. Please try again.");
        }

        _db.Accounts.Add(newAccount);
        _db.SaveChanges();

        return newAccount;
    }
    #endregion

    #region Delete Account
    public void DeleteCustomer(int custAccNo)
    {
        CustomerInfo? customer = _db.CustomerInfos.Include(c => c.Accounts)
            .FirstOrDefault(c => c.CustAccNo == custAccNo);

        if (customer == null)
        {
            throw new ArgumentException("No customer with that account number was found. Please try again.");
        }

        List<Transaction> transactions = _db.Transactions
            .Where(t => t.CustAccNo == custAccNo)
            .ToList();
        _db.Transactions.RemoveRange(transactions);
        _db.SaveChanges(); // commit the deletion of transactions

        _db.Accounts.RemoveRange(customer.Accounts);
        _db.CustomerInfos.Remove(customer);
        _db.SaveChanges(); // now customer should be able to be deleted
    }

    public void DeleteCustomerBankAccount(int custAccNo, string acctType)
    {
        Account? account = _db.Accounts
            .FirstOrDefault(a => a.CustAccNo == custAccNo && a.AcctType == acctType);

        if (account == null)
        {
            throw new ArgumentException($"No {acctType} account found for this customer.");
        }

        List<Transaction> transactions = _db.Transactions
            .Where(t => t.CustAccNo == custAccNo && t.AcctType == acctType)
            .ToList();
        _db.Transactions.RemoveRange(transactions);
        _db.SaveChanges(); // commit deletion of transactions

        _db.Accounts.Remove(account);
        _db.SaveChanges(); // now bank account should be deleted
    }
    #endregion

    #region Edit Account Details
    public void UpdateCustomerName(int custAccNo, string newName)
    {
        if (newName.Length < 2)
        {
            throw new ArgumentException("Customer name must be at least 2 characters long.");
        }

        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c=>c.CustAccNo == custAccNo);

        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        customer.CustName = newName;
        _db.SaveChanges();
    }

    public void UpdateCustomerUsername(int custAccNo, string newUsername)
    {
        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c=>c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        bool usernameTaken = _db.CustomerInfos.Any(c=>c.CustuName == newUsername && c.CustAccNo != custAccNo);
        if (usernameTaken)
        {
            throw new ArgumentException("That username is already in use.");
        }

        customer.CustuName = newUsername;
        _db.SaveChanges();
    }

    public void UpdateCustomerBranch(int custAccNo, string newBranch)
    {
        string[] validLoc = ValidBranches;

        if (!validLoc.Contains(newBranch))
        {
            throw new ArgumentException($"'{newBranch}' is not a valid branch location.");
        }

        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c=>c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        customer.CustAccBranchLoc = newBranch;
        _db.SaveChanges();
    }

    public void OverrideAccountBalance(int custAccNo, string acctType, decimal newBalance)
    {
        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c => c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        Account? account = _db.Accounts.FirstOrDefault(a=>a.CustAccNo == custAccNo && a.AcctType == acctType);
        if (account == null)
        {
            throw new ArgumentException($"No {acctType} account found for this customer.");
        }

        account.AcctBalance = newBalance;
        _db.SaveChanges();
    }

    public void SetCustomerActiveStatus(int custAccNo, bool isActive)
    {
        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c => c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }
        customer.CustActive = isActive;
        _db.SaveChanges();
    }
    #endregion

    #region Display Summary
    public (int totalCustomers, int activeCustomers, int inactiveCustomers,
            int totalAccounts, Dictionary<string, int> accountsByType,
            decimal totalMoney, decimal totalLoansOwed,
            Dictionary<string, int> customersByBranch) GetBankSummary()
    {
        List<CustomerInfo> allCustomers = _db.CustomerInfos.ToList();
        List<Account> allAccounts = _db.Accounts.ToList();

        int totalCustomers = allCustomers.Count;
        int activeCustomers = allCustomers.Count(c => c.CustActive);
        int inactiveCustomers = allCustomers.Count(c => !c.CustActive);

        int totalAccounts = allAccounts.Count;

        Dictionary<string, int> accountsByType = allAccounts
            .GroupBy(a => a.AcctType)
            .ToDictionary(g => g.Key, g => g.Count());

        decimal totalMoney = allAccounts
            .Where(a => a.AcctType == "Checking" || a.AcctType == "Savings")
            .Sum(a => a.AcctBalance);

        decimal totalLoansOwed = allAccounts
            .Where(a => a.AcctType == "Loan")
            .Sum(a => a.AcctBalance);

        Dictionary<string, int> customersByBranch = ValidBranches
            .ToDictionary(branch => branch, branch => allCustomers.Count(c => c.CustAccBranchLoc == branch));

        return (totalCustomers, activeCustomers, inactiveCustomers, totalAccounts,
                accountsByType, totalMoney, totalLoansOwed, customersByBranch);
    }
    #endregion

    #region Reset Customer Password
    public void ResetCustomerPassword(int custAccNo, string newPassword)
    {
        if (newPassword.Length < 6)
        {
            throw new ArgumentException("Password must be at least 6 characters long.");
        }
        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c=>c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        if (newPassword == customer.CustPwd)
        {
            throw new ArgumentException("New password cannot be the same as the current password.");
        }

        customer.CustPwd = newPassword;
        _db.SaveChanges();
    }
    public List<CustomerInfo> GetCustomerList()
    {
        // return customer info in order from A->Z
        return _db.CustomerInfos
            .OrderBy(c => c.CustName)
            .ToList();
    }
    #endregion

    #region Approve Checkbook Request
    public List<CheckbookRequest> GetPendingCheckbookRequests()
    {
        return _db.CheckbookRequests
            .Where(r => r.RequestStatus == "Pending")
            .OrderBy(r => r.RequestDate)
            .ToList();
    }

    public void RespondToCheckbookRequest(int requestId, bool approve)
    {
        CheckbookRequest? request = _db.CheckbookRequests.FirstOrDefault(r => r.RequestId == requestId);
        if (request == null)
        {
            throw new ArgumentException("No request found with that ID.");
        }

        request.RequestStatus = approve ? "Approved" : "Denied";
        request.ResponseDate = DateTime.Now;
        _db.SaveChanges();
    }

    public CustomerInfo? FindCustomerByAccNo(int custAccNo)
    {
        return _db.CustomerInfos.FirstOrDefault(c => c.CustAccNo == custAccNo);
    }
    #endregion
}