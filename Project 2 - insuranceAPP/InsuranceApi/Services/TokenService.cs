// Sole responsibility is to build and sign the JWT token for a given customerId and role.
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace InsuranceApi.Services;

public interface ITokenService
{
    (string Token, DateTime ExpiresAt) CreateToken(int customerId, string role, bool mustChangePassword);
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _config;
    public TokenService(IConfiguration config) => _config = config;

    public (string Token, DateTime ExpiresAt) CreateToken(int customerId, string role, bool mustChangePassword)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var expires = DateTime.UtcNow.AddMinutes(int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60"));

        var claims = new List<Claim>
        {
            new("sub", customerId.ToString()),
            new("role", role)
        };
        // "mcp" (must change password): set after an admin reset; the API then only allows changing the password
        if (mustChangePassword)
            claims.Add(new Claim("mcp", "1"));

        var descriptor = new SecurityTokenDescriptor
        {
            // "sub" (subject) is the standard JWT claim for "who this token is about"
            // the "role" claim ("Customer" or "Admin") is what [Authorize(Roles = "Admin")] checks on the admin endpoints
            Subject = new ClaimsIdentity(claims),
            Issuer = _config["Jwt:Issuer"],
            Audience = _config["Jwt:Audience"],
            Expires = expires,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        };

        return (new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}
