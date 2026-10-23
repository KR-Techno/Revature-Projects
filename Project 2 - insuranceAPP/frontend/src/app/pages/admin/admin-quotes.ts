/* Admin quotes page: every quote customers have requested, with filter buttons, a search box and a sort dropdown (newest first by default). Read-only; useful for seeing who is
 shopping but not buying. Active quotes show by default. */
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
import { AdminQuote } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { SortOption, byNumber, byText, reversed, sortedBy } from '../../utils/sort';
import { statusClass } from '../../utils/status-class';

// the four filter buttons above the table ("Accepted" is labelled "Bought" for the admin)
type QuoteFilter = 'Active' | 'Expired' | 'Accepted' | 'all';

// the "Sort by" choices; dates are "yyyy-mm-dd" text, which sorts correctly as text
const SORTS: SortOption<AdminQuote>[] = [
  { label: 'Newest first', compare: reversed(byText(q => q.createdDate)) },
  { label: 'Oldest first', compare: byText(q => q.createdDate) },
  { label: 'Expiring soonest', compare: byText(q => q.expiryDate) },
  { label: 'Customer name (A to Z)', compare: byText(q => q.customerName) },
  { label: 'Customer name (Z to A)', compare: reversed(byText(q => q.customerName)) },
  { label: 'Monthly price (highest first)', compare: reversed(byNumber(q => q.monthlyPremium)) }
];

@Component({
  selector: 'app-admin-quotes',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1>Quotes</h1>
      <p class="page-sub">Every quote customers have requested, including who is shopping but hasn't bought yet.</p>
    </div>

    <!-- filter buttons, search and sort work together: they decide which rows show and in what order -->
    <div class="controls">
      <mat-button-toggle-group [value]="filter()" (change)="filter.set($event.value)" aria-label="Filter quotes">
        <mat-button-toggle value="Active">Active</mat-button-toggle>
        <mat-button-toggle value="Expired">Expired</mat-button-toggle>
        <mat-button-toggle value="Accepted">Bought</mat-button-toggle>
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
      <p class="muted">Loading quotes...</p>
    } @else if (visible().length === 0) {
      <p class="muted">No quotes match.</p>
    } @else {
      <p class="result-count">Showing {{ visible().length }} of {{ quotes().length }} quotes</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="visible()">
          <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
          <ng-container matColumnDef="quoteID">
            <th mat-header-cell *matHeaderCellDef>Quote #</th>
            <td mat-cell *matCellDef="let q">{{ q.quoteID }}</td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Customer</th>
            <td mat-cell *matCellDef="let q">
              <strong>{{ q.customerName }}</strong>
              <div class="sub">{{ q.customerEmail }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="policy">
            <th mat-header-cell *matHeaderCellDef>Policy</th>
            <td mat-cell *matCellDef="let q">{{ q.typeName }} · {{ q.levelName }}</td>
          </ng-container>
          <ng-container matColumnDef="coverage">
            <th mat-header-cell *matHeaderCellDef>Coverage</th>
            <td mat-cell *matCellDef="let q">{{ q.coverageAmount | currency }}</td>
          </ng-container>
          <ng-container matColumnDef="monthly">
            <th mat-header-cell *matHeaderCellDef>Monthly</th>
            <td mat-cell *matCellDef="let q">{{ q.monthlyPremium | currency }}</td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>Quoted</th>
            <td mat-cell *matCellDef="let q">{{ q.createdDate | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="expiry">
            <th mat-header-cell *matHeaderCellDef>Valid until</th>
            <td mat-cell *matCellDef="let q">{{ q.expiryDate | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <!-- colored status badge; a bought quote also shows which policy it became -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let q">
              <span [class]="statusClass(q.displayStatus)">{{ q.displayStatus }}</span>
              @if (q.policyID) {
                <div class="sub">policy #{{ q.policyID }}</div>
              }
            </td>
          </ng-container>

          <!-- the header row and one row per quote, using the column order from "columns" below -->
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    /* small grey second line under a cell (email, policy number) */
    .sub { font-size: 0.82rem; color: var(--app-muted); }
  `
})
export class AdminQuotes {
  private svc = inject(AdminService);
  private snack = inject(MatSnackBar);

  // page state as signals, so the template updates automatically when they change
  quotes = signal<AdminQuote[]>([]);
  loading = signal(true);
  filter = signal<QuoteFilter>('Active');   // starts on the quotes that could still turn into policies
  search = signal('');
  sorts = SORTS;
  sort = signal(0);               // index into SORTS; starts on newest first
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['quoteID', 'customer', 'policy', 'coverage', 'monthly', 'created', 'expiry', 'status'];

  // removed quotes are hidden from the filters except "All"
  visible = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    const rows = this.quotes().filter(x =>
      (f === 'all' || x.displayStatus === f) &&
      (!q || `${x.customerName} ${x.customerEmail} ${x.customerID} ${x.quoteID}`.toLowerCase().includes(q)));
    return sortedBy(rows, this.sorts[this.sort()]);
  });

  // load every quote once when the page opens (nothing on this page changes them)
  constructor() {
    this.svc.getQuotes().subscribe({
      next: q => { this.quotes.set(q); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 });
      }
    });
  }
}
