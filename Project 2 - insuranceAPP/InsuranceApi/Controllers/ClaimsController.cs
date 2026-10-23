// API for handling customer claims related requests and responses
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ClaimsController : ControllerBase
{
    // Encapsulates ClaimRepository, allowing the controller to use methods from the Repository
    private readonly IClaimRepository _claims;
    public ClaimsController(IClaimRepository claims) => _claims = claims;

    [HttpGet]
    // GET /api/claims
    // Returns list of claims for the authenticated customer
    public async Task<ActionResult<List<ClaimDto>>> GetMine() =>
        Ok(await _claims.GetByCustomerAsync(User.GetCustomerId()));

    [HttpPost]
    // POST /api/claims
    // Submits a new claim on one of the authenticated customer's policies and returns the new claim ID
    public async Task<IActionResult> Submit(SubmitClaimRequestDto request)
    {
        request.ClaimDescription = request.ClaimDescription.Trim();

        var id = await _claims.SubmitAsync(User.GetCustomerId(), request);
        return StatusCode(StatusCodes.Status201Created, new ClaimCreatedDto { ClaimID = id });
    }

    [HttpPost("{claimId:int}/withdraw")]
    // POST /api/claims/{claimId}/withdraw
    // Withdraws the specified claim if it belongs to the authenticated customer,
    // and can still be withdrawn
    public async Task<IActionResult> Withdraw(int claimId)
    {
        await _claims.WithdrawAsync(User.GetCustomerId(), claimId);
        return Ok(new { message = "Claim withdrawn." });
    }
}