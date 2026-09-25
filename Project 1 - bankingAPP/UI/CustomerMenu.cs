using System.Net.Http.Headers;
using Project_1___bankingAPP.DB;
using Project_1___bankingAPP.Services;

namespace Project_1___bankingAPP.UI;

public class CustomerMenu
{
    // read from CustomerService class
    // using _ for defining variables stored in private fields, like _customer
    private readonly CustomerService _customerService;
    private CustomerInfo? _loggedInCustomer;

    public CustomerMenu(BankingAppDbContext db)
    {
        _customerService = new CustomerService(db);
    }

    public void Run()
    {
        if (!TryLogin())
        {
            return; // return to main menu
        }

        bool activeCustomerMenu = true;
        while (activeCustomerMenu)
        {
            Console.WriteLine("\nCustomer Menu");
            Console.WriteLine("--------------------");
            Console.WriteLine("1. Check Account Details");
            Console.WriteLine("2. Withdraw");
            Console.WriteLine("3. Deposit");
            Console.WriteLine("4. Transfer");
            Console.WriteLine("5. Last 5 Transactions");
            Console.WriteLine("6. Request Checkbook");
            Console.WriteLine("7. Change Password");
            Console.WriteLine("8. Exit");

            string firstName = _loggedInCustomer!.CustName.Split(' ')[0];
            Console.WriteLine($"Welcome, {firstName}! Please select an option above: ");
            if (!_loggedInCustomer.CustActive)
            {
                Console.WriteLine("Warning: Your account is inactive, only Change Password and Exit are available.");
            }
            string? choice = Console.ReadLine()?.ToLower();

            try
            {
                if (!_loggedInCustomer!.CustActive && choice != "1" && choice != "7" && choice != "8")
                {
                    Console.WriteLine("Your account is currently inactive. You can only view your account details and change your password.");
                    Console.WriteLine("If you believe this is a mistake, please contact customer support.");
                }
                else
                {
                    switch(choice)
                    {
                        case "1":
                            CheckAccountDetails();
                            break;
                        case "2":
                            Withdraw();
                            break;
                        case "3":
                            Deposit();
                            break;
                        case "4":
                            Transfer();
                            break;
                        case "5":
                            LastFiveTransactions();
                            break;
                        case "6":
                            RequestCheckbook();
                            break;
                        case "7":
                            ChangePassword();
                            break;
                        case "8":
                            activeCustomerMenu = false;
                            Console.WriteLine("Logging out...");
                            Console.WriteLine($"Thanks for banking with us {firstName}! Have a nice day!");
                            break;
                        default:
                            Console.WriteLine("Invalid selection. Please try again.");
                            break;
                    }
                }
            }

            catch (InvalidOperationException ex)
            {
                Console.WriteLine($"Transaction failed: {ex.Message}");
            }
            catch(Exception ex)
            {
                Console.WriteLine($"Unexpected error occurred: {ex.Message} Please try again.");
            }
        }
    }

    // function that hides password from user and makes it appear as '*' in Console
    private static string ReadPassword()
    {
        string password = "";
        ConsoleKeyInfo key;

        while ((key = Console.ReadKey(intercept: true)).Key != ConsoleKey.Enter)
        {
            if (key.Key == ConsoleKey.Backspace && password.Length > 0)
            {
                password = password[..^1];
                Console.Write("\b \b");
            }
            else if (!char.IsControl(key.KeyChar))
            {
                password += key.KeyChar;
                Console.Write('*');
            }
        }

        Console.WriteLine();
        return password;
    }

    // Helper function that prompts the customer on which account they want to interact with
    private string? PromptAccountType()
    {
        Console.WriteLine("Which account?");
        Console.WriteLine("1. Checking");
        Console.WriteLine("2. Savings");
        Console.WriteLine("3. Loan");
        Console.WriteLine("4. Back");
        string? choice = Console.ReadLine();


        return choice switch
        {
            "1" => "Checking",
            "2" => "Savings",
            "3" => "Loan",
            "4" => null,
            _ => throw new ArgumentException("Invalid account type selected.")
        };

    }
    private bool TryLogin()
    {
        while (true)
        {
            Console.WriteLine("Enter your username (or press Enter to go back): ");
            string? username = Console.ReadLine();

            if (string.IsNullOrWhiteSpace(username))
            {
                return false;
            }

            Console.WriteLine("Enter your password: ");
            string password = ReadPassword();

            CustomerInfo? customer = _customerService.ValidateLogin(username, password);
           if (customer != null)
            {
                _loggedInCustomer = customer;

                foreach (Account account in customer.Accounts)
                {
                    decimal balanceBefore = account.AcctBalance;
                    account.InterestApply();
                    decimal interestEarned = account.AcctBalance - balanceBefore;

                    if (interestEarned != 0)
                    {
                        _customerService.LogInterestTransaction(_loggedInCustomer.CustAccNo, account.AcctType, interestEarned);
                    }
                }
                _customerService.SaveInterestChanges();

                Console.WriteLine($"Hello, {customer.CustName}!");
                return true;
            }
        }
    }

    // Helper function to add negative numbers
    private static string FormatBalance(decimal amount)
    {
        return amount < 0 ? $"-{Math.Abs(amount):C}" : amount.ToString("C");
    }

    // return all account details for the logged in Customer
    private void CheckAccountDetails()
    {
        Console.WriteLine("------------------------------------");
        Console.WriteLine($"\nAccount Number: {_loggedInCustomer!.CustAccNo}");
        Console.WriteLine($"Name: {_loggedInCustomer.CustName}");
        Console.WriteLine($"Branch: {_loggedInCustomer.CustAccBranchLoc}");
        Console.WriteLine($"Status: {(_loggedInCustomer.CustActive ? "Active" : "Inactive")}");

        List<Account> accounts = _customerService.GetAllAccounts(_loggedInCustomer.CustAccNo);

        if (accounts.Count == 0)
        {
            Console.WriteLine("\nYou have no accounts on file.");
            return;
        }

        foreach (Account account in accounts)
        {
            Console.WriteLine($"\n{account.AcctType} Account");
            Console.WriteLine($"Balance: {FormatBalance(account.AcctBalance)}");
        }

        Console.WriteLine("--------------------------------------");

    }

    // Withdraw method
    private void Withdraw()
    {
        // Prompt customer to choose what account they wish to withdraw money from
        string? acctType = PromptAccountType();
        if (acctType == null)
        {
            return;
        }

        Console.Write("Enter amount to withdraw: ");
        if (decimal.TryParse(Console.ReadLine(), out decimal amount))
        {
            decimal newBalance = _customerService.Withdraw(_loggedInCustomer!.CustAccNo, acctType, amount);
            Console.WriteLine($"You've successfully withdrawn {amount:C}. Your {acctType} balance is now: {FormatBalance(newBalance)}.");
        }
        else
        {
            Console.WriteLine("Invalid amount entered.");
        }
    }

    // Deposit method
    private void Deposit()
    {
        // Prompt customer to choose what account they wish to deposit money into
        string? acctType = PromptAccountType();
        if (acctType == null)
        {
            return;
        }

        Console.Write("Enter deposit amount: ");
        if (decimal.TryParse(Console.ReadLine(), out decimal amount))
        {
            decimal newBalance = _customerService.Deposit(_loggedInCustomer!.CustAccNo, acctType, amount);
            Console.WriteLine($"You've successfully deposited {amount:C}. Your {acctType} balance is now: {newBalance:C}.");
        }
        else
        {
            Console.WriteLine("Invalid amount entered.");
        }
    }

    // Transfer method
    private void Transfer()
    {
        string? fromType = PromptAccountType();
        if (fromType == null)
        {
            return;
        }

        string? toType = PromptAccountType();
        if (toType == null)
        {
            return;
        }

        Console.Write("Enter amount to transfer: ");
        if (!decimal.TryParse(Console.ReadLine(), out decimal amount))
        {
            Console.WriteLine("Invalid amount entered.");
            return;
        }

        var newBalance = _customerService.TransferOwnAccounts(_loggedInCustomer!.CustAccNo, fromType, toType, amount);
        Console.WriteLine($"You've successfully transferred {amount:C} from your {fromType} to your {toType}.");
        Console.WriteLine($"Your {fromType} balance is now {FormatBalance(newBalance.fromBalance)}.");
        Console.WriteLine($"Your {toType} balance is now {FormatBalance(newBalance.toBalance)}.");
    }

    // 5 Most Recent Customer Transactions
    private void LastFiveTransactions()
    {
        List<Transaction> transactions = _customerService.GetLastFiveTransactions(_loggedInCustomer!.CustAccNo);

        if (transactions.Count == 0)
        {
            Console.WriteLine("No transactions found.");
            return;
        }

        Console.WriteLine("\nYour last 5 transactions:");
        foreach (Transaction t in transactions)
        {
            if (t.TransactionType == "Transfer")
            {
                Console.WriteLine($"{t.TransactionDate} | Transfer: {t.AcctType} -> {t.ToAcctType} | {t.Amount:C}");
            }
            else if (t.TransactionType == "Interest")
            {
                Console.WriteLine($"{t.TransactionDate} | {t.AcctType} | Interest Applied | {t.Amount:C}");
            }
            else
            {
                Console.WriteLine($"{t.TransactionDate} | {t.AcctType} | {t.TransactionType} | {t.Amount:C}");
            }

            Console.WriteLine("----------------------------------------");
        }
    }

    // Checkbook requests
    private void RequestCheckbook()
    {
        _customerService.RequestCheckbook(_loggedInCustomer!.CustAccNo);
        Console.WriteLine("Checkbook request submitted. An admin will review, please allow 24-48 business hours for a response.");
    }

    // Change password
    private void ChangePassword()
    {
        Console.WriteLine("Enter your current password: ");
        string oldPassword = ReadPassword();

        Console.WriteLine("Enter your new password: ");
        string newPassword = ReadPassword();

        _customerService.ChangePassword(_loggedInCustomer!.CustAccNo, oldPassword, newPassword);
        Console.WriteLine("Password changed successfully.");
    }
}
