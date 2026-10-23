using System.Text;
using InsuranceApi.Data;
using InsuranceApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Threading.RateLimiting;


var builder = WebApplication.CreateBuilder(args);

// Retrieve JWT key from user secrets (Configuration).
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing. Set it with: dotnet user-secrets set \"Jwt:Key\" \"...\"");

#region All Builder Servies using DI
// Add services to the container
// ------------------------------
builder.Services.AddControllers();
// Dependency injection for DbContext file with SQL Server connection string, connecting to insuranceAppDB.
builder.Services.AddDbContext<InsuranceDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("InsuranceDb")));

// Register repositories for dependency injection,
// allowing controllers to access DB through repository methods.
// Uses Scoped lifetime, one instance created per request.
builder.Services.AddScoped<IPolicyRepository, PolicyRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();
builder.Services.AddScoped<IClaimRepository, ClaimRepository>();
builder.Services.AddScoped<IAdminRepository, AdminRepository>();
builder.Services.AddScoped<IQuoteRepository, QuoteRepository>();
// Global error handling:
// SqlExceptionHandler translates SQL Server errors into HTTP responses, for every controller
builder.Services.AddExceptionHandler<SqlExceptionHandler>();
builder.Services.AddProblemDetails();

// JWT authentication: every request with an "Authorization: Bearer <token>" header has its token checked.
// The token must be signed with Jwt:Key, comes from issuer/audience, and not be expired
// (with 1 minute of clock skew allowed), otherwise [Authorize] endpoints return 401 Unauthorized.
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;   // keep claim names as written in the token ("sub")
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(1),
            RoleClaimType = "role"   // tells [Authorize(Roles = ...)] which claim holds the role
        };
    });

// CORS: lets the Angular frontend (running on a different origin/port) call this API from the browser.
// Allowed origins come from the "Cors:AllowedOrigins" list in appsettings.json;
// any header and HTTP method is permitted.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
    {
        options.AddPolicy("Angular", policy =>
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()      // Authorization, Content-Type
                .AllowAnyMethod());    // GET, POST, PUT...
    });

// Rate limiting: slows down brute-force password guessing,
// by capping how often one IP can hit the "auth" endpoints.
// Requests over the limit are rejected right away with 429 Too Many Requests and a friendly message.
builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        // "auth" policy: 5 requests per minute per IP address
        options.AddPolicy("auth", httpContext =>
            RateLimitPartition.GetFixedWindowLimiter(
                httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

        options.OnRejected = async (context, ct) =>
            await context.HttpContext.Response.WriteAsJsonAsync(
                new { message = "Too many attempts. Please wait a minute and try again." }, ct);
    });
#endregion

builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Paste the token from /api/auth/login (without the word Bearer).",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

var app = builder.Build();

app.UseExceptionHandler();   // runs SqlExceptionHandler when a controller throws

// Configure the HTTP request pipeline.
// Using Swagger for testing purposes
if (app.Environment.IsDevelopment())
{
    // Enable Swagger in development environment
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Angular");     // before authenticating
app.UseRateLimiter();       // slows brute-force password guessing
app.UseAuthentication();   // who are you?   (must come before...)
app.UseAuthorization();    // are you allowed?

// After an admin password reset the token carries "mcp": until the customer picks a new password,
// the only things it may do are load the profile and change the password.
app.Use(async (context, next) =>
{
    if (context.User.HasClaim("mcp", "1"))
    {
        var path = context.Request.Path;
        var allowed =
            path.StartsWithSegments("/api/auth") ||   // login/register must always work, even if the browser still holds an old flagged token
            (HttpMethods.IsGet(context.Request.Method) && path.Equals("/api/customers/me", StringComparison.OrdinalIgnoreCase)) ||
            (HttpMethods.IsPut(context.Request.Method) && path.Equals("/api/customers/me/password", StringComparison.OrdinalIgnoreCase));

        if (!allowed)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { message = "You must change your temporary password first." });
            return;
        }
    }
    await next();
});
app.MapControllers();
app.Run();