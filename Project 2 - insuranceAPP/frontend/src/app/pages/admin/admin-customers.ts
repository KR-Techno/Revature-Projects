/* Admin customer dashboard: every customer and their info (never the password), with a search box, a status filter
 and a sort dropdown. Clicking a row opens a pop-up with the customer's details, the edit form and the account actions.
 Viewing needs no password; editing, deactivating, reactivating and resetting a password each ask the admin for their own password first. */
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminCustomer } from '../../models/admin.models';
import { PasswordPromptData, PasswordPromptDialog } from '../../shared/password-prompt-dialog';
import { apiErrorMessage } from '../../utils/api-error';
import { SortOption, byNumber, byText, reversed, sortedBy } from '../../utils/sort';
import { statusClass } from '../../utils/status-class';
import { AdminEditCustomerDialog, CustomerDialogResult, EditCustomerValue } from './admin-edit-customer-dialog';
import { TempPasswordDialog } from '../../shared/temp-password-dialog';

// the four filter buttons above the table
type CustomerFilter = 'all' | 'active' | 'deactivated' | 'overdue';

// sorts by last name; the first name only breaks ties between customers who share a last name
const lastName = (c: AdminCustomer) => `${c.lastName} ${c.firstName}`;

// the "Sort by" choices; the two name sorts both use the last name, for simplicity
// (customer # goes up as people sign up, so it doubles as "date joined")
const SORTS: SortOption<AdminCustomer>[] = [
  { label: 'Last name (A to Z)', compare: byText(lastName) },
  { label: 'Last name (Z to A)', compare: reversed(byText(lastName)) },
  { label: 'Newest customers first', compare: reversed(byNumber(c => c.customerID)) },
  { label: 'Oldest customers first', compare: byNumber(c => c.customerID) },
  { label: 'Date of birth (oldest first)', compare: byText(c => c.customerDOB) },
  { label: 'Date of birth (youngest first)', compare: reversed(byText(c => c.customerDOB)) },
  { label: 'Most overdue payments', compare: reversed(byNumber(c => c.overduePayments)) }
];

@Component({
  selector: 'app-admin-customers',
  imports: [DatePipe, MatTableModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1>Customers</h1>
      <p class="page-sub">Click a customer to see their details, edit them, or manage their account.</p>
    </div>

    <!-- status filter, search and sort work together: all three decide which rows show and in what order -->
    <div class="controls">
      <mat-button-toggle-group [value]="filter()" (change)="filter.set($event.value)" aria-label="Filter customers">
        <mat-button-toggle value="all">All</mat-button-toggle>
        <mat-button-toggle value="active">Active</mat-button-toggle>
        <mat-button-toggle value="deactivated">Deactivated</mat-button-toggle>
        <mat-button-toggle value="overdue">Behind on payments</mat-button-toggle>
      </mat-button-toggle-group>

      <!-- search by name, email, phone or customer number -->
      <mat-form-field appearance="outline" class="search">
        <mat-label>Search customers</mat-label>
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

    <!-- loading message, then either a friendly empty message or the table -->
    @if (loading()) {
      <p class="muted">Loading customers...</p>
    } @else if (filtered().length === 0) {
      <p class="muted">{{ customers().length === 0 ? 'There are no customers yet.' : 'No customers match your filters.' }}</p>
    } @else {
      <p class="result-count">Showing {{ filtered().length }} of {{ customers().length }} customers</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="filtered()">
          <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
          <ng-container matColumnDef="customerID">
            <th mat-header-cell *matHeaderCellDef>#</th>
            <td mat-cell *matCellDef="let c">{{ c.customerID }}</td>
          </ng-container>
          <!-- the email sits under the name, so the table stays narrow enough to fit without scrolling -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Customer</th>
            <td mat-cell *matCellDef="let c">
              <strong>{{ c.firstName }} {{ c.lastName }}</strong>
              <div class="cell-sub">{{ c.customerEmail }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>Phone</th>
            <td mat-cell *matCellDef="let c">{{ c.customerPhone }}</td>
          </ng-container>
          <ng-container matColumnDef="dob">
            <th mat-header-cell *matHeaderCellDef>Born</th>
            <td mat-cell *matCellDef="let c">{{ c.customerDOB | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="policies">
            <th mat-header-cell *matHeaderCellDef>Policies</th>
            <td mat-cell *matCellDef="let c">{{ c.activePolicies }}</td>
          </ng-container>
          <ng-container matColumnDef="claims">
            <th mat-header-cell *matHeaderCellDef>Open claims</th>
            <td mat-cell *matCellDef="let c">{{ c.openClaims }}</td>
          </ng-container>
          <ng-container matColumnDef="overdue">
            <th mat-header-cell *matHeaderCellDef>Overdue</th>
            <td mat-cell *matCellDef="let c">
              <!-- red and bold when the customer is behind, so the admin spots them at a glance -->
              <span [class.overdue]="c.overduePayments > 0">{{ c.overduePayments }}</span>
            </td>
          </ng-container>
          <!-- colored status badge (styles come from the global styles) -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let c">
              <span [class]="statusClass(c.isActive ? 'Active' : 'Deactivated')">{{ c.isActive ? 'Active' : 'Deactivated' }}</span>
            </td>
          </ng-container>
          <!-- arrow hinting that the row opens a pop-up -->
          <ng-container matColumnDef="open">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c"><mat-icon class="row-chevron">chevron_right</mat-icon></td>
          </ng-container>

          <!-- the header row and one clickable row per customer (Enter works too, for keyboard users) -->
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns" class="clickable-row" tabindex="0"
              (click)="open(row)" (keydown.enter)="open(row)"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .overdue { color: var(--mat-sys-error); font-weight: 700; }
  `
})
export class AdminCustomers {
  private svc = inject(AdminService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  // page state as signals, so the template updates automatically when they change
  customers = signal<AdminCustomer[]>([]);
  loading = signal(true);
  search = signal('');
  filter = signal<CustomerFilter>('all');
  sorts = SORTS;
  sort = signal(0);               // index into SORTS; starts on Last name (A to Z)
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['customerID', 'name', 'phone', 'dob', 'policies', 'claims', 'overdue', 'status', 'open'];

  // the table shows only customers matching the status filter and the search box, in the chosen order
  filtered = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    const rows = this.customers().filter(c =>
      (f === 'all' || (f === 'active' && c.isActive) || (f === 'deactivated' && !c.isActive) || (f === 'overdue' && c.overduePayments > 0)) &&
      (!q || `${c.customerID} ${c.firstName} ${c.lastName} ${c.customerEmail} ${c.customerPhone}`.toLowerCase().includes(q)));
    return sortedBy(rows, this.sorts[this.sort()]);
  });

  constructor() { this.load(); }

  // fetches every customer; called when the page opens and after each change
  private load() {
    this.svc.getCustomers().subscribe({
      next: c => { this.customers.set(c); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 });
      }
    });
  }

  // clicking a row opens the customer pop-up; whatever the admin picks there is carried out here
  open(c: AdminCustomer) {
    this.dialog.open(AdminEditCustomerDialog, { data: c, width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((r: CustomerDialogResult | undefined) => {
        if (!r) return;   // closed without choosing anything
        if (r.action === 'save') this.edit(c, r.value);
        else if (r.action === 'reset') this.resetPassword(c);
        else if (r.action === 'deactivate') this.deactivate(c);
        else this.reactivate(c);
      });
  }

  // step 1 (the pop-up) collected the new fields; step 2: the admin enters their password to save
  private edit(c: AdminCustomer, v: EditCustomerValue) {
    this.askPassword({
      title: 'Save these changes?',
      message: `Enter your admin password to update ${c.firstName} ${c.lastName}.`,
      confirmText: 'Save changes',
      action: pw => this.svc.updateCustomer(c.customerID, { password: pw, ...v })
    }, 'Customer updated.');
  }

  // red-button prompt; the customer can't log in until reactivated
  private deactivate(c: AdminCustomer) {
    this.askPassword({
      title: 'Deactivate this account?',
      message: `${c.firstName} ${c.lastName} will no longer be able to log in. Enter your admin password to continue.`,
      confirmText: 'Deactivate',
      destructive: true,
      action: pw => this.svc.deactivate(c.customerID, pw)
    }, 'Account deactivated.');
  }

  private reactivate(c: AdminCustomer) {
    this.askPassword({
      title: 'Reactivate this account?',
      message: `${c.firstName} ${c.lastName} will be able to log in again. Enter your admin password to continue.`,
      confirmText: 'Reactivate',
      action: pw => this.svc.reactivate(c.customerID, pw)
    }, 'Account reactivated.');
  }

  // the admin confirms with their password; the API creates a temporary password, which is shown once
  private resetPassword(c: AdminCustomer) {
    this.askPassword({
      title: 'Reset this password?',
      message: `A temporary password will be created for ${c.firstName} ${c.lastName}, and they must change it the next time they log in. Enter your admin password to continue.`,
      confirmText: 'Reset password',
      destructive: true,
      action: pw => this.svc.resetPassword(c.customerID, pw)
    }, 'Password reset.', (res: unknown) => {
      const temp = (res as { temporaryPassword?: string }).temporaryPassword;
      // disableClose: clicking outside can't dismiss it by accident, since the password can't be shown again
      if (temp) this.dialog.open(TempPasswordDialog, { data: { name: `${c.firstName} ${c.lastName}`, password: temp }, width: '460px', disableClose: true });
    });
  }

  // opens the shared password prompt; if the action succeeded, shows a message, refreshes the table
  // and (optionally) passes the action's result on
  private askPassword(data: PasswordPromptData, doneMessage: string, onResult?: (result: unknown) => void) {
    this.dialog.open(PasswordPromptDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe(done => {
        if (done) {
          this.snack.open(doneMessage, 'OK', { duration: 6000 });
          this.load();
          onResult?.(done);
        }
      });
  }
}
