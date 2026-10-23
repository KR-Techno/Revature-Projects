// Repository for all Customer related information, handles database access and operations
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using InsuranceApi.Dtos;

namespace InsuranceApi.Data;

/*This interface defines the contract for all customer related operations,
 using DI to allow for DTOs to be used in the repository,
 which are then returned to the controller for API responses.*/
public interface ICustomerRepository
{
    Task<int> CreateAsync(RegisterRequestDto dto, string passwordHash);
    Task<CustomerLoginDto?> GetLoginAsync(string email);
    Task<CustomerDto?> GetByIdAsync(int customerId);

    // Methods for updating customer info, changing passwords and deactivating accounts:
    Task<string?> GetPasswordHashAsync(int customerId);
    Task UpdateContactAsync(int customerId, string email, string phone);
    Task ChangePasswordAsync(int customerId, string passwordHash);
    Task DeactivateAsync(int customerId);
}

public class CustomerRepository : ICustomerRepository
{
    private readonly InsuranceDbContext _db;
    public CustomerRepository(InsuranceDbContext db) => _db = db;

    // Using async/await pattern to create a new customer in the database by executing a stored procedure.
    // async/await allows for database operations to be non-blocking, improving the app's responsiveness
    public async Task<int> CreateAsync(RegisterRequestDto dto, string passwordHash)
    {
        var newId = new SqlParameter("@customerID", SqlDbType.Int) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC customer_Create @firstName, @lastName, @customerDOB, @customerEmail, @customerPhone, @passwordHash, @customerID OUTPUT",
            new SqlParameter("@firstName", dto.FirstName),
            new SqlParameter("@lastName", dto.LastName),
            new SqlParameter("@customerDOB", SqlDbType.Date) { Value = dto.DateOfBirth.ToDateTime(TimeOnly.MinValue) },
            new SqlParameter("@customerEmail", dto.Email),
            new SqlParameter("@customerPhone", dto.Phone),
            new SqlParameter("@passwordHash", passwordHash),
            newId);

        return (int)newId.Value;
    }
    // The GetLoginAsync method retrieves a customer's login information based on their email address.
    public async Task<CustomerLoginDto?> GetLoginAsync(string email)
    {
        var rows = await _db.Database
            .SqlQuery<CustomerLoginDto>($"EXEC get_CustomerLogin {email}")
            .ToListAsync();
        return rows.FirstOrDefault();
    }

    // The GetByIdAsync method retrieves a customer's details based on their unique customer ID.
    public async Task<CustomerDto?> GetByIdAsync(int customerId)
    {
        var rows = await _db.Database
            .SqlQuery<CustomerDto>($"EXEC get_CustomerByID {customerId}")
            .ToListAsync();
        return rows.FirstOrDefault();
    }

    // GetPasswordHashAsync retrieves the hashed password for a cusomter based on their account ID
    public async Task<string?> GetPasswordHashAsync(int customerId)
    {
        var rows = await _db.Database
            .SqlQuery<PasswordHashDto>($"EXEC customer_GetPasswordHash {customerId}")
            .ToListAsync();
        return rows.FirstOrDefault()?.PasswordHash;
    }
    // Each method below executes a stored SQL procedure to update customer contact info
    public Task UpdateContactAsync(int customerId, string email, string phone) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC customer_UpdateContactInfo {customerId}, {email}, {phone}");

    public Task ChangePasswordAsync(int customerId, string passwordHash) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC customer_ChangePassword {customerId}, {passwordHash}");

    public Task DeactivateAsync(int customerId) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"EXEC customer_deactivate {customerId}");
}