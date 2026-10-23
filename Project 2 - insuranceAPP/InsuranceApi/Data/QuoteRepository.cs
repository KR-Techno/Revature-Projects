// Repository for saved QUOTES; every method calls one quote stored procedure.
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

// Interface for QuoteRepository, registered for DI in Program.cs
public interface IQuoteRepository
{
    Task<SavedQuoteDto?> CreateAsync(int customerId, CreateQuoteRequestDto request);
    Task<List<SavedQuoteDto>> GetByCustomerAsync(int customerId);
    Task DismissAsync(int customerId, int quoteId);
    Task<int> BuyAsync(int customerId, int quoteId, string paymentPlan);
}

public class QuoteRepository : IQuoteRepository
{
    // DI for DbContext, allowing access to the DB using EF Core.
    private readonly InsuranceDbContext _db;
    public QuoteRepository(InsuranceDbContext db) => _db = db;

    // saves (or refreshes) a quote and returns it; the price is worked out inside the procedure, never sent in
    public async Task<SavedQuoteDto?> CreateAsync(int customerId, CreateQuoteRequestDto r)
    {
        var rows = await _db.Database.SqlQueryRaw<SavedQuoteDto>(
            "EXEC quote_Create @customerID, @policyTypeID, @coverageLevelID, @coverageAmount",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@policyTypeID", r.PolicyTypeID),
            new SqlParameter("@coverageLevelID", r.CoverageLevelID),
            // coverage is decimal(12,2) in SQL, so the type is stated instead of guessed
            new SqlParameter("@coverageAmount", SqlDbType.Decimal) { Precision = 12, Scale = 2, Value = r.CoverageAmount }
        ).ToListAsync();
        return rows.FirstOrDefault();
    }

    // the logged-in customer's own quotes (the procedure filters by customer ID)
    public Task<List<SavedQuoteDto>> GetByCustomerAsync(int customerId) =>
        _db.Database.SqlQuery<SavedQuoteDto>($"EXEC quote_GetByCustomer {customerId}").ToListAsync();

    // hides a quote from the customer's list; the customer ID stops anyone dismissing someone else's quote
    public Task DismissAsync(int customerId, int quoteId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC quote_Dismiss {customerId}, {quoteId}");

    // creates the policy from the quote's stored price; returns the new policy number
    public async Task<int> BuyAsync(int customerId, int quoteId, string paymentPlan)
    {
        var newId = new SqlParameter("@policyID", SqlDbType.Int) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC create_PolicyFromQuote @customerID, @quoteID, @paymentPlan, @policyID OUTPUT",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@quoteID", quoteId),
            new SqlParameter("@paymentPlan", paymentPlan),
            newId);

        return (int)newId.Value;
    }
}
