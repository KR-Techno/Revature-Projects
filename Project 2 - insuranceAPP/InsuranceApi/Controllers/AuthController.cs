// Checks customer password, then asks for a token from TokenService.cs
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Services;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly ICustomerRepository _customers;
    private readonly ITokenService _tokens;
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("timing-protection-only");

    public AuthController(ICustomerRepository customers, ITokenService tokens)
    {
        _customers = customers;
        _tokens = tokens;
    }

    [HttpPost("register")]
    // POST /api/auth/register
    // Validates and hashes the new customer's details, then creates their account and returns the new customer ID
    public async Task<IActionResult> Register(RegisterRequestDto request)
    {
        if (request.DateOfBirth > DateOnly.FromDateTime(DateTime.Today))
            return BadRequest(new { message = "Date of birth cannot be in the future." });

        request.Email = request.Email.Trim();
        if (!PhoneFormatter.TryFormat(request.Phone, out var formattedPhone))
            return BadRequest(new { message = "Please enter a valid phone number." });
        request.Phone = formattedPhone;
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        var id = await _customers.CreateAsync(request, passwordHash);
        return StatusCode(StatusCodes.Status201Created, new RegisterResponseDto { CustomerID = id });
    }

    [HttpPost("login")]
    // POST /api/auth/login
    // Checks the customer's email and password, then returns a JWT token if the account is active
    public async Task<IActionResult> Login(LoginRequestDto request)
    {
        var customer = await _customers.GetLoginAsync(request.Email.Trim());

        // always run a BCrypt check, even for an unknown email, so response time can't reveal which emails exist
        var passwordOk = BCrypt.Net.BCrypt.Verify(request.Password, customer?.PasswordHash ?? DummyHash);

        if (customer is null || !passwordOk)
            return Unauthorized(new { message = "Incorrect email or password." });

        if (!customer.IsActive)
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "This account has been deactivated. Please contact support to reactivate it." });

        // the role decides which area the token can open (customer pages or /api/admin);
        // after an admin reset the token is also limited to changing the password (see the "mcp" check in Program.cs)
        var (token, expiresAt) = _tokens.CreateToken(customer.CustomerID, customer.Role, customer.MustChangePassword);
        return Ok(new LoginResponseDto { CustomerID = customer.CustomerID, Token = token, ExpiresAt = expiresAt });
    }
}