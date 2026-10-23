namespace InsuranceApi.Dtos;

public static class PasswordRules
{
    // each (?=...): requires at least one of that kind of character somewhere in the password
    public const string Pattern = @"^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*[0-9])(?=.*[^\p{L}\p{N}\s]).+$";

    public const string Message =
        "Password must include an uppercase letter, a lowercase letter, a number and a special character.";
}