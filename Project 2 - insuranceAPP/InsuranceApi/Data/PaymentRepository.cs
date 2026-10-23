// Repository for Payments, handling database access and operations related to payments
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

// Interface for payment repository, defines methods for retrieving and processing customer payments
public interface IPaymentRepository
{
    Task<List<PaymentDto>> GetByCustomerAsync(int customerId);
    Task<PaymentReceiptDto?> PayAsync(int customerId, int policyId);
}

// Implementation of the payment repository using the above interface.
// Provides concrete methods for accessing payment data from the DB using EF Core.
public class PaymentRepository : IPaymentRepository
{
    private readonly InsuranceDbContext _db;
    public PaymentRepository(InsuranceDbContext db) => _db = db;

    // GetByCustomerAsync retrieves a list of payments for a specific customer
    public Task<List<PaymentDto>> GetByCustomerAsync(int customerId) =>
        _db.Database.SqlQuery<PaymentDto>($"EXEC get_CustomerPayments {customerId}").ToListAsync();

    // PayAsync processes a payment for a specific policy and customer,
    // ensures that the payment is recorded and returns a receipt if successful.
    public async Task<PaymentReceiptDto?> PayAsync(int customerId, int policyId)
    {
        var rows = await _db.Database
            .SqlQuery<PaymentReceiptDto>($"EXEC pay_Payment {customerId}, {policyId}")
            .ToListAsync();
        return rows.FirstOrDefault();
    }
}