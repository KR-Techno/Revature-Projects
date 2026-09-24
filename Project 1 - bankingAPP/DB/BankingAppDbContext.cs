using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;

namespace Project_1___bankingAPP.DB;

public partial class BankingAppDbContext : DbContext
{
    public BankingAppDbContext() { }

    public BankingAppDbContext(DbContextOptions<BankingAppDbContext> options)
        : base(options) { }

    public DbSet<CustomerInfo> CustomerInfos { get; set; }
    public DbSet<AdminInfo> AdminInfos { get; set; }
    public DbSet<Account> Accounts { get; set; }
    public DbSet<CheckbookRequest> CheckbookRequests { get; set; }
    public DbSet<Transaction> Transactions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CustomerInfo>()
            .ToTable("customerInfo")
            .HasKey(c => c.CustAccNo);

        modelBuilder.Entity<AdminInfo>()
            .ToTable("adminInfo")
            .HasKey(a => a.AdminuName);

        modelBuilder.Entity<Account>()
            .ToTable("account")
            .HasKey(a => new { a.CustAccNo, a.AcctType });

        modelBuilder.Entity<Account>()
            .HasDiscriminator<string>("AcctType")
            .HasValue<Checking>("Checking")
            .HasValue<Savings>("Savings")
            .HasValue<Loan>("Loan");

        modelBuilder.Entity<CustomerInfo>()
            .HasMany(c => c.Accounts)
            .WithOne()
            .HasForeignKey(a => a.CustAccNo);

        modelBuilder.Entity<CheckbookRequest>()
            .ToTable("checkbookRequests")
            .HasKey(r => r.RequestId);

        modelBuilder.Entity<Transaction>()
            .ToTable("transactions")
            .HasKey(t => t.TransactionId);

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}