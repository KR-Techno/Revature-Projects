/* Admin payments page: every payment record in the system, with filter buttons, a search box and a sort dropdown.
 Shows the customer's contact details so the admin can reach out, and the late fee on top of what is owed.
 Read-only: admins don't take payments for customers. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminPayment } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { SortOption, byNumber, byText, reversed, sortedBy } from '../../utils/sort';
import { statusClass } from '../../utils/status-class';

// the four filter buttons above the table
type PaymentFilter = 'overdue' | 'upcoming' | 'paid' | 'all';

// the "Sort by" choices; due dates are "yyyy-mm-dd" text, which sorts correctly as text
const SORTS: SortOption<AdminPayment>[] = [
  { label: 'Most days late', compare: reversed(byNumber(p => p.daysOverdue)) },
  { label: 'Due date (soonest first)', compare: byText(p => p.dueDate) },
  { label: 'Due date (latest first)', compare: reversed(byText(p => p.dueDate)) },
  { label: 'Customer name (A to Z)', compare: byText(p => p.customerName) },
  { label: 'Customer name (Z to A)', compare: reversed(byText(p => p.customerName)) },
  { label: 'Total (highest first)', compare: reversed(byNumber(p => p.totalAmount)) }
];

@Component({
  selector: 'app-admin-payments',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1>Payments</h1>
      <p class="page-sub">Every payment in the system. Contact details are shown so you can follow up on late ones.</p>
    </div>

    <!-- headline numbers for the overdue payments -->
    <p class="summary">
      @if (overdue().length > 0) {
        <strong class="overdue">{{ overdue().length }} overdue payment{{ overdue().length === 1 ? '' : 's' }}</strong>
        from {{ overdueCustomers() }} customer{{ overdueCustomers() === 1 ? '' : 's' }},
        {{ overdueTotal() | currency }} owed including late fees.
      } @else {
        No payments are overdue.
      }
    </p>

    <!-- filter buttons, search and sort work together: they decide which rows show and in what order -->
    <div class="controls">
      <mat-button-toggle-group [value]="filter()" (change)="filter.set($event.value)" aria-label="Filter payments">
        <mat-button-toggle value="overdue">Overdue</mat-button-toggle>
        <mat-button-toggle value="upcoming">Upcoming</mat-button-toggle>
        <mat-button-toggle value="paid">Paid</mat-button-toggle>
        <mat-button-toggle value="all">All</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="search">
        <mat-label>Search customer</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="sort">
        <mat-label>Sort by</mat-label>
        <mat-select [value]="sort()" (selectionChange)="sort.set($event.value)">
          @for (s of sorts; track s.label; let i = $index) {
            <mat-option [value]="i">{{ s.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (loading()) {
      <p class="muted">Loading payments...</p>
    } @else if (visible().length === 0) {
      <p class="muted">No payments match.</p>
    } @else {
      <p class="result-count">Showing {{ visible().length }} of {{ payments().length }} payments</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="visible()">
          <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
          <!-- the customer's email and phone sit under their name, so the admin can follow up without leaving the page -->
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Customer</th>
            <td mat-cell *matCellDef="let p">
              <strong>{{ p.customerName }}</strong>
              <div class="contact">{{ p.customerEmail }} · {{ p.customerPhone }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="policy">
            <th mat-header-cell *matHeaderCellDef>Policy</th>
            <td mat-cell *matCellDef="let p">{{ p.typeName }} · {{ p.levelName }}<div class="contact">#{{ p.policyID }}</div></td>
          </ng-container>
          <ng-container matColumnDef="dueDate">
            <th mat-header-cell *matHeaderCellDef>Due</th>
            <td mat-cell *matCellDef="let p">{{ p.dueDate | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Amount</th>
            <td mat-cell *matCellDef="let p">{{ p.amount | currency }}</td>
          </ng-container>
          <!-- a dash instead of $0.00 when there is no late fee, so the real fees stand out -->
          <ng-container matColumnDef="lateFee">
            <th mat-header-cell *matHeaderCellDef>Late fee</th>
            <td mat-cell *matCellDef="let p">{{ p.lateFee > 0 ? (p.lateFee | currency) : '-' }}</td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef>Total</th>
            <td mat-cell *matCellDef="let p"><strong>{{ p.totalAmount | currency }}</strong></td>
          </ng-container>
          <!-- colored status badge (styles come from the global styles.scss), plus how late it is -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let p">
              <span [class]="statusClass(p.displayStatus)">{{ p.displayStatus }}</span>
              @if (p.daysOverdue > 0) {
                <div class="contact">{{ p.daysOverdue }} day{{ p.daysOverdue === 1 ? '' : 's' }} late</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="paidDate">
            <th mat-header-cell *matHeaderCellDef>Paid</th>
            <td mat-cell *matCellDef="let p">{{ p.paidDate ? (p.paidDate | date:'MM/dd/yyyy') : '-' }}</td>
          </ng-container>

          <!-- the header row and one row per payment, using the column order from "columns" below -->
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    /* the overdue headline sits in a white box above the filters */
    .summary { margin: 0 0 24px; padding: 14px 18px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; }
    .overdue { color: var(--mat-sys-error); }
    /* small grey second line under a cell (contact details, policy number, days late) */
    .contact { font-size: 0.82rem; color: var(--app-muted); }
  `
})
export class AdminPayments {
  private svc = inject(AdminService);
  private snack = inject(MatSnackBar);

  // page state as signals, so the template updates automatically when they change
  payments = signal<AdminPayment[]>([]);
  loading = signal(true);
  filter = signal<PaymentFilter>('overdue');   // starts on the overdue payments, the ones that matter most
  search = signal('');
  sorts = SORTS;
  sort = signal(0);               // index into SORTS; starts on the most days late
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['customer', 'policy', 'dueDate', 'amount', 'lateFee', 'total', 'status', 'paidDate'];

  // overdue figures for the headline (always across all payments, whatever the filter says)
  overdue = computed(() => this.payments().filter(p => p.displayStatus === 'Overdue'));
  overdueTotal = computed(() => this.overdue().reduce((sum, p) => sum + p.totalAmount, 0));
  overdueCustomers = computed(() => new Set(this.overdue().map(p => p.customerID)).size);   // a Set counts each customer once

  // the filter buttons plus the search box decide which rows show; the sort dropdown decides the order
  visible = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    const rows = this.payments().filter(p => {
      const matchesFilter =
        f === 'all' ||
        (f === 'overdue' && p.displayStatus === 'Overdue') ||
        (f === 'upcoming' && p.displayStatus === 'Pending') ||
        (f === 'paid' && p.displayStatus === 'Paid');
      const matchesSearch = !q ||
        `${p.customerName} ${p.customerEmail} ${p.customerID} ${p.policyID}`.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
    return sortedBy(rows, this.sorts[this.sort()]);
  });

  // load every payment once when the page opens (there is nothing on this page that changes them)
  constructor() {
    this.svc.getPayments().subscribe({
      next: p => { this.payments.set(p); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 });
      }
    });
  }
}
