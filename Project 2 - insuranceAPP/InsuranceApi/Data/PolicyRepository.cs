// Repository for POLICY information, implementing the IPolicyRepository interface.
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

// Interface for PolicyRepository
// Using DI to inject dependencies and define DTO methods that the repository will implement.
public interface IPolicyRepository
{
    Task<List<PolicyTypeDto>> GetCatalogAsync();
    Task<QuoteDto?> GetQuoteAsync(int customerId, int policyTypeId, int coverageLevelId, decimal coverage);
    Task<List<PolicyDto>> GetByCustomerAsync(int customerId);
    Task<CoverageChangedDto?> ChangeCoverageAsync(int customerId, int policyId, int newCoverageLevelId, decimal newCoverage);
    Task CancelAsync(int customerId, int policyId);
}

// Classes implementing the IPolicyRepository interface,
public class PolicyRepository : IPolicyRepository
{
    // DI for DbContext, allowing access to the DB using EF Core.
    // Encapsulates database access logic
    private readonly InsuranceDbContext _db;
    public PolicyRepository(InsuranceDbContext db) => _db = db;

    // coverage is decimal(12,2) in SQL, so we state that explicitly instead of letting it be guessed
    // (the name is passed in because quote/buy use @coverageAmount and change-coverage uses @newCoverageAmount)
    private static SqlParameter CoverageParam(string name, decimal value) =>
        new(name, SqlDbType.Decimal) { Precision = 12, Scale = 2, Value = value };

    // GetCatalogAsync reads the flat product + level rows from get_PolicyCatalog
    // and groups them into products, each with its list of coverage levels.
    public async Task<List<PolicyTypeDto>> GetCatalogAsync()
    {
        var rows = await _db.Database.SqlQueryRaw<CatalogRowDto>("EXEC get_PolicyCatalog").ToListAsync();

        // the procedure already sorts by product name then level order, so grouping keeps that order
        return rows
            .GroupBy(r => new { r.PolicyTypeID, r.TypeName })
            .Select(g => new PolicyTypeDto
            {
                PolicyTypeID = g.Key.PolicyTypeID,
                TypeName = g.Key.TypeName,
                // each level carries its own min/max coverage, so the range moves down with it
                Levels = g.Select(r => new CoverageLevelDto
                {
                    CoverageLevelID = r.CoverageLevelID,
                    LevelName = r.LevelName,
                    Description = r.Description,
                    MinCoverage = r.MinCoverage,
                    MaxCoverage = r.MaxCoverage
                }).ToList()
            })
            .ToList();
    }

    // GetQuoteAsync retrives a quote for a policy based on customerId, product, coverage level
    // and coverage amount, returning a QuoteDto object or null if not found.
    public async Task<QuoteDto?> GetQuoteAsync(int customerId, int policyTypeId, int coverageLevelId, decimal coverage)
    {
        var rows = await _db.Database.SqlQueryRaw<QuoteDto>(
            "EXEC get_quotePolicy @customerID, @policyTypeID, @coverageLevelID, @coverageAmount",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@policyTypeID", policyTypeId),
            new SqlParameter("@coverageLevelID", coverageLevelId),
            CoverageParam("@coverageAmount", coverage)).ToListAsync();
        return rows.FirstOrDefault();
    }

    // GetByCustomerAsync retrieves all policies for a specific customer from the database,
    // returning a list of PolicyDto objects. Uses async/await for non-blocking database access.
    public Task<List<PolicyDto>> GetByCustomerAsync(int customerId) =>
        _db.Database.SqlQuery<PolicyDto>($"EXEC get_CustomerPolicies {customerId}").ToListAsync();

    // ChangeCoverageAsync retrieves policy per customer request and updates their coverage level and/or amount
    public async Task<CoverageChangedDto?> ChangeCoverageAsync(int customerId, int policyId, int newCoverageLevelId, decimal newCoverage)
    {
        var rows = await _db.Database.SqlQueryRaw<CoverageChangedDto>(
            "EXEC update_PolicyCoverage @customerID, @policyID, @newCoverageLevelID, @newCoverageAmount",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@policyID", policyId),
            new SqlParameter("@newCoverageLevelID", newCoverageLevelId),
            CoverageParam("@newCoverageAmount", newCoverage)
        ).ToListAsync();
        return rows.FirstOrDefault();
    }

    // CancelAsync cancels a policy for a specific customer in the database using a stored procedure.
    public Task CancelAsync(int customerId, int policyId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC cancel_Policy {customerId}, {policyId}");
}
