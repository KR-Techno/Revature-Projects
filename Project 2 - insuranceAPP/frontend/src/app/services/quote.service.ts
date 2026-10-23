/* QuoteService wraps the /api/quotes endpoints: get (and save) a quote, list my quotes, remove one, or buy a policy from one.
 Provided in root, so the same instance is shared through Dependency Injection; the JWT is added by authInterceptor. */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { CreateQuoteRequest, PaymentPlan, PolicyCreated, SavedQuote } from '../models/policy.models';

@Injectable({ providedIn: 'root' })
export class QuoteService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/quotes`;

  // POST /api/quotes: the server works out the price and saves the quote for 30 days
  create(request: CreateQuoteRequest) { return this.http.post<SavedQuote>(this.base, request); }
  // GET /api/quotes: the logged-in customer's saved quotes
  getMine() { return this.http.get<SavedQuote[]>(this.base); }
  // POST /api/quotes/{quoteId}/dismiss: hides a quote from the customer's list
  dismiss(quoteId: number) { return this.http.post<{ message: string }>(`${this.base}/${quoteId}/dismiss`, {}); }
  // POST /api/quotes/{quoteId}/buy: buys the policy at the quoted price; the price is never sent from the browser
  buy(quoteId: number, paymentPlan: PaymentPlan) {
    return this.http.post<PolicyCreated>(`${this.base}/${quoteId}/buy`, { paymentPlan });
  }
}
