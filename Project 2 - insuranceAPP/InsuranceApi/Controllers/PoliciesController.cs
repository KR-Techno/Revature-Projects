// Controller for policies, handling HTTP requests and responses related to the insurance policies
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;

[ApiController]
[Route("api/[controller]")]
[Authorize]

public class PoliciesController : ControllerBase
{
    // Encapsulates logic for accessing policy data from the DB
    // Allows the controller to call repository methods without knowing DB details
    private readonly IPolicyRepository _policies;
    public PoliciesController(IPolicyRepository policies) => _policies = policies;

    [HttpGet("catalog")]
    // GET /api/policies/catalog
    // Returns every product with its coverage levels (name + description) for the buy form.
    public async Task<ActionResult<List<PolicyTypeDto>>> Catalog() =>
        Ok(await _policies.GetCatalogAsync());

    [HttpGet]
    // GET /api/policies
    // Returns list of policies for authenticated customer,
    // using the customer ID from the JWT token claims.
    public async Task<ActionResult<List<PolicyDto>>> GetMine() =>
        Ok(await _policies.GetByCustomerAsync(User.GetCustomerId()));

    [HttpPost("quote")]
    // POST /api/policies/quote
    // Returns an unsaved price preview based on customer ID, product, coverage level, and coverage amount.
    // Used by the change-coverage dialog; new policies are quoted and bought through /api/quotes instead.
    public async Task<IActionResult> Quote(PolicyRequestDto request)
    {
        var quote = await _policies.GetQuoteAsync(User.GetCustomerId(), request.PolicyTypeID, request.CoverageLevelID, request.CoverageAmount);
        return quote is null ? NotFound() : Ok(quote);
    }

    [HttpPut("{policyId:int}/coverage")]
    // PUT /api/policies/{policyId}/coverage
    // Updates customer policy (level and/or amount) for authenticated customer based on their request
    public async Task<ActionResult<CoverageChangedDto>> ChangeCoverage(int policyId, ChangeCoverageRequestDto request)
    {
        var result = await _policies.ChangeCoverageAsync(User.GetCustomerId(), policyId, request.NewCoverageLevelID, request.NewCoverageAmount);
        return Ok(result);
    }

    [HttpPost("{policyId:int}/cancel")]
    // POST /api/policies/{policyId}/cancel
    // Cancels a policy for the authenticated customer based on policy ID or if customer cancels.
    public async Task<IActionResult> Cancel(int policyId)
    {
        await _policies.CancelAsync(User.GetCustomerId(), policyId);
        return Ok(new { message = "Policy cancelled." });
    }
}
