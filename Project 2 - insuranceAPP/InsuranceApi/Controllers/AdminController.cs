// Controller for the ADMIN: only a token with the "Admin" role can reach anything in here.
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]   // checked on the server for every call; the Angular menu hiding is only cosmetic
public class AdminController : ControllerBase
{
    // admin procedures, plus the customer repository for checking the admin's own password
    private readonly IAdminRepository _admin;
    private readonly ICustomerRepository _customers;

    public AdminController(IAdminRepository admin, ICustomerRepository customers)
    {
        _admin = admin;
        _customers = customers;
    }

    // Sensitive actions re-check the admin's own password, so a stolen or left-open session can't change things alone.
    // Returns an error response if the password is wrong, or null when it is correct.
    // (400, not 401: the Angular interceptor logs the user out on a 401.)
    private async Task<IActionResult?> CheckPasswordAsync(string password)
    {
        var hash = await _customers.GetPasswordHashAsync(User.GetCustomerId());
        return hash is not null && BCrypt.Net.BCrypt.Verify(password, hash)
            ? null
            : BadRequest(new { message = "Password is incorrect." });
    }

    // Customers

    [HttpGet("customers")]
    // GET /api/admin/customers  (no password needed to view)
    public async Task<ActionResult<List<AdminCustomerDto>>> GetCustomers() =>
        Ok(await _admin.GetCustomersAsync());

    [HttpPut("customers/{customerId:int}")]
    [EnableRateLimiting("auth")]
    // PUT /api/admin/customers/{customerId}: edits name and date of birth (admin password required)
    public async Task<IActionResult> UpdateCustomer(int customerId, AdminUpdateCustomerRequestDto request)
    {
        if (await CheckPasswordAsync(request.Password) is { } bad) return bad;
        var updated = await _admin.UpdateCustomerAsync(customerId, request.FirstName, request.LastName, request.DateOfBirth);
        return Ok(updated);
    }

    [HttpPost("customers/{customerId:int}/deactivate")]
    [EnableRateLimiting("auth")]
    // POST /api/admin/customers/{customerId}/deactivate (admin password required)
    public async Task<IActionResult> Deactivate(int customerId, AdminPasswordRequestDto request)
    {
        if (await CheckPasswordAsync(request.Password) is { } bad) return bad;
        await _admin.DeactivateCustomerAsync(customerId);
        return Ok(new { message = "Account deactivated." });
    }

    [HttpPost("customers/{customerId:int}/reactivate")]
    [EnableRateLimiting("auth")]
    // POST /api/admin/customers/{customerId}/reactivate (admin password required)
    public async Task<IActionResult> Reactivate(int customerId, AdminPasswordRequestDto request)
    {
        if (await CheckPasswordAsync(request.Password) is { } bad) return bad;
        await _admin.ReactivateCustomerAsync(customerId);
        return Ok(new { message = "Account reactivated." });
    }

    [HttpPost("customers/{customerId:int}/reset-password")]
    [EnableRateLimiting("auth")]
    // POST /api/admin/customers/{customerId}/reset-password (admin password required)
    // Creates a random temporary password, returns it ONCE, and forces the customer to change it at next login.
    public async Task<IActionResult> ResetPassword(int customerId, AdminPasswordRequestDto request)
    {
        if (await CheckPasswordAsync(request.Password) is { } bad) return bad;

        // only the hash is stored; the plain temporary password exists just long enough to send back to the admin
        var temporary = GenerateTemporaryPassword();
        await _admin.ResetCustomerPasswordAsync(customerId, BCrypt.Net.BCrypt.HashPassword(temporary));
        return Ok(new TemporaryPasswordDto { TemporaryPassword = temporary });
    }

    // 14 random characters with an upper, lower, digit and symbol (so it passes any normal password rule);
    // look-alike characters (0/O, 1/l/I) are left out so it can be read over the phone
    private static string GenerateTemporaryPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnopqrstuvwxyz",
                     digits = "23456789", symbols = "!@#$%&*?";
        const string all = upper + lower + digits + symbols;

        // RandomNumberGenerator is cryptographically secure, unlike Random, so the password can't be predicted
        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)],
            lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)],
            symbols[RandomNumberGenerator.GetInt32(symbols.Length)]
        };
        while (chars.Count < 14)
            chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);

        // shuffle so the guaranteed characters aren't always first
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }
        return new string(chars.ToArray());
    }

    // Claims

    [HttpGet("claims")]
    // GET /api/admin/claims  (no password needed to view)
    public async Task<ActionResult<List<AdminClaimDto>>> GetClaims() =>
        Ok(await _admin.GetClaimsAsync());

    [HttpPost("claims/{claimId:int}/decision")]
    // POST /api/admin/claims/{claimId}/decision: accept or reject a claim (no password needed)
    public async Task<IActionResult> DecideClaim(int claimId, DecideClaimRequestDto request)
    {
        await _admin.DecideClaimAsync(claimId, request.Decision, request.ApprovedAmount, request.DecisionNote);
        return Ok(new { message = $"Claim {request.Decision.ToLower()}." });
    }

    // Payments

    [HttpGet("payments")]
    // GET /api/admin/payments: every payment record, overdue first (no password needed to view)
    // read-only on purpose: admins can see who owes what, but don't take payments for customers
    public async Task<ActionResult<List<AdminPaymentDto>>> GetPayments() =>
        Ok(await _admin.GetPaymentsAsync());

    // Quotes

    [HttpGet("quotes")]
    // GET /api/admin/quotes: every quote customers have requested (no password needed to view)
    // read-only: useful for seeing who is shopping but not buying
    public async Task<ActionResult<List<AdminQuoteDto>>> GetQuotes() =>
        Ok(await _admin.GetQuotesAsync());

    // Policy products

    [HttpPost("policytypes")]
    [EnableRateLimiting("auth")]
    // POST /api/admin/policytypes: creates a new product with its coverage levels (admin password required)
    public async Task<IActionResult> CreatePolicyType(CreatePolicyTypeRequestDto request)
    {
        if (await CheckPasswordAsync(request.Password) is { } bad) return bad;
        var id = await _admin.CreatePolicyTypeAsync(request);
        return StatusCode(StatusCodes.Status201Created, new PolicyTypeCreatedDto { PolicyTypeID = id });
    }
}
