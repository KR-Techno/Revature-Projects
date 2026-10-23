namespace InsuranceApi.Dtos;

// DTO for returning customer info in API responses, omitting sensitive data like password hash
// Defines what goes in and out of the login
public class CustomerDto
{
    public int CustomerID { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateOnly CustomerDOB { get; set; }
    public string CustomerEmail { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public bool IsActive { get; set; }
}