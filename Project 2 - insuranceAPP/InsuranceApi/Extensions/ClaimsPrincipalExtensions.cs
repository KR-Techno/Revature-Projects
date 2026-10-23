using System.Security.Claims;

namespace InsuranceApi.Extensions;

public static class ClaimsPrincipalExtensions
{
    // the one trusted place the customer ID comes from: the validated token
    public static int GetCustomerId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirst("sub")?.Value ?? throw new UnauthorizedAccessException());
}