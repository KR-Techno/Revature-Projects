// Angular Typescript's version of the repository layer from the API
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Policy, PolicyRequest, PolicyType, Quote, CoverageChanged } from '../models/policy.models';

@Injectable({ providedIn: 'root' })
export class PolicyService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // products with their coverage levels (replaces the old /policytypes call)
  getTypes()  { return this.http.get<PolicyType[]>(`${this.base}/policies/catalog`); }
  // GET /api/policies: all of the logged-in customer's policies
  getMine()   { return this.http.get<Policy[]>(`${this.base}/policies`); }
  // POST /api/policies/quote: prices a product + level + amount without buying anything
  getQuote(request: PolicyRequest) { return this.http.post<Quote>(`${this.base}/policies/quote`, request); }
  // PUT /api/policies/{policyId}/coverage: changes the level and/or amount (upgrade or downgrade)
  changeCoverage(policyId: number, newCoverageLevelID: number, newCoverageAmount: number) {
    return this.http.put<CoverageChanged>(`${this.base}/policies/${policyId}/coverage`, { newCoverageLevelID, newCoverageAmount });
  }
  // POST /api/policies/{policyId}/cancel: cancels the policy and its remaining unpaid payments
  cancel(policyId: number)         { return this.http.post(`${this.base}/policies/${policyId}/cancel`, {}); }
}
