/* Dashboard page: the customer's home screen after logging in.
 Loads their profile, policies, payments and claims at once, then works out the summary cards in the browser. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { CustomerService } from '../../services/customer.service';
import { PolicyService } from '../../services/policy.service';
import { PaymentService } from '../../services/payment.service';
import { ClaimService } from '../../services/claim.service';
import { Customer } from '../../models/customer.models';
import { Policy } from '../../models/policy.models';
import { Payment } from '../../models/payment.models';
import { Claim } from '../../models/claim.models';
import { apiErrorMessage } from '../../utils/api-error';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe, MatButtonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  // page state as signals, so the template updates automatically when they change
  me = signal<Customer | null>(null);
  policies = signal<Policy[]>([]);
  payments = signal<Payment[]>([]);
  claims = signal<Claim[]>([]);
  loaded = signal(false);         // the tiles stay hidden until all four requests are back
  error = signal('');

  // current policies (Active or Pending) and what they cost together each month
  activePolicies = computed(() =>
    this.policies().filter(p => p.displayStatus === 'Active' || p.displayStatus === 'Pending'));
  monthlyTotal = computed(() => this.activePolicies().reduce((sum, p) => sum + p.monthlyPremium, 0));

  // overdue payments and their combined total, used by the alert banner
  overdue = computed(() => this.payments().filter(p => p.displayStatus === 'Overdue'));
  overdueTotal = computed(() => this.overdue().reduce((sum, p) => sum + p.totalAmount, 0));

  // the unpaid payment with the earliest due date (it can be overdue)
  nextPayment = computed(() => {
    const unpaid = this.payments().filter(p => p.paymentStatus === 'Pending');
    return unpaid.length ? unpaid.reduce((a, b) => (a.dueDate <= b.dueDate ? a : b)) : null;
  });

  // claims still waiting for a decision
  openClaims = computed(() =>
    this.claims().filter(c => c.claimStatus === 'Submitted' || c.claimStatus === 'Under Review'));

  constructor() {
    const customers = inject(CustomerService);
    const policies = inject(PolicyService);
    const payments = inject(PaymentService);
    const claims = inject(ClaimService);

    // four requests in parallel, one result when all of them are back
    forkJoin({
      me: customers.getMe(),
      policies: policies.getMine(),
      payments: payments.getMine(),
      claims: claims.getMine()
    }).subscribe({
      next: r => {
        this.me.set(r.me);
        this.policies.set(r.policies);
        this.payments.set(r.payments);
        this.claims.set(r.claims);
        this.loaded.set(true);
      },
      error: (err: HttpErrorResponse) => this.error.set(apiErrorMessage(err))
    });
  }
}
