// DTO for all LOGIN information
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

public class LoginRequestDto
{
    // Data annotations for validation, ensuring the API receives valid data from the Angular frontend.
    // Required fields for login, ensures user enters both username (email) and password.
    [Required] public string Email { get; set; } = "";
    [Required] public string Password { get; set; } = "";
}

public class LoginResponseDto
{
    public int CustomerID { get; set; }
    public string Token { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
}

// used only inside the API to check a login; never returned to the browser
public class CustomerLoginDto
{
    public int CustomerID { get; set; }
    public string CustomerEmail { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsActive { get; set; }
    public bool MustChangePassword { get; set; }       // true after an admin reset
    public string Role { get; set; } = "Customer";   // "Customer" or "Admin"; goes into the token
}