namespace Project_1___bankingAPP.DB;

public class Loan : Account
{
    public decimal LoanInterestRate { get; set; } = 10.00m;

    public override void InterestApply()
    {
        if (LastInterestDate == DateTime.Today)
        {
            return; // interest has been applied today for this customer
        }
        else
        {
            // calculcate interest and update date interest was added to today
            decimal OwedInterest = AcctBalance * (LoanInterestRate / 100);
            AcctBalance += OwedInterest;
            LastInterestDate = DateTime.Today;
        }
    }

    public override decimal Withdraw(decimal amount)
    {
        const decimal maxLoan = 50000m;

        if(amount < 1)
        {
            throw new ArgumentException("Sorry, you cannot take out a loan of less than a $1.");
        }
        else if (AcctBalance + amount > maxLoan)
        {
            throw new ArgumentException($"Sorry, this would exceed the maximum amount of money you could be loaned. \nYou currently owe {AcctBalance:C}, please pay that off before taking out more money.");
        }
        else
        {
            AcctBalance = AcctBalance + amount;
            return AcctBalance;
        }
    }

    public override decimal Deposit(decimal amount)
    {
        if (amount < 1)
        {
            throw new ArgumentException("Sorry, deposit has to be at least $1.");
        }
        else if (amount > AcctBalance)
        {
            throw new ArgumentException($"Your deposit exceeds the amount you owe of {AcctBalance:C}. Please enter an amount equal or less than your balance.");
        }
        else
        {
            AcctBalance = AcctBalance - amount;
            return AcctBalance;
        }
    }
}