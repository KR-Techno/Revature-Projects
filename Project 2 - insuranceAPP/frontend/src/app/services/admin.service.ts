/* AdminService wraps the /api/admin endpoints (only an admin's token gets past the API's role check).
 The sensitive calls carry the admin's own password in the request body. */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AdminClaim, AdminCustomer, AdminPayment, AdminProductCustomer, AdminProductSummary, AdminQuote, CreateProductRequest, DecideClaimRequest, UpdateCustomerRequest } from '../models/admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin`;

  // GET /api/admin/customers: every customer, with active policy and open claim counts
  getCustomers() { return this.http.get<AdminCustomer[]>(`${this.base}/customers`); }
  // PUT /api/admin/customers/{customerId}: edits name and date of birth (admin password required)
  updateCustomer(customerId: number, request: UpdateCustomerRequest) {
    return this.http.put<unknown>(`${this.base}/customers/${customerId}`, request);
  }
  // POST /api/admin/customers/{customerId}/deactivate (admin password required)
  deactivate(customerId: number, password: string) {
    return this.http.post<{ message: string }>(`${this.base}/customers/${customerId}/deactivate`, { password });
  }
  // POST /api/admin/customers/{customerId}/reactivate (admin password required)
  reactivate(customerId: number, password: string) {
    return this.http.post<{ message: string }>(`${this.base}/customers/${customerId}/reactivate`, { password });
  }

  // POST /api/admin/customers/{customerId}/reset-password (admin password required)
  // creates a temporary password (returned once) and forces the customer to change it at next login
  resetPassword(customerId: number, password: string) {
    return this.http.post<{ temporaryPassword: string }>(`${this.base}/customers/${customerId}/reset-password`, { password });
  }

  // GET /api/admin/claims: every claim from every customer
  getClaims() { return this.http.get<AdminClaim[]>(`${this.base}/claims`); }
  // POST /api/admin/claims/{claimId}/decision: approves or denies a claim
  decideClaim(claimId: number, request: DecideClaimRequest) {
    return this.http.post<{ message: string }>(`${this.base}/claims/${claimId}/decision`, request);
  }

  // GET /api/admin/quotes: every quote customers have requested (read-only)
  getQuotes() { return this.http.get<AdminQuote[]>(`${this.base}/quotes`); }

  // GET /api/admin/policytypes: every product with its level names and how many customers hold it
  getProducts() { return this.http.get<AdminProductSummary[]>(`${this.base}/policytypes`); }
  // GET /api/admin/policytypes/{policyTypeId}/customers: the customers holding one product, with their policy details
  getProductCustomers(policyTypeId: number) {
    return this.http.get<AdminProductCustomer[]>(`${this.base}/policytypes/${policyTypeId}/customers`);
  }
  // GET /api/admin/payments: every payment record, overdue first (read-only)
  getPayments() { return this.http.get<AdminPayment[]>(`${this.base}/payments`); }

  // POST /api/admin/policytypes: creates a new product with its coverage levels (admin password required)
  createProduct(request: CreateProductRequest) {
    return this.http.post<{ policyTypeID: number }>(`${this.base}/policytypes`, request);
  }
}
