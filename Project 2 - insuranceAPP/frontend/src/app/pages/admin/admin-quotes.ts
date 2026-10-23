/* Admin quotes page: every quote customers have requested, newest first. Read-only; useful for seeing who is
 shopping but not buying. Active quotes show by default. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminQuote } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';

// the four filter buttons above the table ("Accepted" is labelled "Bought" for the admin)
type QuoteFilter = 'Active' | 'Expired' | 'Accepted' | 'all';

@Component({
  selector: 'app-admin-quotes',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>Quotes</h1>

    <!-- filter buttons and a search box work together: both decide which rows show -->
    <div class="controls">
      <mat-button-toggle-group [value]="filter()" (change)="filter.set($event.value)" aria-label="Filter quotes">
        <mat-button-toggle value="Active">Active</mat-button-toggle>
        <mat-button-toggle value="Expired">Expired</mat-button-toggle>
        <mat-button-toggle value="Accepted">Bought</mat-button-toggle>
        <mat-button-toggle value="all">All</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="search">
        <mat-label>Search customer</mat-label>
        <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
      </mat-form-field>
    </div>

    @if (loading()) {
      <p>Loading quotes...</p>
    } @else if (visible().length === 0) {
      <p>No quotes match.</p>
    } @else {
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
              <div>{{ q.customerName }}</div>
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
    /* filter buttons and search side by side, wrapping on narrow screens */
    .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-bottom: 8px; }
    .search { width: 100%; max-width: 320px; }
    /* lets the wide table scroll sideways on small screens */
    .table-wrap { overflow-x: auto; }
    /* small grey second line under a cell (email, policy number) */
    .sub { font-size: 0.8rem; opacity: 0.7; }
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
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['quoteID', 'customer', 'policy', 'coverage', 'monthly', 'created', 'expiry', 'status'];

  // removed quotes are hidden from the filters except "All"
  visible = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    return this.quotes().filter(x =>
      (f === 'all' || x.displayStatus === f) &&
      (!q || `${x.customerName} ${x.customerEmail} ${x.customerID} ${x.quoteID}`.toLowerCase().includes(q)));
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
