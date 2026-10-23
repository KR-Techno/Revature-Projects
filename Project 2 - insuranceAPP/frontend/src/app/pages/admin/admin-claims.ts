/* Admin claims page: every claim, with status filter buttons, a search box and a sort dropdown (open claims show first by default).
 Clicking a row opens a pop-up with the whole claim, where the admin accepts or rejects it; no password is needed for this. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminClaim, ClaimDecision } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { SortOption, byNumber, byText, reversed, sortedBy } from '../../utils/sort';
import { statusClass } from '../../utils/status-class';
import { ClaimDecisionDialog, ClaimDecisionData } from './claim-decision-dialog';

// the filter buttons above the table ("decided" = approved, denied or withdrawn)
type ClaimFilter = 'open' | 'Approved' | 'Denied' | 'all';

// the "Sort by" choices; "submitted" dates are "yyyy-mm-dd" text, which sorts correctly as text
const SORTS: SortOption<AdminClaim>[] = [
  { label: 'Oldest submitted first', compare: byText(c => c.submittedDate) },
  { label: 'Newest submitted first', compare: reversed(byText(c => c.submittedDate)) },
  { label: 'Incident date (newest first)', compare: reversed(byText(c => c.incidentDate)) },
  { label: 'Customer name (A to Z)', compare: byText(c => c.customerName) },
  { label: 'Customer name (Z to A)', compare: reversed(byText(c => c.customerName)) },
  { label: 'Amount (highest first)', compare: reversed(byNumber(c => c.claimAmount)) },
  { label: 'Amount (lowest first)', compare: byNumber(c => c.claimAmount) }
];

@Component({
  selector: 'app-admin-claims',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1>Claims</h1>
      <p class="page-sub">Click a claim to read it in full and accept or reject it.</p>
    </div>

    <!-- status filter, search and sort work together: all three decide which rows show and in what order -->
    <div class="controls">
      <mat-button-toggle-group [value]="filter()" (change)="filter.set($event.value)" aria-label="Filter claims">
        <mat-button-toggle value="open">Open ({{ openCount() }})</mat-button-toggle>
        <mat-button-toggle value="Approved">Approved</mat-button-toggle>
        <mat-button-toggle value="Denied">Rejected</mat-button-toggle>
        <mat-button-toggle value="all">All</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="search">
        <mat-label>Search customer or claim #</mat-label>
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
      <p class="muted">Loading claims...</p>
    } @else if (visible().length === 0) {
      <p class="muted">{{ claims().length === 0 ? 'No claims have been filed yet.' : 'No claims match your filters.' }}</p>
    } @else {
      <p class="result-count">Showing {{ visible().length }} of {{ claims().length }} claims</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="visible()">
          <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
          <ng-container matColumnDef="claimID">
            <th mat-header-cell *matHeaderCellDef>Claim #</th>
            <td mat-cell *matCellDef="let c">{{ c.claimID }}</td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Customer</th>
            <td mat-cell *matCellDef="let c"><strong>{{ c.customerName }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="policy">
            <th mat-header-cell *matHeaderCellDef>Policy</th>
            <td mat-cell *matCellDef="let c">{{ c.typeName }}<div class="cell-sub">{{ c.levelName }} · #{{ c.policyID }}</div></td>
          </ng-container>
          <ng-container matColumnDef="dates">
            <th mat-header-cell *matHeaderCellDef>Submitted</th>
            <td mat-cell *matCellDef="let c">
              {{ c.submittedDate | date:'MM/dd/yyyy' }}
              <div class="cell-sub">Incident {{ c.incidentDate | date:'MM/dd/yyyy' }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Claimed</th>
            <td mat-cell *matCellDef="let c">
              <strong>{{ c.claimAmount | currency }}</strong>
              @if (c.claimStatus === 'Approved') {
                <div class="cell-sub">{{ c.approvedAmount | currency }} approved</div>
              }
            </td>
          </ng-container>
          <!-- colored status badge (styles come from the global styles) -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let c"><span [class]="statusClass(c.claimStatus)">{{ c.claimStatus }}</span></td>
          </ng-container>
          <!-- "Review" on open claims, an arrow on decided ones; either way the row opens the pop-up -->
          <ng-container matColumnDef="open">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c" class="open-cell">
              @if (isOpen(c)) { <span class="review">Review</span> }
              <mat-icon class="row-chevron">chevron_right</mat-icon>
            </td>
          </ng-container>

          <!-- the header row and one clickable row per claim (Enter works too, for keyboard users) -->
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns" class="clickable-row" tabindex="0"
              (click)="open(row)" (keydown.enter)="open(row)"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .open-cell { white-space: nowrap; text-align: right; }
    .review { font-weight: 700; color: var(--mat-sys-primary); vertical-align: middle; }
  `
})
export class AdminClaims {
  private svc = inject(AdminService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  // page state as signals, so the template updates automatically when they change
  claims = signal<AdminClaim[]>([]);
  loading = signal(true);
  filter = signal<ClaimFilter>('open');   // starts on the claims waiting for a decision
  search = signal('');
  sorts = SORTS;
  sort = signal(0);               // index into SORTS; starts on oldest first, so the longest-waiting claims are on top
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['claimID', 'customer', 'policy', 'dates', 'amount', 'status', 'open'];

  // open = still waiting for a decision
  isOpen(c: AdminClaim) { return c.claimStatus === 'Submitted' || c.claimStatus === 'Under Review'; }
  openCount = computed(() => this.claims().filter(c => this.isOpen(c)).length);

  // the filter buttons plus the search box decide which rows show; the sort dropdown decides the order
  visible = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    const rows = this.claims().filter(c =>
      (f === 'all' || (f === 'open' ? this.isOpen(c) : c.claimStatus === f)) &&
      (!q || `${c.customerName} ${c.claimID} ${c.policyID} ${c.customerID}`.toLowerCase().includes(q)));
    return sortedBy(rows, this.sorts[this.sort()]);
  });

  constructor() { this.load(); }

  private load() {
    this.svc.getClaims().subscribe({
      next: c => { this.claims.set(c); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 });
      }
    });
  }

  // opens the claim pop-up; if a decision was saved there, confirms it and refreshes the list
  open(claim: AdminClaim) {
    this.dialog.open(ClaimDecisionDialog, { data: { claim } as ClaimDecisionData, width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((decision: ClaimDecision | false | undefined) => {
        if (decision) {
          this.snack.open(`Claim ${claim.claimID} ${decision === 'Approved' ? 'accepted' : 'rejected'}.`, 'OK', { duration: 6000 });
          this.load();
        }
      });
  }
}
