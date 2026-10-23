// Repository for everything the ADMIN can do; every method calls one admin stored procedure.
using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

// Interface for AdminRepository, registered for DI in Program.cs
public interface IAdminRepository
{
    Task<List<AdminCustomerDto>> GetCustomersAsync();
    Task<CustomerDto?> UpdateCustomerAsync(int customerId, string firstName, string lastName, DateOnly dateOfBirth);
    Task DeactivateCustomerAsync(int customerId);
    Task ResetCustomerPasswordAsync(int customerId, string passwordHash);
    Task ReactivateCustomerAsync(int customerId);
    Task<List<AdminClaimDto>> GetClaimsAsync();
    Task<List<AdminPaymentDto>> GetPaymentsAsync();
    Task<List<AdminQuoteDto>> GetQuotesAsync();
    Task<List<AdminProductSummaryDto>> GetProductSummaryAsync();
    Task<List<AdminProductCustomerDto>> GetProductCustomersAsync(int policyTypeId);
    Task DecideClaimAsync(int claimId, string decision, decimal? approvedAmount, string? decisionNote);
    Task<int> CreatePolicyTypeAsync(CreatePolicyTypeRequestDto request);
}

public class AdminRepository : IAdminRepository
{
    // DI for DbContext, allowing access to the DB using EF Core.
    private readonly InsuranceDbContext _db;
    public AdminRepository(InsuranceDbContext db) => _db = db;

    // decimal parameters state their SQL type explicitly instead of letting it be guessed
    private static SqlParameter Dec(string name, decimal? value, byte precision, byte scale) =>
        new(name, SqlDbType.Decimal) { Precision = precision, Scale = scale, Value = (object?)value ?? DBNull.Value };

    // every customer with how many active policies and open claims they have
    public Task<List<AdminCustomerDto>> GetCustomersAsync() =>
        _db.Database.SqlQuery<AdminCustomerDto>($"EXEC admin_GetCustomers").ToListAsync();

    // returns the updated customer (same columns as get_CustomerByID)
    public async Task<CustomerDto?> UpdateCustomerAsync(int customerId, string firstName, string lastName, DateOnly dateOfBirth)
    {
        var rows = await _db.Database.SqlQueryRaw<CustomerDto>(
            "EXEC admin_UpdateCustomer @customerID, @firstName, @lastName, @customerDOB",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@firstName", firstName),
            new SqlParameter("@lastName", lastName),
            new SqlParameter("@customerDOB", SqlDbType.Date) { Value = dateOfBirth.ToDateTime(TimeOnly.MinValue) }
        ).ToListAsync();
        return rows.FirstOrDefault();
    }

    public Task DeactivateCustomerAsync(int customerId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC admin_DeactivateCustomer {customerId}");

    // stores the (already hashed) temporary password and flags the account so the customer must change it
    public Task ResetCustomerPasswordAsync(int customerId, string passwordHash) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC admin_ResetCustomerPassword {customerId}, {passwordHash}");

    // reuses the customer_Reactivate procedure that already existed
    public Task ReactivateCustomerAsync(int customerId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC customer_Reactivate {customerId}");

    // every claim from every customer, for the admin's review list
    public Task<List<AdminClaimDto>> GetClaimsAsync() =>
        _db.Database.SqlQuery<AdminClaimDto>($"EXEC admin_GetClaims").ToListAsync();

    // every payment from every customer; the procedure sorts the overdue ones first
    public Task<List<AdminPaymentDto>> GetPaymentsAsync() =>
        _db.Database.SqlQuery<AdminPaymentDto>($"EXEC admin_GetPayments").ToListAsync();

    // every quote customers have requested, newest first
    public Task<List<AdminQuoteDto>> GetQuotesAsync() =>
        _db.Database.SqlQuery<AdminQuoteDto>($"EXEC admin_GetQuotes").ToListAsync();

    // every policy product, with its level names and how many customers currently hold it
    public Task<List<AdminProductSummaryDto>> GetProductSummaryAsync() =>
        _db.Database.SqlQuery<AdminProductSummaryDto>($"EXEC admin_GetProductSummary").ToListAsync();

    // the customers who currently hold one product, each with their policy details
    public Task<List<AdminProductCustomerDto>> GetProductCustomersAsync(int policyTypeId) =>
        _db.Database.SqlQuery<AdminProductCustomerDto>($"EXEC admin_GetProductCustomers {policyTypeId}").ToListAsync();

    // approves or denies a claim; null amount/note are sent to SQL as NULL
    public Task DecideClaimAsync(int claimId, string decision, decimal? approvedAmount, string? decisionNote) =>
        _db.Database.ExecuteSqlRawAsync(
            "EXEC admin_DecideClaim @claimID, @decision, @approvedAmount, @decisionNote",
            new SqlParameter("@claimID", claimId),
            new SqlParameter("@decision", decision),
            Dec("@approvedAmount", approvedAmount, 12, 2),
            new SqlParameter("@decisionNote", (object?)decisionNote ?? DBNull.Value));

    // the coverage levels travel to SQL as one JSON text; the procedure unpacks it and saves everything in one transaction
    public async Task<int> CreatePolicyTypeAsync(CreatePolicyTypeRequestDto r)
    {
        // Web defaults = camelCase names (levelName, minCoverage, ...), which is what the procedure reads
        var levelsJson = JsonSerializer.Serialize(r.Levels, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var newId = new SqlParameter("@policyTypeID", SqlDbType.Int) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC admin_CreatePolicyType @typeName, @baseRate, @factorUnder25, @factor25to64, @factor65plus, @levelsJson, @policyTypeID OUTPUT",
            new SqlParameter("@typeName", r.TypeName),
            Dec("@baseRate", r.BaseRate, 6, 4),
            Dec("@factorUnder25", r.FactorUnder25, 4, 2),
            Dec("@factor25to64", r.Factor25to64, 4, 2),
            Dec("@factor65plus", r.Factor65plus, 4, 2),
            new SqlParameter("@levelsJson", SqlDbType.NVarChar, -1) { Value = levelsJson },
            newId);

        return (int)newId.Value;
    }
}
