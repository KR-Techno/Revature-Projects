/* Admin customer dashboard: every customer and their info (never the password).
 Viewing needs no password; editing, deactivating, reactivating and resetting a password each ask the admin for their own password first. */
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminCustomer } from '../../models/admin.models';
import { PasswordPromptData, PasswordPromptDialog } from '../../shared/password-prompt-dialog';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';
import { AdminEditCustomerDialog, EditCustomerValue } from './admin-edit-customer-dialog';
import { TempPasswordDialog } from '../../shared/temp-password-dialog';

@Component({
  selector: 'app-admin-customers',
  imports: [DatePipe, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>Customers</h1>

    <!-- search by name, email, phone or customer number -->
    <mat-form-field appearance="outline" class="search">
      <mat-label>Search customers</mat-label>
      <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
    </mat-form-field>

    <!-- loading message, then either a friendly empty message or the table -->
    @if (loading()) {
      <p>Loading customers...</p>
    } @else if (filtered().length === 0) {
      <p>{{ customers().length === 0 ? 'There are no customers yet.' : 'No customers match your search.' }}</p>
    } @else {
      <div class="table-wrap">
        <table mat-table [dataSource]="filtered()">
          <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
          <ng-container matColumnDef="customerID">
            <th mat-header-cell *matHeaderCellDef>Customer #</th>
            <td mat-cell *matCellDef="let c">{{ c.customerID }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let c">{{ c.firstName }} {{ c.lastName }}</td>
          </ng-container>
          <ng-container matColumnDef="dob">
            <th mat-header-cell *matHeaderCellDef>Date of birth</th>
            <td mat-cell *matCellDef="let c">{{ c.customerDOB | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let c">{{ c.customerEmail }}</td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>Phone</th>
            <td mat-cell *matCellDef="let c">{{ c.customerPhone }}</td>
          </ng-container>
          <ng-container matColumnDef="policies">
            <th mat-header-cell *matHeaderCellDef>Active policies</th>
            <td mat-cell *matCellDef="let c">{{ c.activePolicies }}</td>
          </ng-container>
          <ng-container matColumnDef="claims">
            <th mat-header-cell *matHeaderCellDef>Open claims</th>
            <td mat-cell *matCellDef="let c">{{ c.openClaims }}</td>
          </ng-container>
          <ng-container matColumnDef="overdue">
            <th mat-header-cell *matHeaderCellDef>Overdue payments</th>
            <td mat-cell *matCellDef="let c">
              <!-- red and bold when the customer is behind, so the admin spots them at a glance -->
              <span [class.overdue]="c.overduePayments > 0">{{ c.overduePayments }}</span>
            </td>
          </ng-container>
          <!-- colored status badge (styles come from the global styles.scss) -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let c">
              <span [class]="statusClass(c.isActive ? 'Active' : 'Deactivated')">{{ c.isActive ? 'Active' : 'Deactivated' }}</span>
            </td>
          </ng-container>
          <!-- Deactivate and Reactivate swap depending on the account's current status -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c" class="actions">
              <button mat-button (click)="edit(c)">Edit</button>
              <button mat-button (click)="resetPassword(c)">Reset password</button>
              @if (c.isActive) {
                <button mat-button (click)="deactivate(c)">Deactivate</button>
              } @else {
                <button mat-button (click)="reactivate(c)">Reactivate</button>
              }
            </td>
          </ng-container>

          <!-- the header row and one row per customer, using the column order from "columns" below -->
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .search { width: 100%; max-width: 420px; }
    /* lets the wide table scroll sideways on small screens */
    .table-wrap { overflow-x: auto; }
    .actions { white-space: nowrap; }
    .overdue { color: var(--mat-sys-error); font-weight: 600; }
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
  statusClass = statusClass;      // colors the status badge
  // which table columns to show, in order (each name matches a matColumnDef above)
  columns = ['customerID', 'name', 'dob', 'email', 'phone', 'policies', 'claims', 'overdue', 'status', 'actions'];

  // the table shows only customers matching the search box
  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter(c =>
      `${c.customerID} ${c.firstName} ${c.lastName} ${c.customerEmail} ${c.customerPhone}`.toLowerCase().includes(q));
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

  // step 1: edit the fields; step 2: the admin enters their password to save
  edit(c: AdminCustomer) {
    this.dialog.open(AdminEditCustomerDialog, { data: c, width: '460px' })
      .afterClosed()
      .subscribe((v: EditCustomerValue | undefined) => {
        if (!v) return;
        this.askPassword({
          title: 'Save these changes?',
          message: `Enter your admin password to update ${c.firstName} ${c.lastName}.`,
          confirmText: 'Save changes',
          action: pw => this.svc.updateCustomer(c.customerID, { password: pw, ...v })
        }, 'Customer updated.');
      });
  }

  // red-button prompt; the customer can't log in until reactivated
  deactivate(c: AdminCustomer) {
    this.askPassword({
      title: 'Deactivate this account?',
      message: `${c.firstName} ${c.lastName} will no longer be able to log in. Enter your admin password to continue.`,
      confirmText: 'Deactivate',
      destructive: true,
      action: pw => this.svc.deactivate(c.customerID, pw)
    }, 'Account deactivated.');
  }

  reactivate(c: AdminCustomer) {
    this.askPassword({
      title: 'Reactivate this account?',
      message: `${c.firstName} ${c.lastName} will be able to log in again. Enter your admin password to continue.`,
      confirmText: 'Reactivate',
      action: pw => this.svc.reactivate(c.customerID, pw)
    }, 'Account reactivated.');
  }

  // the admin confirms with their password; the API creates a temporary password, which is shown once
  resetPassword(c: AdminCustomer) {
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
