// DbContext for the insurance database, used for Entity Framework Core operations.
using System;
using System.Collections.Generic;
using InsuranceApi.Models;
using Microsoft.EntityFrameworkCore;

namespace InsuranceApi.Data;

public partial class InsuranceDbContext : DbContext
{
    public InsuranceDbContext(DbContextOptions<InsuranceDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Claim> Claims { get; set; }

    public virtual DbSet<Customer> Customers { get; set; }

    public virtual DbSet<Payment> Payments { get; set; }

    public virtual DbSet<Policy> Policies { get; set; }

    public virtual DbSet<PolicyType> PolicyTypes { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Claim>(entity =>
        {
            entity.HasKey(e => e.ClaimId).HasName("pk_Claim");

            entity.ToTable("Claim");

            entity.HasIndex(e => e.PolicyId, "ix_Claim_policyID");

            entity.Property(e => e.ClaimId)
                .ValueGeneratedNever()
                .HasColumnName("claimID");
            entity.Property(e => e.ApprovedAmount)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("approvedAmount");
            entity.Property(e => e.ClaimAmount)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("claimAmount");
            entity.Property(e => e.ClaimDescription)
                .HasMaxLength(1000)
                .HasColumnName("claimDescription");
            entity.Property(e => e.ClaimStatus)
                .HasMaxLength(20)
                .HasDefaultValue("Submitted", "df_Claim_claimStatus")
                .HasColumnName("claimStatus");
            entity.Property(e => e.DecisionNote)
                .HasMaxLength(500)
                .HasColumnName("decisionNote");
            entity.Property(e => e.IncidentDate).HasColumnName("incidentDate");
            entity.Property(e => e.PolicyId).HasColumnName("policyID");
            entity.Property(e => e.ResolvedDate).HasColumnName("resolvedDate");
            entity.Property(e => e.SubmittedDate)
                .HasDefaultValueSql("(CONVERT([date],getdate()))", "df_Claim_submittedDate")
                .HasColumnName("submittedDate");

            entity.HasOne(d => d.Policy).WithMany(p => p.Claims)
                .HasForeignKey(d => d.PolicyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_Claim_Policy");
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasKey(e => e.CustomerId).HasName("pk_customerID");

            entity.ToTable("Customer");

            entity.HasIndex(e => e.CustomerEmail, "unq_customerEmail").IsUnique();

            entity.Property(e => e.CustomerId)
                .ValueGeneratedNever()
                .HasColumnName("customerID");
            entity.Property(e => e.CustomerDob).HasColumnName("customerDOB");
            entity.Property(e => e.CustomerEmail)
                .HasMaxLength(254)
                .HasColumnName("customerEmail");
            entity.Property(e => e.CustomerPhone)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("customerPhone");
            entity.Property(e => e.FirstName)
                .HasMaxLength(50)
                .HasColumnName("firstName");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true, "df_customerIsActive")
                .HasColumnName("isActive");
            entity.Property(e => e.LastName)
                .HasMaxLength(50)
                .HasColumnName("lastName");
            entity.Property(e => e.PasswordHash)
                .HasMaxLength(255)
                .HasColumnName("passwordHash");
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(e => e.PaymentId).HasName("pk_Payment");

            entity.ToTable("Payment");

            entity.HasIndex(e => e.PolicyId, "ix_Payment_policyID");

            entity.HasIndex(e => new { e.PolicyId, e.DueDate }, "unq_Payment_policy_dueDate").IsUnique();

            entity.Property(e => e.PaymentId)
                .ValueGeneratedNever()
                .HasColumnName("paymentID");
            entity.Property(e => e.Amount)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("amount");
            entity.Property(e => e.DueDate).HasColumnName("dueDate");
            entity.Property(e => e.LateFee)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("lateFee");
            entity.Property(e => e.PaidDate)
                .HasPrecision(0)
                .HasColumnName("paidDate");
            entity.Property(e => e.PaymentStatus)
                .HasMaxLength(20)
                .HasDefaultValue("Pending", "df_Payment_paymentStatus")
                .HasColumnName("paymentStatus");
            entity.Property(e => e.PolicyId).HasColumnName("policyID");

            entity.HasOne(d => d.Policy).WithMany(p => p.Payments)
                .HasForeignKey(d => d.PolicyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_Payment_Policy");
        });

        modelBuilder.Entity<Policy>(entity =>
        {
            entity.HasKey(e => e.PolicyId).HasName("pk_Policy");

            entity.ToTable("Policy", tb =>
                {
                    tb.HasTrigger("cancelPayments");
                    tb.HasTrigger("createPayments");
                });

            entity.HasIndex(e => e.CustomerId, "ix_Policy_customerID");

            entity.Property(e => e.PolicyId)
                .ValueGeneratedNever()
                .HasColumnName("policyID");
            entity.Property(e => e.CoverageAmount)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("coverageAmount");
            entity.Property(e => e.CustomerId).HasColumnName("customerID");
            entity.Property(e => e.EndDate).HasColumnName("endDate");
            entity.Property(e => e.MonthlyPremium)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("monthlyPremium");
            entity.Property(e => e.PolicyStatus)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "df_Policy_policyStatus")
                .HasColumnName("policyStatus");
            entity.Property(e => e.PolicyTypeId).HasColumnName("policyTypeID");
            entity.Property(e => e.StartDate).HasColumnName("startDate");

            entity.HasOne(d => d.Customer).WithMany(p => p.Policies)
                .HasForeignKey(d => d.CustomerId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_Policy_Customer");

            entity.HasOne(d => d.PolicyType).WithMany(p => p.Policies)
                .HasForeignKey(d => d.PolicyTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_Policy_PolicyType");
        });

        modelBuilder.Entity<PolicyType>(entity =>
        {
            entity.HasKey(e => e.PolicyTypeId).HasName("pk_PolicyType");

            entity.ToTable("PolicyType");

            entity.HasIndex(e => e.TypeName, "unq_PolicyType_typeName").IsUnique();

            entity.Property(e => e.PolicyTypeId).HasColumnName("policyTypeID");
            entity.Property(e => e.BaseRate)
                .HasColumnType("decimal(6, 4)")
                .HasColumnName("baseRate");
            entity.Property(e => e.Factor25to64)
                .HasColumnType("decimal(4, 2)")
                .HasColumnName("factor25to64");
            entity.Property(e => e.Factor65plus)
                .HasColumnType("decimal(4, 2)")
                .HasColumnName("factor65plus");
            entity.Property(e => e.FactorUnder25)
                .HasColumnType("decimal(4, 2)")
                .HasColumnName("factorUnder25");
            entity.Property(e => e.MaxCoverage)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("maxCoverage");
            entity.Property(e => e.MinCoverage)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("minCoverage");
            entity.Property(e => e.TypeName)
                .HasMaxLength(30)
                .HasColumnName("typeName");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
