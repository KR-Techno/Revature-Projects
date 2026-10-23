// DTO for all REGISTER information
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

public class RegisterRequestDto
{
    // Data annotations for validation, ensuring the API receives valid data from the Angular frontend.
    // Required fields, string length limits, and regex patterns for names to ensure proper formatting.
    // "\p{L}... matches check constraint from DB.
    [Required, StringLength(50)]
    [RegularExpression(@"^[\p{L} .'\-]+$", ErrorMessage = "Names cannot contain numbers or special characters.")]
    public string FirstName { get; set; } = "";

    [Required, StringLength(50)]
    [RegularExpression(@"^[\p{L} .'\-]+$", ErrorMessage = "Names cannot contain numbers or special characters.")]
    public string LastName { get; set; } = "";

    public DateOnly DateOfBirth { get; set; }

    [Required, EmailAddress, StringLength(254)]
    public string Email { get; set; } = "";

    [Required, StringLength(25)]
    public string Phone { get; set; } = "";

    // Password validation using regex pattern defined in PasswordRules DTO class, ensuring passwords are complex.
    [Required, StringLength(64, MinimumLength = 8)]
    [RegularExpression(PasswordRules.Pattern, ErrorMessage = PasswordRules.Message)]
    public string Password { get; set; } = "";
}
// Only returns CustomerID, not the password hash, for security reasons.
public class RegisterResponseDto
{
    public int CustomerID { get; set; }
}