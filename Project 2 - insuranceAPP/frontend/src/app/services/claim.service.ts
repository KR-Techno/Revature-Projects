/* ClaimService wraps the /api/claims endpoints so pages don't build URLs themselves.
 Provided in root, so the same instance is shared through Dependency Injection; the JWT is added by authInterceptor. */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Claim, ClaimCreated, ClaimRequest } from '../models/claim.models';

@Injectable({ providedIn: 'root' })
export class ClaimService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/claims`;

  // GET /api/claims: all of the logged-in customer's claims
  getMine() { return this.http.get<Claim[]>(this.base); }
  // POST /api/claims: files a new claim and returns its claim ID
  submit(request: ClaimRequest) { return this.http.post<ClaimCreated>(this.base, request); }
  // POST /api/claims/{claimId}/withdraw: withdraws a claim that is still waiting for a decision
  withdraw(claimId: number) { return this.http.post(`${this.base}/${claimId}/withdraw`, {}); }
}
