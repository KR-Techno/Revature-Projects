// Controller for saved quotes: get a quote (it is saved), list mine, remove one, or buy a policy from one.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using InsuranceApi.Data;
using InsuranceApi.Dtos;
using InsuranceApi.Extensions;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class QuotesController : ControllerBase
{
    // Encapsulates the quote stored procedures, so the controller doesn't need to know DB details
    private readonly IQuoteRepository _quotes;
    public QuotesController(IQuoteRepository quotes) => _quotes = quotes;

    [HttpPost]
    // POST /api/quotes
    // Works out the price, saves the quote (valid 30 days) and returns it
    public async Task<IActionResult> Create(CreateQuoteRequestDto request)
    {
        var quote = await _quotes.CreateAsync(User.GetCustomerId(), request);
        return quote is null ? NotFound() : Ok(quote);
    }

    [HttpGet]
    // GET /api/quotes
    // Returns the logged-in customer's own quotes
    public async Task<ActionResult<List<SavedQuoteDto>>> GetMine() =>
        Ok(await _quotes.GetByCustomerAsync(User.GetCustomerId()));

    [HttpPost("{quoteId:int}/dismiss")]
    // POST /api/quotes/{quoteId}/dismiss
    // Removes a quote from the customer's list
    public async Task<IActionResult> Dismiss(int quoteId)
    {
        await _quotes.DismissAsync(User.GetCustomerId(), quoteId);
        return Ok(new { message = "Quote removed." });
    }

    [HttpPost("{quoteId:int}/buy")]
    // POST /api/quotes/{quoteId}/buy
    // Buys the policy at the quoted price (the price can't be sent from the browser)
    public async Task<IActionResult> Buy(int quoteId, BuyQuoteRequestDto request)
    {
        var id = await _quotes.BuyAsync(User.GetCustomerId(), quoteId, request.PaymentPlan);
        return StatusCode(StatusCodes.Status201Created, new PolicyCreatedDto { PolicyID = id });
    }
}
