using Project_1___bankingAPP.DB;
using Project_1___bankingAPP.UI;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
bool running = true;


var configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json")
    .Build();

BankingAppDbContext db = new BankingAppDbContext(
    new DbContextOptionsBuilder<BankingAppDbContext>()
        .UseSqlServer(configuration.GetConnectionString("BankingDatabase"))
        .Options
);

try
{
    if (db.Database.CanConnect())
    {
        Console.WriteLine("Database connection successful!");
    }
    else
    {
        Console.WriteLine("Could not connect to the database.");
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Database connection failed: {ex.Message}");
}

while (running)
{
    Console.WriteLine("\n Welcome to our Bank Main Menu!");
    Console.WriteLine("--------------------------");
    Console.WriteLine("Are you a customer or Admin?");
    Console.WriteLine("1. Customer");
    Console.WriteLine("2. Admin");
    Console.WriteLine("3. Exit");
    Console.WriteLine("Please select an option above: ");
    string? choice = Console.ReadLine()?.ToLower();

    switch (choice)
    {
        case "1":
            CustomerMenu customerMenu = new CustomerMenu(db);
            customerMenu.Run();
            break;
        case "2":
            AdminMenu adminMenu = new AdminMenu(db);
            adminMenu.Run();
            break;
        case "3":
            running = false;
            Console.WriteLine("Thanks for banking with us! Have a nice day!");
            break;
        default:
            Console.WriteLine("Invalid choice. Please try again.");
            break;
    }

}