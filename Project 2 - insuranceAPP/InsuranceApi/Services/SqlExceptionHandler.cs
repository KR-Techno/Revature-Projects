// SqlExceptionHandler takes care of translating all SQL error numbers for entire API
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;

namespace InsuranceApi.Services;

public class SqlExceptionHandler : IExceptionHandler
{
    private readonly ILogger<SqlExceptionHandler> _logger;
    public SqlExceptionHandler(ILogger<SqlExceptionHandler> logger) => _logger = logger;

    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        var sql = exception as SqlException ?? exception.InnerException as SqlException;

        // THROW numbers (50000-50999): the message was written for the customer, so it is safe to send
        if (sql is not null && sql.Number is >= 50000 and <= 50999)
        {
            context.Response.StatusCode = StatusFor(sql.Number);
            await context.Response.WriteAsJsonAsync(new { message = sql.Message }, ct);
            return true;
        }

        /* anything else (connection down, bug, constraint violation): log the details,
        tell the client nothing */
        _logger.LogError(exception, "Unhandled exception on {Method} {Path}", context.Request.Method, context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { message = "Something went wrong. Please try again later." }, ct);
        return true;
    }

    // one place that decides which business rule becomes which HTTP status
    private static int StatusFor(int number) => number switch
    {
        50001 => StatusCodes.Status409Conflict,              // email already taken
        50002 => StatusCodes.Status404NotFound,              // customer not found
        50003 => StatusCodes.Status400BadRequest,            // under 18
        50010 or 50011 or 50012 => StatusCodes.Status409Conflict,   // can't deactivate: active policy / open claim / overdue payment
        50020 => StatusCodes.Status403Forbidden,             // account deactivated
        50021 => StatusCodes.Status400BadRequest,            // bad policy type or coverage
        50022 => StatusCodes.Status404NotFound,              // policy not found
        50023 or 50024 => StatusCodes.Status409Conflict,     // can't cancel: open claim / overdue payment
        50025 or 50028 or 50029 => StatusCodes.Status409Conflict,   // already have this type / open claim / overdue payment
        50026 => StatusCodes.Status404NotFound,                     // policy not found or can't be upgraded
        50027 => StatusCodes.Status400BadRequest,                   // new coverage must be higher
        50030 => StatusCodes.Status409Conflict,              // nothing to pay
        50040 => StatusCodes.Status404NotFound,              // policy not found (claims)
        50041 => StatusCodes.Status409Conflict,              // policy not active
        50042 or 50043 => StatusCodes.Status400BadRequest,   // bad incident date / amount above coverage
        50044 => StatusCodes.Status404NotFound,              // claim not found or can't be withdrawn
        _ => StatusCodes.Status400BadRequest                 // any other custom rule (including the admin-only ones)
    };
}