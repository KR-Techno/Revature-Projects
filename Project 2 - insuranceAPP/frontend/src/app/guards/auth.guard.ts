/* Route guards.
 authGuard: only lets someone through if they have a valid, unexpired token.
 customerGuard: customer pages; an admin who lands on one is sent to the admin area instead.
 adminGuard: admin pages; anyone without the Admin role is sent back to the customer dashboard.
 mustChangeGuard: the forced "choose a new password" page; only reachable while an admin reset is pending. */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // valid token: allow the page to open; otherwise redirect to the login page instead
  if (!auth.hasValidToken()) return router.createUrlTree(['/login']);
  // after an admin password reset, nothing else opens until the customer has chosen a new password
  return auth.mustChangePassword() ? router.createUrlTree(['/change-password']) : true;
};

// the forced password-change page: logged in AND a reset is pending, otherwise it isn't needed
export const mustChangeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.hasValidToken()) return router.createUrlTree(['/login']);
  return auth.mustChangePassword() ? true : router.createUrlTree(['/dashboard']);
};

// customer pages (dashboard, policies, ...): admins are redirected to their own area
export const customerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAdmin() ? router.createUrlTree(['/admin/customers']) : true;
};

// admin pages: only the Admin role gets in (the API enforces this too)
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};
