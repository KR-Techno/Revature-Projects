// DTOs for all customer profile related requests and responses
using System.ComponentModel.DataAnnotations;

namespace InsuranceApi.Dtos;

// UpdateContactRequestDto is used to update a customer's email and phone number
// Requires password for verification and validates email and phone formats
public class UpdateContactRequestDto
{
    [Required, EmailAddress, StringLength(254)]
    public string Email { get; set; } = "";

    [Required, StringLength(25)]
    public string Phone { get; set; } = "";

    // Needed to verify all contact made
    [Required]
    public string CurrentPassword { get; set; } = "";
}

// ChangePasswordRequestDto is used to change a customer's password.
// For security, requires current password as verification to change passwords
public class ChangePasswordRequestDto
{
    [Required]
    public string CurrentPassword { get; set; } = "";

    [Required, StringLength(64, MinimumLength = 8)]
    [RegularExpression(PasswordRules.Pattern, ErrorMessage = PasswordRules.Message)]
    [DataType(DataType.Password)]
    public string NewPassword { get; set; } = "";
}

// DeactivateRequestDto is used to deactivate a customer's account.
// Requires current password as verification for deactivation.
public class DeactivateRequestDto
{
    [Required]
    public string CurrentPassword { get; set; } = "";
}

// used only inside the API to check a password; never returned to the browser
public class PasswordHashDto
{
    public string PasswordHash { get; set; } = "";
}