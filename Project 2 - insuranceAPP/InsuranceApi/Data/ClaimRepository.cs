// Repository for all Claim-related requests, handling database access and operations
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

// Interface for ClaimRepository defines methods for all Claim-related actions,
// using DI to allow for DTOs to be used across this repository.
public interface IClaimRepository
{
    Task<List<ClaimDto>> GetByCustomerAsync(int customerId);
    Task<int> SubmitAsync(int customerId, SubmitClaimRequestDto dto);
    Task WithdrawAsync(int customerId, int claimId);
}

public class ClaimRepository : IClaimRepository
{
    private readonly InsuranceDbContext _db;
    public ClaimRepository(InsuranceDbContext db) => _db = db;

    // GetByCustomerAsync retrieves customer claims from the DB using the stored procedure
    public Task<List<ClaimDto>> GetByCustomerAsync(int customerId) =>
        _db.Database.SqlQuery<ClaimDto>($"EXEC get_CustomerClaims {customerId}").ToListAsync();

    // SubmitAsync submits customer claims, using the stored proecdures in the DB,
    // while returning a new random claim number
    public async Task<int> SubmitAsync(int customerId, SubmitClaimRequestDto dto)
    {
        var newId = new SqlParameter("@claimID", SqlDbType.Int) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC submit_Claim @customerID, @policyID, @incidentDate, @claimDescription, @claimAmount, @claimID OUTPUT",
            new SqlParameter("@customerID", customerId),
            new SqlParameter("@policyID", dto.PolicyID),
            new SqlParameter("@incidentDate", SqlDbType.Date) { Value = dto.IncidentDate.ToDateTime(TimeOnly.MinValue) },
            new SqlParameter("@claimDescription", dto.ClaimDescription),
            new SqlParameter("@claimAmount", SqlDbType.Decimal) { Precision = 12, Scale = 2, Value = dto.ClaimAmount },
            newId);

        return (int)newId.Value;
    }

    // WithdrawAsync executes withdraw_Claim's stored procedure in DB.
    public Task WithdrawAsync(int customerId, int claimId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC withdraw_Claim {customerId}, {claimId}");
}