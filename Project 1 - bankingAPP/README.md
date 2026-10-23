# Revature-Projects
--------------------
## Project 1 - 3-Tier Console Banking Application

A console-based banking application built using 3-tier architecture with **C# and .NET 10** that simulates common banking operations for both customers and administrators. The application uses **SQL Server** for data storage and **Entity Framework Core** DB-first approach for database interaction.

Customers can manage their accounts through operations such as deposits, withdrawals, transfers, and transaction history, while administrators can create, edit, and manage customer accounts. The project demonstrates object-oriented programming, database design, authentication, and integration between a .NET application and a relational database.

------------------
## Features
### Customer Menu
* Check Account Details (view all accounts, balances, and status)
* Withdraw
* Deposit
* Transfer (between own Checking/Savings accounts)
* View Last 5 Transactions
* Request Checkbook
* Change Password

### Admin Menu
* Create New Account (new or existing customer)
* Delete Account (entire customer or a single account)
* Edit Account Details (name, username, branch, balance override, active status)
* Display Bank Summary (customer/account totals, balances by branch, full customer list)
* Reset Customer Password
* Approve/Deny Checkbook
--------------------
## Architecture
The application follows a 3-tier structure, separated by folder and responsibility:

* **UI (Presentation) Layer** — CustomerMenu, AdminMenu: handle console input/output only, no direct database access
* **Business Logic Layer** — CustomerService, AdminService: contain all business rules, validation, and coordinate database operations
* **Data Access Layer** — BankingAppDbContext and entity classes (CustomerInfo, AdminInfo, Account and its subclasses, CheckbookRequest, Transaction): map directly to the SQL Server schema via EF Core
--------------------
## Account Class Hierarchy

Account is an abstract base class inherited by Checking, Savings, and Loan. Each subclass overrides **Withdraw**, **Deposit**, and **InterestApply** with its own rules:

* **Checking** — allows withdrawals into a fixed overdraft limit
* **Savings** — cannot go below $0; earns interest
* **Loan** — inverted behavior: Withdraw increases the balance owed (borrowing), Deposit decreases it (paying down); accrues interest on the amount owed
--------------------
## Tech Stack
* C# / .NET 10
* Entity Framework Core (database-first)
* SQL Server
* Console-based UI
--------------------
## How To Run
1. Run BankQuery.sql in SQL Server Management Studio to create the database and tables.
2. Update the connection string in your own appsettings.json to match your SQL Server instance.
3. Build and run the project from Program.cs.
4. Log in as Admin using the seeded credentials in adminInfo, or as a Customer using an account created through the Admin menu.
