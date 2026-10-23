/* PaymentService wraps the /api/payments endpoints so pages don't build URLs themselves.
 Provided in root, so the same instance is shared through Dependency Injection; the JWT is added by authInterceptor. */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Payment, PaymentReceipt } from '../models/payment.models';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/payments`;

  // GET /api/payments: all of the logged-in customer's payments
  getMine() { return this.http.get<Payment[]>(this.base); }
  // POST /api/payments/pay/{policyId}: pays the oldest unpaid payment on that policy
  pay(policyId: number) { return this.http.post<PaymentReceipt>(`${this.base}/pay/${policyId}`, {}); }
}
