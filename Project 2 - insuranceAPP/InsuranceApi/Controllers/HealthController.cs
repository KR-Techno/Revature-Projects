// Tests if database has successfully connected
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly InsuranceDbContext _db;
    public HealthController(InsuranceDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get() =>
        await _db.Database.CanConnectAsync()
            ? Ok("API and database are connected.")
            : StatusCode(503, "Cannot reach the database.");
}