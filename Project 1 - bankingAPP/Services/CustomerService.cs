using Microsoft.EntityFrameworkCore;
using Project_1___bankingAPP.DB;

namespace Project_1___bankingAPP.Services;

public class CustomerService
{
    private readonly BankingAppDbContext _db;

    public CustomerService(BankingAppDbContext db)
    {
        _db = db;
    }

    public CustomerInfo? ValidateLogin(string? username, string? password)
    {
        return _db.CustomerInfos
            .Include(c => c.Accounts)
            .FirstOrDefault(c => c.CustuName == username && c.CustPwd == password);
    }

    public void SaveInterestChanges()
    {
        _db.SaveChanges();
    }

    #region Check Account Details
    public List<Account> GetAllAccounts(int custAccNo)
    {
        return _db.Accounts
            .Where(a => a.CustAccNo == custAccNo)
            .ToList();
    }

    private Account GetAccount(int custAccNo, string acctType)
    {
        Account? account = _db.Accounts
            .FirstOrDefault(a => a.CustAccNo == custAccNo && a.AcctType == acctType);

        if (account == null)
        {
            throw new ArgumentException($"You don't have a {acctType} account.");
        }

        return account;
    }
    #endregion

    #region Withdraw
    public decimal Withdraw(int custAccNo, string acctType, decimal amount)
    {
        Account account = GetAccount(custAccNo, acctType);
        decimal newBalance = account.Withdraw(amount);
        LogTransaction(custAccNo, acctType, "Withdraw", amount);
        _db.SaveChanges();
        return newBalance;
    }
    #endregion

    #region Deposit
    public decimal Deposit(int custAccNo, string acctType, decimal amount)
    {
        Account account = GetAccount(custAccNo, acctType);
        decimal newBalance = account.Deposit(amount);
        LogTransaction(custAccNo, acctType, "Deposit", amount);
        _db.SaveChanges();
        return newBalance;
    }
    #endregion

    #region Transfer
    public (decimal fromBalance, decimal toBalance) TransferOwnAccounts(int custAccNo, string fromType, string toType, decimal amount)
    {
        if (fromType == "Loan")
        {
            throw new ArgumentException("You cannot transfer money out of a Loan account.");
        }

        Account fromAccount = GetAccount(custAccNo, fromType);
        Account toAccount = GetAccount(custAccNo, toType);

        fromAccount.Withdraw(amount);
        toAccount.Deposit(amount);
        LogTransaction(custAccNo, fromType, "Withdraw", amount);
        LogTransaction(custAccNo, toType, "Deposit", amount);
        _db.SaveChanges();

        return (fromAccount.AcctBalance, toAccount.AcctBalance);
    }
    #endregion

    #region List 5 Most Recent Transactions
    private void LogTransaction(int custAccNo, string acctType, string transactionType, decimal amount)
    {
        Transaction transaction = new Transaction
        {
            CustAccNo = custAccNo,
            AcctType = acctType,
            TransactionType = transactionType,
            Amount = amount,
            TransactionDate = DateTime.Now
        };

        _db.Transactions.Add(transaction);
    }
    public List<Transaction> GetLastFiveTransactions(int custAccNo)
    {
        return _db.Transactions
            .Where(t => t.CustAccNo == custAccNo)
            .OrderByDescending(t => t.TransactionDate)
            .Take(5)
            .ToList();
    }

    #endregion

    #region Checkbook Requests
    public void RequestCheckbook(int custAccNo)
    {
        bool hasPendingRequest = _db.CheckbookRequests
            .Any(r => r.CustAccNo == custAccNo && r.RequestStatus == "Pending");

        if (hasPendingRequest)
        {
            throw new ArgumentException("You already have a pending checkbook request. Please wait 24-48 business hours for a response.");
        }

        CheckbookRequest request = new CheckbookRequest
        {
            CustAccNo = custAccNo,
            RequestDate = DateTime.Now,
            RequestStatus = "Pending"
        };

        _db.CheckbookRequests.Add(request);
        _db.SaveChanges();
    }
    #endregion

    #region Change Password
    public void ChangePassword(int custAccNo, string oldPassword, string newPassword)
    {
        if (newPassword.Length < 6)
        {
            throw new ArgumentException("New password must be at least 6 characters long.");
        }

        CustomerInfo? customer = _db.CustomerInfos.FirstOrDefault(c => c.CustAccNo == custAccNo);
        if (customer == null)
        {
            throw new ArgumentException("Customer not found.");
        }

        if (customer.CustPwd != oldPassword)
        {
            throw new ArgumentException("Current password is incorrect.");
        }

        if (newPassword == oldPassword)
        {
            throw new ArgumentException("New password cannot be the same as your current password.");
        }

        customer.CustPwd = newPassword;
        _db.SaveChanges();
    }
    #endregion
}