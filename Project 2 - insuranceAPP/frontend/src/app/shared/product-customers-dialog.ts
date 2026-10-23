/* Pop-up for the admin: the customers who currently hold one policy product, with their contact details
 and the details of their policy. Read-only. Opened from the "View customers" button on the Policy products page. */
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { AdminService } from '../services/admin.service';
import { AdminProductCustomer } from '../models/admin.models';
import { apiErrorMessage } from '../utils/api-error';

export interface ProductCustomersData { policyTypeID: number; typeName: string; }

@Component({
  selector: 'app-product-customers-dialog',
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.typeName }} customers</h2>
    <mat-dialog-content>
      <!-- an error, a loading message, a friendly empty message, or the table -->
      @if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (loading()) {
        <p>Loading customers...</p>
      } @else if (rows().length === 0) {
        <p>No customers currently hold this product.</p>
      } @else {
        <p class="count">{{ rows().length }} {{ rows().length === 1 ? 'customer holds' : 'customers hold' }} this product.</p>
        <!-- one card per customer, laid out as a grid: the name and overdue badge on top, then the details in
             labelled cells so every piece of information sits in its own clearly separated box -->
        <div class="customer-grid">
          @for (r of rows(); track r.policyID) {
            <article class="customer-card">
              <header class="card-head">
                <div>
                  <h3>{{ r.firstName }} {{ r.lastName }}</h3>
                  <div class="sub">Customer #{{ r.customerID }} · born {{ r.customerDOB | date:'MM/dd/yyyy' }}</div>
                </div>
                <!-- orange badge when the customer is behind on payments, blue when they're up to date -->
                @if (r.overduePayments > 0) {
                  <span class="status overdue">{{ r.overduePayments }} overdue</span>
                } @else {
                  <span class="status paid">Up to date</span>
                }
              </header>

              <!-- the details grid: small grey label above each value -->
              <dl class="facts">
                <!-- email and phone, so the admin can reach the customer without leaving the pop-up -->
                <div class="wide"><dt>Contact</dt><dd>{{ r.customerEmail }}<div class="sub">{{ r.customerPhone }}</div></dd></div>
                <div><dt>Policy</dt><dd>#{{ r.policyID }}<div class="sub">{{ r.levelName }}</div></dd></div>
                <div><dt>Period</dt><dd>{{ r.startDate | date:'MM/dd/yyyy' }}<div class="sub">to {{ r.endDate | date:'MM/dd/yyyy' }}</div></dd></div>
                <div><dt>Coverage</dt><dd>{{ r.coverageAmount | currency:'USD':'symbol':'1.0-0' }}</dd></div>
                <!-- monthly price, and whether the customer pays monthly or yearly -->
                <div><dt>Premium</dt><dd>{{ r.monthlyPremium | currency }}/month<div class="sub">pays {{ r.paymentPlan.toLowerCase() }}</div></dd></div>
              </dl>
            </article>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .count { margin: 0 0 16px; }
    /* customer cards side by side (two across in the wide pop-up), one per row on narrow screens */
    .customer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
    .customer-card { border: 1px solid var(--app-border); border-radius: 14px; background: var(--app-surface); overflow: hidden; }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
                 padding: 16px 18px; background: var(--app-bg); border-bottom: 1px solid var(--app-border); }
    .card-head h3 { margin: 0; font-size: 1.1rem; }
    /* the details as a 2-column grid of boxes; the 1px gap over a border-colored background draws the dividing lines */
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 0; background: var(--app-border); }
    .facts > div { background: var(--app-surface); padding: 12px 18px; min-width: 0; }
    .facts .wide { grid-column: 1 / -1; }
    .facts dt { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-muted); }
    .facts dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    /* small grey second line under a value (customer number, phone, level, end date, plan) */
    .sub { font-size: 0.82rem; font-weight: 400; color: var(--app-muted); }
    .error { color: var(--mat-sys-error); }
    @media (max-width: 480px) { .customer-grid { grid-template-columns: 1fr; } }
  `
})
export class ProductCustomersDialog {
  data = inject<ProductCustomersData>(MAT_DIALOG_DATA);
  private svc = inject(AdminService);

  // pop-up state as signals, so the template updates automatically when they change
  rows = signal<AdminProductCustomer[]>([]);
  loading = signal(true);
  error = signal('');

  // loads the product's customers as soon as the pop-up opens
  constructor() {
    this.svc.getProductCustomers(this.data.policyTypeID).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }
}
