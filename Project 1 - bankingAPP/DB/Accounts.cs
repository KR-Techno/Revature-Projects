namespace Project_1___bankingAPP.DB;

public abstract class Account
{
    public int CustAccNo { get; set; }
    public string AcctType { get; set; } = "";
    public decimal AcctBalance { get; set; }
    public DateTime? LastInterestDate { get; set; }
    public decimal InterestRate { get; set; } = 5.00m;


    #region Methods

    public virtual void InterestApply()
    {
        if (LastInterestDate == DateTime.Today)
        {
            return; // interest has been applied for today for this customer
        }
        else
        {
            // calculcate interest and update date interest was given to today
            decimal Interest = AcctBalance * (InterestRate / 100);
            AcctBalance += Interest;
            LastInterestDate = DateTime.Today;
        }
    }
    public virtual decimal Withdraw(decimal amount)
    {
        if(amount < 1)
        {
            throw new ArgumentException("Sorry, you cannot withdraw less than $1.");
        }
        else if (amount > AcctBalance)
        {
            throw new ArgumentException("Insufficient funds. Please try again with a smaller amount.");
        }
        else
        {
            AcctBalance = AcctBalance - amount;
            return AcctBalance;
        }

    }
    public virtual decimal Deposit(decimal amount)
    {
        const decimal maxDeposit = 1000000000m;

        if (amount < 1)
        {
            throw new ArgumentException("Sorry, deposit has to be at least $1.");
        }
        else if (amount > maxDeposit)
        {
            throw new ArgumentException($"Deposit amount cannot exceed {maxDeposit}");
        }
        else
        {
            AcctBalance = AcctBalance + amount;
            return AcctBalance;
        }
    }

    public decimal CheckBalance()
    {
        // check balance of account
        return AcctBalance;
    }
    #endregion
}