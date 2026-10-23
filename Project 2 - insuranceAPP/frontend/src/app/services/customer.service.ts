/* CustomerService wraps the /api/customers/me endpoints so pages don't build URLs themselves.
 Provided in root, so the same instance is shared through Dependency Injection; the JWT is added by authInterceptor. */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Customer, UpdateContactRequest } from '../models/customer.models';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/customers/me`;

  // GET /api/customers/me: the logged-in customer's profile
  getMe() { return this.http.get<Customer>(this.base); }
  // PUT /api/customers/me/contact: updates email and phone, returns the updated profile
  updateContact(request: UpdateContactRequest) { return this.http.put<Customer>(`${this.base}/contact`, request); }
  // PUT /api/customers/me/password: changes the password after checking the current one
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<{ message: string }>(`${this.base}/password`, { currentPassword, newPassword });
  }
  // POST /api/customers/me/deactivate: deactivates the account if the database allows it
  deactivate(currentPassword: string) {
    return this.http.post<{ message: string }>(`${this.base}/deactivate`, { currentPassword });
  }
}
