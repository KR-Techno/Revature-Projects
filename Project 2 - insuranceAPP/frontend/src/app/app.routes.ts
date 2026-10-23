// Routes for Angular app
import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { Dashboard } from './pages/dashboard/dashboard';
import { Policies } from './pages/policies/policies';
import { Payments } from './pages/payments/payments';
import { Claims } from './pages/claims/claims';
import { Profile } from './pages/profile/profile';
import { Shell } from './layout/shell/shell';
import { AdminCustomers } from './pages/admin/admin-customers';
import { AdminClaims } from './pages/admin/admin-claims';
import { AdminPayments } from './pages/admin/admin-payments';
import { AdminProducts } from './pages/admin/admin-products';
import { AdminQuotes } from './pages/admin/admin-quotes';
import { ChangePasswordRequired } from './pages/change-password-required/change-password-required';
import { adminGuard, authGuard, customerGuard, mustChangeGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  // shown after an admin reset the password: the customer must choose a new one before using the app
  // (outside the Shell on purpose, so there is no menu to escape through)
  { path: 'change-password', component: ChangePasswordRequired, canActivate: [mustChangeGuard] },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      // customer pages: an admin who opens one is redirected to /admin/customers
      {
        path: '',
        canActivate: [customerGuard],
        children: [
          { path: 'dashboard', component: Dashboard },
          { path: 'policies', component: Policies },
          { path: 'payments', component: Payments },
          { path: 'claims', component: Claims },
          { path: 'profile', component: Profile }
        ]
      },
      // admin pages: only the Admin role gets in
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: 'customers', component: AdminCustomers },
          { path: 'claims', component: AdminClaims },
          { path: 'payments', component: AdminPayments },
          { path: 'quotes', component: AdminQuotes },
          { path: 'products', component: AdminProducts },
          { path: '', pathMatch: 'full', redirectTo: 'customers' }
        ]
      }
    ]
  },
  // anything unknown goes to the dashboard (customerGuard then sends admins on to /admin/customers)
  { path: '**', redirectTo: 'dashboard' }
];
