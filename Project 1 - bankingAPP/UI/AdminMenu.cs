using Project_1___bankingAPP.DB;
using Project_1___bankingAPP.Services;

namespace Project_1___bankingAPP.UI;

public class AdminMenu
{
    // read from AdminService class
    // using _ for defining variables stored in private fields, like _admin
    private readonly AdminService _adminService;
    private AdminInfo? _loggedInAdmin;

    public AdminMenu(BankingAppDbContext db)
    {
        _adminService = new AdminService(db);
    }

    public void Run()
    {
        if (!TryLogin())
        {
            return; // return to main menu
        }

        bool activeAdminMenu = true;
        while (activeAdminMenu)
        {
            Console.WriteLine("\nAdmin Menu");
            Console.WriteLine("--------------------");
            Console.WriteLine("1. Create New Account");
            Console.WriteLine("2. Delete Account");
            Console.WriteLine("3. Edit Account Details");
            Console.WriteLine("4. Display Summary");
            Console.WriteLine("5. Reset Customer Password");
            Console.WriteLine("6. Approve Checkbook Request");
            Console.WriteLine("7. Exit");

            Console.WriteLine($"Welcome back, {_loggedInAdmin!.AdminuName}! Please select an option above: ");
            string? choice = Console.ReadLine()?.ToLower();

            try
            {
                switch(choice)
                {
                    case "1":
                        CreateAccount();
                        break;
                    case "2":
                        DeleteAccount();
                        break;
                    case "3":
                        EditAccountDetails();
                        break;
                    case "4":
                        DisplaySummary();
                        break;
                    case "5":
                        ResetCustomerPassword();
                        break;
                    case "6":
                        ApproveCheckbookRequest();
                        break;
                    case "7":
                        activeAdminMenu = false;
                        Console.WriteLine("Logging out...");
                        Console.WriteLine($"Have a nice day!");
                        break;
                    default:
                        Console.WriteLine("Invalid selection. Please try again.");
                        break;
                }
            }
            // catch unexpected errors
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

    // function to make password be hidden to user and appear as '*'
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

    // Security Layer, make Admin double confirm
    private bool ConfirmAdminPassword()
    {
        Console.WriteLine("Please re-enter your password to confirm: ");
        string password = ReadPassword();
        AdminInfo? adminInfo = _adminService.ValidateLogin(_loggedInAdmin!.AdminuName, password);
        return adminInfo != null;
    }

    // Validate Login
    private bool TryLogin()
    {
        while (true)
        {
            Console.WriteLine("Enter your username: ");
            string? username = Console.ReadLine();

            Console.WriteLine("Enter your password: ");
            string password = ReadPassword();

            AdminInfo? admin = _adminService.ValidateLogin(username, password);
            if (admin != null)
            {
                _loggedInAdmin = admin;
                Console.WriteLine($"Hello, {admin.AdminuName}!");
                return true;
            }

            // Restart loop
            Console.WriteLine("Username or password is incorrect. Please try again.");
        }
    }

    // Create Account UI
    private void CreateAccount()
    {
        bool createAnother = true;

        while (createAnother)
        {
            try
            {
                Console.WriteLine("Enter username for customer: ");
                string? username = Console.ReadLine();

                CustomerInfo? customer = _adminService.FindCustomerByUsername(username!);

                if (customer == null)
                {
                    Console.WriteLine("Set a password for customer: ");
                    string password = ReadPassword();
                    _adminService.ValidatePassword(password);

                    Console.WriteLine("Enter customer's full name: ");
                    string? name = Console.ReadLine();
                    _adminService.ValidateCustomerName(name!);

                    Console.WriteLine("\n('New York, 'Miami, Los Angeles, Las Vegas, Hartford, Dallas, Phoenix, Chicago, Philadelphia, Boston)");
                    Console.WriteLine("Choose the customer's bank branch location from above: ");
                    string? branchLoc = Console.ReadLine();
                    _adminService.ValidateBranch(branchLoc!);

                    Console.WriteLine("What type of account is the customer looking for?");
                    Console.WriteLine("1. Checking");
                    Console.WriteLine("2. Savings");
                    Console.WriteLine("3. Loan");
                    Console.WriteLine("4. Back");
                    string? typeChoice = Console.ReadLine();

                    if (typeChoice == "4")
                    {
                        return;
                    }

                    string acctType = typeChoice switch
                    {
                        "1" => "Checking",
                        "2" => "Savings",
                        "3" => "Loan",
                        _ => throw new ArgumentException("Invalid account type selected.")
                    };

                    if (!ConfirmAdminPassword())
                    {
                        throw new ArgumentException("Incorrect password entered. Account creation cancelled.");
                    }

                    customer = _adminService.CreateCustomerWithAccount(name!, branchLoc!, username!, password!, acctType);
                    Console.WriteLine($"Customer account created with account number {customer.CustAccNo}, {acctType} account attached.");
                }
                else
                {
                    Console.WriteLine($"Found existing customer with that username: {customer.CustName}");

                    Console.WriteLine("What type of account is the customer looking for?");
                    Console.WriteLine("1. Checking");
                    Console.WriteLine("2. Savings");
                    Console.WriteLine("3. Loan");
                    Console.WriteLine("4. Back");
                    string? typeChoice = Console.ReadLine();

                    if (typeChoice == "4")
                    {
                        return;
                    }

                    string acctType = typeChoice switch
                    {
                        "1" => "Checking",
                        "2" => "Savings",
                        "3" => "Loan",
                        _ => throw new ArgumentException("Invalid account type selected.")
                    };

                    if (!ConfirmAdminPassword())
                    {
                        throw new ArgumentException("Incorrect password entered. Account creation cancelled.");
                    }

                    Account newAccount = _adminService.CreateAccount(customer.CustAccNo, acctType);
                    Console.WriteLine($"{acctType} account created successfully for {customer.CustName}");
                }
            }
            catch (ArgumentException ex)
            {
                Console.WriteLine($"Error: {ex.Message} Sorry something unexpected happened. Reloading...");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Unexpected error: {ex.Message}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Details: {ex.InnerException.Message}");
                }
            }
            Console.WriteLine("Would you like to create another account? (Y/N): ");
            string? again = Console.ReadLine()?.ToLower();
            createAnother = (again == "y"); // if Admin wishes, create account loops again.
        }
    }

    // Delete Account UI
    private void DeleteAccount()
    {
        if (_adminService.GetCustomerCount() == 0)
        {
            Console.WriteLine("There are no customers in the system to delete.");
            return;
        }

        bool deleteAnother = true;
        while (deleteAnother)
        {
            try
            {
                Console.WriteLine("Enter username of customer you wish to delete: ");
                string? username = Console.ReadLine();

                CustomerInfo? customer = _adminService.FindCustomerByUsername(username!);

                if (customer == null)
                {
                    Console.WriteLine("No customer found with that username. Please try again.");
                }
                else
                {
                    Console.WriteLine("------------------------------------------------------------------\n");
                    Console.WriteLine("1. Completely delete customer account");
                    Console.WriteLine("2. Delete one of customer's bank accounts (Savings, Checking or Loan)");
                    Console.WriteLine("3. Back");
                    Console.WriteLine("Please select an above option: ");
                    string? deleteChoice = Console.ReadLine();

                    if (deleteChoice == "1")
                    {
                        Console.WriteLine($"Are you sure you want to completely delete {customer.CustName}'s account and ALL their information? (Y/N): ");
                        string? confirm = Console.ReadLine()?.ToLower();

                        if (confirm == "y")
                        {
                            // Security layer
                            if (!ConfirmAdminPassword())
                            {
                                throw new ArgumentException("Incorrect password entered. Deletion cancelled.");
                            }
                            else
                            {
                                _adminService.DeleteCustomer(customer.CustAccNo);
                                Console.WriteLine($"Customer {customer.CustName} and all associated accounts and information successfully deleted.");
                            }
                        }
                        else
                        {
                            Console.WriteLine("Invalid selection. Deletion cancelled.");
                        }
                    }
                    else if (deleteChoice == "2")
                    {
                        Console.WriteLine("Which bank account type would you like to delete?");
                        Console.WriteLine("-------------------------------------------------");
                        Console.WriteLine("1. Checking");
                        Console.WriteLine("2. Savings");
                        Console.WriteLine("3. Loan");
                        string? typeChoice = Console.ReadLine();

                        string acctType = typeChoice switch
                        {
                            "1" => "Checking",
                            "2" => "Savings",
                            "3" => "Loan",
                            _ => throw new ArgumentException("Invalid account type selected.")
                        };

                        if (typeChoice == "1" || typeChoice == "2" || typeChoice == "3")
                        {
                            if (!ConfirmAdminPassword())
                            {
                                throw new ArgumentException("Incorrect password entered. Deletion cancelled.");
                            }
                            else
                            {
                                _adminService.DeleteCustomerBankAccount(customer.CustAccNo, acctType);
                                Console.WriteLine($"{acctType} account deleted for {customer.CustName} successfully.");
                            }
                        }
                        else
                        {
                            Console.WriteLine("Invalid selection. Deletion canceled.");
                        }
                    }
                    else if (deleteChoice == "3")
                    {
                        Console.WriteLine("Returning to Menu...");
                        return;
                    }
                    else
                    {
                        Console.WriteLine("Invalid input.");
                    }
                }
            }
            // deal with any unseen errors
            catch (ArgumentException ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }

            catch (Exception ex)
            {
                Console.WriteLine($"Unexpected error: {ex.Message}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Details: {ex.InnerException.Message}");
                }
            }

            Console.WriteLine("Delete another account? (Y/N): ");
            string? again = Console.ReadLine()?.ToLower();
            deleteAnother = (again == "y"); // loop again if admin wishes
        }
    }

    // Edit Account Details UI
    private void EditAccountDetails()
    {
        if (_adminService.GetCustomerCount() == 0)
        {
            Console.WriteLine("There are no customers in the system to edit.");
            return;
        }

        bool editAnother = true;

        while (editAnother)
        {
            try
            {
                Console.WriteLine("Enter username of customer you would like to edit: ");
                string? username = Console.ReadLine();

                CustomerInfo? customer = _adminService.FindCustomerByUsername(username!);
                if (customer == null)
                {
                    Console.WriteLine("No customer found with that username.");
                }
                else
                {
                    Console.WriteLine("-------------------------------");
                    Console.WriteLine($"\nEditing: {customer.CustName}");
                    Console.WriteLine("1. Name");
                    Console.WriteLine("2. Username");
                    Console.WriteLine("3. Bank Branch location");
                    Console.WriteLine("4. Account Balance (use with caution)");
                    Console.WriteLine("5. Account Activity");
                    Console.WriteLine("6. Back");
                    Console.WriteLine("Select one of the fields above to edit: ");
                    string? fieldChoice = Console.ReadLine();

                    switch (fieldChoice)
                    {
                        case "1":
                            Console.WriteLine("Enter new name: ");
                            string? newName = Console.ReadLine();
                            if (newName == null)
                            {
                                Console.WriteLine("No new name entered.");
                            }
                            else
                            {
                                _adminService.UpdateCustomerName(customer.CustAccNo, newName!);
                                Console.WriteLine($"Name has been edited to {newName}.");
                            }
                            break;

                        case "2":
                            Console.WriteLine("Enter new username: ");
                            string? newUserName = Console.ReadLine();
                            if (newUserName == null)
                            {
                                Console.WriteLine("No new username entered.");
                            }
                            else
                            {
                                _adminService.UpdateCustomerUsername(customer.CustAccNo, newUserName!);
                                Console.WriteLine("Username updated.");
                            }
                            break;

                        case "3":
                            Console.WriteLine("Enter new branch location: ");
                            string? newBranch = Console.ReadLine();
                            if (newBranch == null)
                            {
                                Console.WriteLine("No new Branch entered.");
                            }
                            else
                            {
                                _adminService.UpdateCustomerBranch(customer.CustAccNo, newBranch!);
                                Console.WriteLine("Bank branch updated.");
                            }
                            break;

                        case "4":
                            Console.WriteLine("Which account are you editing?");
                            Console.WriteLine("1. Checking");
                            Console.WriteLine("2. Savings");
                            Console.WriteLine("3. Loan");
                            string? typeChoice = Console.ReadLine();

                            string acctType = typeChoice switch
                            {
                                "1" => "Checking",
                                "2" => "Savings",
                                "3" => "Loan",
                                _ => throw new ArgumentException("Invalid selection.")
                            };

                            Console.WriteLine("Enter new balance: ");
                            if (!decimal.TryParse(Console.ReadLine(), out decimal newBalance))
                            {
                                throw new ArgumentException("Invalid balance amount entered.");
                            }

                            Console.WriteLine("WARNING: This directly overrides the balance and bypasses all transaction rules.");
                            Console.WriteLine("Are you sure? (Y/N): ");
                            string? confirm = Console.ReadLine()?.ToLower();

                            if (confirm == "y")
                            {
                                if (!ConfirmAdminPassword())
                                {
                                    throw new ArgumentException("Incorrect password entered. Override cancelled.");
                                }
                                _adminService.OverrideAccountBalance(customer.CustAccNo, acctType, newBalance);
                                Console.WriteLine("Balance overridden.");
                            }
                            else
                            {
                                Console.WriteLine("Override cancelled.");
                            }
                            break;

                        case "5":
                            Console.WriteLine($"This customer is currently: {(customer.CustActive ? "Active" : "Inactive")}.");
                            Console.WriteLine("1. Set Active");
                            Console.WriteLine("2. Set Inactive");
                            string? statusChoice = Console.ReadLine();

                            bool newStatus = statusChoice switch
                            {
                                "1" => true,
                                "2" => false,
                                _ => throw new ArgumentException("Invalid selection.")
                            };

                            if (!ConfirmAdminPassword())
                            {
                                throw new ArgumentException("Incorrect password entered. Edit cancelled.");
                            }
                            _adminService.SetCustomerActiveStatus(customer.CustAccNo, newStatus);
                            Console.WriteLine($"Customer status set to {(newStatus ? "Active" : "Inactive")}.");
                        break;

                        case "6":
                            return;

                        default:
                            Console.WriteLine("Invalid input.");
                            break;
                    }
                }
            }
            // catch unexpected errors
            catch (ArgumentException ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Unexpected error occurred: {ex.Message}");
            }

            Console.WriteLine("Edit another customer account? (Y/N): ");
            string? again = Console.ReadLine()?.ToLower();
            editAnother = (again == "y");
        }
    }

    // Display Summary UI
    private void DisplaySummary()
    {
        var summary = _adminService.GetBankSummary();
        List<CustomerInfo> customers = _adminService.GetCustomerList();


        Console.WriteLine("\n------Bank Summary------");
        Console.WriteLine($"Total Customers: {summary.totalCustomers}");
        Console.WriteLine($"Active: {summary.activeCustomers}");
        Console.WriteLine($"Inactive: {summary.inactiveCustomers}");

        Console.WriteLine($"\nTotal Accounts: {summary.totalAccounts}");
        foreach (var type in summary.accountsByType)
        {
            Console.WriteLine($" {type.Key}: {type.Value}");
        }

        Console.WriteLine($"\nTotal Money in the bank (Checking + Savings): {summary.totalMoney:C}");
        Console.WriteLine($"Total Outstanding Loans: {summary.totalLoansOwed:C}");

        Console.WriteLine("\nCustomers by Branch:");
        foreach (var branch in summary.customersByBranch)
        {
            Console.WriteLine($" {branch.Key}: {branch.Value}");
        }
        Console.WriteLine("------------------------------------------");
        Console.WriteLine("\n-------Customer List-------");
        foreach (CustomerInfo customer in customers)
        {
            Console.WriteLine($"{customer.CustName} | Acct#: {customer.CustAccNo} | Username: {customer.CustuName} | Branch: {customer.CustAccBranchLoc} | Status: {(customer.CustActive ? "Active" : "Inactive")}");
        }
        Console.WriteLine("-------------------------------------------");
    }

    // Reset Customer Password UI
    private void ResetCustomerPassword()
    {
        if (_adminService.GetCustomerCount() == 0)
        {
            Console.WriteLine("There are no customers in the system to reset the password for.");
            return;
        }

        bool resetAnother = true;
        while (resetAnother)
        {
            try
            {
                Console.WriteLine("Enter username of customer whose password you wish to reset: ");
                string? username = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(username))
                {
                    return;
                }

                CustomerInfo? customer = _adminService.FindCustomerByUsername(username!);
                if (customer == null)
                {
                    Console.WriteLine("No customer found with that username.");
                }
                else
                {
                    Console.WriteLine($"Enter new password for {customer.CustName}: ");
                    string newPassword = ReadPassword();

                    if(!ConfirmAdminPassword())
                    {
                        throw new ArgumentException("Incorrect password entered. Reset cancelled.");
                    }
                    _adminService.ResetCustomerPassword(customer.CustAccNo, newPassword);
                    Console.WriteLine("Password reset successfully!");
                }
            }
            catch (ArgumentException ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Unexpected error occurred: {ex.Message}");
            }

            Console.WriteLine("Reset another customer's password? (Y/N): ");
            string? again = Console.ReadLine()?.ToLower();
            resetAnother = (again == "y"); // reset loop if admin wishes
        }
    }

    // Approve Checkbook Request
    private void ApproveCheckbookRequest()
    {
        List<CheckbookRequest> pending = _adminService.GetPendingCheckbookRequests();

        if (pending.Count == 0)
        {
            Console.WriteLine("No pending checkbook requests.");
            return;
        }

        foreach (CheckbookRequest request in pending)
        {
            CustomerInfo? customer = _adminService.FindCustomerByAccNo(request.CustAccNo);
            Console.WriteLine($"\nRequest #{request.RequestId} - {customer?.CustName} (Acct #{request.CustAccNo}) - Requested {request.RequestDate}");
            Console.WriteLine("1. Approve");
            Console.WriteLine("2. Deny");
            Console.WriteLine("3. Skip");
            string? choice = Console.ReadLine();

            if (choice == "1")
            {
                _adminService.RespondToCheckbookRequest(request.RequestId, true);
                Console.WriteLine("Approved.");
            }
            else if (choice == "2")
            {
                _adminService.RespondToCheckbookRequest(request.RequestId, false);
                Console.WriteLine("Denied.");
            }
            else if (choice == "3")
            {
                Console.WriteLine($"Request #{request.RequestId} skipped.");
            }
            else
            {
                Console.WriteLine("Invalid input. Skipping this request.");
            }
        }
    }
}


