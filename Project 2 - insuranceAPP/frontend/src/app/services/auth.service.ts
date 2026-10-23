// AuthService handles logging the customer in and out, storing their JWT token in localStorage,
// and letting the rest of the app check whether they are still logged in.
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';

// localStorage key the JWT token is saved under, so the customer stays logged in after a page refresh
const TOKEN_KEY = 'duckling_token';

interface LoginResponse {
  token: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string;      // "yyyy-mm-dd"
  email: string;
  phone: string;
  password: string;
}

export interface RegisterResponse {
  customerID: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  // the current token as a signal, so anything using isLoggedIn (e.g. the navbar) updates automatically on login/logout
  private _token = signal<string | null>(this.loadToken());
  readonly isLoggedIn = computed(() => this._token() !== null);

  // "Customer" or "Admin", read from the token's "role" claim (null when logged out).
  // This only decides what the UI shows; the API checks the role again on every admin request.
  readonly role = computed(() => {
    const t = this._token();
    return t ? (this.payload(t)?.['role'] as string | undefined) ?? 'Customer' : null;
  });
  readonly isAdmin = computed(() => this.role() === 'Admin');

  // true after an admin reset this customer's password: the token's "mcp" claim says a new password must be chosen first
  readonly mustChangePassword = computed(() => {
    const t = this._token();
    return !!t && this.payload(t)?.['mcp'] === '1';
  });

  get token(): string | null {
    return this._token();
  }

  register(request: RegisterRequest) {
    return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register`, request);
  }

  // sends the credentials to POST /api/auth/login and saves the returned token on success
  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(res => this.save(res.token)));
  }

  logout() {
    this.clear();
    this.router.navigateByUrl('/login');
  }

  // used by the route guard: re-checks expiry every time, not just at startup
  hasValidToken(): boolean {
    const t = this._token();
    if (t && this.isExpired(t)) {
      this.clear();
      return false;
    }
    return t !== null;
  }

  private save(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    this._token.set(token);
  }

  private clear() {
    localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
  }

  private loadToken(): string | null {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && !this.isExpired(t) ? t : null;
  }

  // decodes the middle part of the JWT (the claims); this is NOT verification, the API verifies the signature
  private payload(token: string): Record<string, unknown> | null {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  }

  // reads the "exp" claim only so the UI can react early; the API still validates the signature itself
  // (an unreadable token has no exp, so it counts as expired)
  private isExpired(token: string): boolean {
    const exp = this.payload(token)?.['exp'] as number | undefined;
    return !exp || exp * 1000 <= Date.now();
  }
}