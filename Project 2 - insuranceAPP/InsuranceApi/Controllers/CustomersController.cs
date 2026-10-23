// API for handling customer related requests and responses
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;
using InsuranceApi.Services;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CustomersController : ControllerBase
{
    // DI of the customer repository to allow access to customer data and operations
    private readonly ICustomerRepository _customers;
    public CustomersController(ICustomerRepository customers) => _customers = customers;

    [HttpGet("me")]
    public async Task<ActionResult<CustomerDto>> GetMe()
    {
        var customer = await _customers.GetByIdAsync(User.GetCustomerId());
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpPut("me/contact")]
    // UpdateContact function loads current profile, figures out if the email or phone number has changed,
    // and if so, demands the password to be entered to verify the change.
    // Order matters: password must be checked first for verification
    public async Task<IActionResult> UpdateContact(UpdateContactRequestDto request)
    {
        var id = User.GetCustomerId();

        // any change to personal info requires proof it's really the owner
        if (!await PasswordMatchesAsync(id, request.CurrentPassword))
            return BadRequest(new { message = "Current password is incorrect." });

        if (!PhoneFormatter.TryFormat(request.Phone, out var formattedPhone))
            return BadRequest(new { message = "Please enter a valid phone number." });

        await _customers.UpdateContactAsync(id, request.Email.Trim(), formattedPhone);
        return Ok(await _customers.GetByIdAsync(id));
    }
    [HttpPut("me/password")]
    // Verifies old password, rejects using it again,
    // before hashing the new password and saving to the database.
    public async Task<IActionResult> ChangePassword(ChangePasswordRequestDto request)
    {
        var id = User.GetCustomerId();

        if (!await PasswordMatchesAsync(id, request.CurrentPassword))
            return BadRequest(new { message = "Current password is incorrect." });

        if (request.CurrentPassword == request.NewPassword)
            return BadRequest(new { message = "Your new password must be different from your current one." });

        await _customers.ChangePasswordAsync(id, BCrypt.Net.BCrypt.HashPassword(request.NewPassword));
        return Ok(new { message = "Password updated." });
    }

    [HttpPost("me/deactivate")]
    // Verifies old password, then let's the SQL procedure decide if deactivation is allowed.
    // If not, return 409 Conflict.
    // Uses a POST instead of DELETE because the account is not actually being deleted.
    public async Task<IActionResult> Deactivate(DeactivateRequestDto request)
    {
        var id = User.GetCustomerId();

        if (!await PasswordMatchesAsync(id, request.CurrentPassword))
            return BadRequest(new { message = "Current password is incorrect." });

        await _customers.DeactivateAsync(id);
        return Ok(new { message = "Your account has been deactivated. Contact support to reactivate it." });
    }

    // Private helper method that checks and sees if all three methods stay consistent
    private async Task<bool> PasswordMatchesAsync(int customerId, string password)
    {
        var hash = await _customers.GetPasswordHashAsync(customerId);
        return hash is not null && BCrypt.Net.BCrypt.Verify(password, hash);
    }
}