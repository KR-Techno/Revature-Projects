// API controller for handling payment-related requests
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;

[ApiController]
[Route("api/[controller]")]
[Authorize]

public class PaymentsController : ControllerBase
{
    private readonly IPaymentRepository _payments;
    public PaymentsController(IPaymentRepository payments) => _payments = payments;

    [HttpGet]
    // GET /api/payments
    // Returns list of payments for the authenticated customer
    public async Task<ActionResult<List<PaymentDto>>> GetMine() =>
        Ok(await _payments.GetByCustomerAsync(User.GetCustomerId()));

    [HttpPost("pay/{policyId:int}")]
    // POST /api/payments/pay/{policyId}
    // Processes a payment for the authenticated customer and specified policy ID
    public async Task<IActionResult> Pay(int policyId)
    {
        var receipt = await _payments.PayAsync(User.GetCustomerId(), policyId);
        return receipt is null ? Conflict(new { message = "No payment is due for this policy." }) : Ok(receipt);
    }
}