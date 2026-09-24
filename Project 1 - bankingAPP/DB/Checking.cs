namespace Project_1___bankingAPP.DB;

public class Checking : Account
{
    public decimal OdLimit { get; set; } = 100.00m; // overdraft limit
    public override decimal Withdraw(decimal amount)
    {
        if (amount < 1)
        {
            throw new ArgumentException("Sorry, you cannot withdraw less than $1.");
        }
        else if (amount > AcctBalance + OdLimit)
        {
            throw new ArgumentException($"Insufficient funds. Your withdrawal amount exceeds the overdraft limit of {OdLimit:C}.");
        }
        else
        {
            AcctBalance = AcctBalance - amount;
            return AcctBalance;
        }
    }

    public override void InterestApply()
    {
        // No interest for checking account
        return;
    }
}