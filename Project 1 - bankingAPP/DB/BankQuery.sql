create database BankingAppDB;
use BankingAppDB;

	CREATE TABLE customerInfo
	(
		custAccNo int identity(1000,1),
		custName varchar(50) not null,
		custAccBranchLoc  varchar(20) not null,
		custuName varchar(20) not null,
		custpwd varchar(100) not null,
		custActive bit not null default 0,

		constraint pk_custaccno primary key(custAccNo),
		constraint chk_pwd check (len(custpwd) > 6),
		constraint chk_custname check (len(custName) >= 2),
		constraint chk_custaccbranchloc check (custAccBranchLoc in
			('New York', 'Miami', 'Los Angeles', 'Las Vegas', 'Hartford',
			 'Dallas', 'Phoenix', 'Chicago', 'Philadelphia', 'Boston')),
		constraint unk_custuname unique(custuName)
	)

	CREATE TABLE account
	(
		custAccNo int not null, -- account number is linked to customer
		acctType varchar(20) not null,
		acctBalance decimal(14,2) not null default 0,
		
		interestRate decimal(5,2) null default 5.00,     -- Savings only
		
		odLimit decimal(14,2) null default 100.00,   -- Checking only
		
		loanInterestRate decimal(5,2) null default 10.00,-- Loan only

		constraint pk_accounts primary key(custAccNo, acctType),
		constraint fk_accounts_customer foreign key(custAccNo)
			references customerInfo(custAccNo), -- taking account number from customer table
		constraint chk_accttype check (acctType in ('Checking', 'Savings', 'Loan')),
	)

	create table checkbookRequests
	(
		requestId int identity(1,1),
		custAccNo int not null,
		requestDate datetime not null default getdate(),
		responseDate datetime null,
		requestStatus varchar(10) not null default 'Pending',

		constraint pk_checkbookrequests primary key(requestId),
		constraint fk_checkbookrequests_customer foreign key(custAccNo)
			references customerInfo(custAccNo), --fetch customer account number
		constraint chk_checkbookstatus check (requestStatus in ('Pending', 'Approved', 'Denied'))
	)

	create table transactions
	(
		transactionId int identity(1,1),
		custAccNo int not null,
		acctType varchar(20) not null,
		toAcctType varchar(20) null,
		transactionType varchar(30) not null,
		amount decimal (14,2) not null,
		transactionDate  datetime not null default getdate(),

		constraint pk_transactions primary key(transactionId),
		constraint fk_transactions_account foreign key(custAccNo, acctType)
			references account(custAccNo, acctType),
		constraint chk_transactiontype check (transactionType IN ('Withdraw', 'Deposit', 'Transfer', 'Interest')),
		constraint fk_transactions_toaccount foreign key (custAccNo, toAcctType)
			references account(custAccNo, acctType)
)

	create table adminInfo
	(
		adminuName varchar(20) not null,
		adminpwd varchar(100) not null,

		constraint pk_adminuName primary key(adminuName)
	)

	insert into adminInfo values('AdminLon', 'password123')
	select * from adminInfo
	
	select * from customerInfo
	select * from account
