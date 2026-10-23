/* Pop-up that opens when the admin clicks a customer row: shows the customer's details at a glance, lets the admin
 edit their name and date of birth, and holds the reset-password and deactivate/reactivate buttons.
 It does NOT save anything itself: it closes with what the admin chose, and the page then asks for the admin's password. */
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AdminCustomer } from '../../models/admin.models';
import { statusClass } from '../../utils/status-class';

export interface EditCustomerValue { firstName: string; lastName: string; dateOfBirth: string; }

// what the admin picked in the pop-up: save the edited fields, or one of the account actions
export type CustomerDialogResult =
  | { action: 'save'; value: EditCustomerValue }
  | { action: 'reset' | 'deactivate' | 'reactivate' };

// "yyyy-mm-dd" for the date exactly 18 years ago (customers must be 18 or older)
function eighteenYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO date strings compare correctly as plain text
const adult = (control: AbstractControl): ValidationErrors | null =>
  control.value && control.value > eighteenYearsAgo() ? { underage: true } : null;

@Component({
  selector: 'app-admin-edit-customer-dialog',
  imports: [ReactiveFormsModule, DatePipe, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <h2 mat-dialog-title>{{ data.firstName }} {{ data.lastName }}</h2>
      <mat-dialog-content>
        <!-- read-only details: the admin can see everything about the account without scrolling a table -->
        <dl class="detail-list">
          <dt>Customer #</dt><dd>{{ data.customerID }}</dd>
          <dt>Status</dt>
          <dd><span [class]="statusClass(data.isActive ? 'Active' : 'Deactivated')">{{ data.isActive ? 'Active' : 'Deactivated' }}</span></dd>
          <dt>Email</dt><dd>{{ data.customerEmail }}</dd>
          <dt>Phone</dt><dd>{{ data.customerPhone }}</dd>
          <dt>Born</dt><dd>{{ data.customerDOB | date:'MM/dd/yyyy' }}</dd>
          <dt>Activity</dt>
          <dd>
            {{ data.activePolicies }} active {{ data.activePolicies === 1 ? 'policy' : 'policies' }} ·
            {{ data.openClaims }} open {{ data.openClaims === 1 ? 'claim' : 'claims' }} ·
            <span [class.overdue]="data.overduePayments > 0">{{ data.overduePayments }} overdue</span>
          </dd>
        </dl>

        <h3>Edit details</h3>
        <p class="note">Email and phone are changed by the customer. You'll be asked for your password to save.</p>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>First name</mat-label>
            <input matInput formControlName="firstName" />
            <mat-error>First name is required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Last name</mat-label>
            <input matInput formControlName="lastName" />
            <mat-error>Last name is required</mat-error>
          </mat-form-field>
        </div>

        <!-- the browser's date picker shows the date in the admin's local format (mm/dd/yyyy in the US) -->
        <mat-form-field appearance="outline" class="full">
          <mat-label>Date of birth</mat-label>
          <input matInput type="date" formControlName="dateOfBirth" />
          @if (form.controls.dateOfBirth.hasError('required')) {
            <mat-error>Date of birth is required</mat-error>
          } @else if (form.controls.dateOfBirth.hasError('underage')) {
            <mat-error>Customers must be at least 18 years old</mat-error>
          }
        </mat-form-field>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <!-- account actions; each one asks for the admin's password on the next screen -->
        <h3>Account</h3>
        <div class="account-actions">
          <button mat-stroked-button type="button" (click)="choose('reset')">Reset password</button>
          @if (data.isActive) {
            <button mat-stroked-button type="button" class="danger-text" (click)="choose('deactivate')">Deactivate account</button>
          } @else {
            <button mat-stroked-button type="button" (click)="choose('reactivate')">Reactivate account</button>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Close</button>
        <button mat-flat-button type="submit">Save changes</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row mat-form-field { flex: 1 1 180px; }
    h3 { margin: 8px 0 6px; }
    .note { color: var(--app-muted); font-size: 0.9rem; margin: 0 0 16px; }
    .overdue { color: var(--mat-sys-error); font-weight: 700; }
    .account-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
    .danger-text { --mat-button-outlined-label-text-color: var(--mat-sys-error); }
    .error { color: var(--mat-sys-error); margin: 0 0 12px; }
  `
})
export class AdminEditCustomerDialog {
  data = inject<AdminCustomer>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AdminEditCustomerDialog>);
  error = signal('');
  statusClass = statusClass;      // colors the status badge

  // starts with the customer's current values
  form = new FormGroup({
    firstName: new FormControl(this.data.firstName, { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    lastName: new FormControl(this.data.lastName, { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    dateOfBirth: new FormControl(this.data.customerDOB, { nonNullable: true, validators: [Validators.required, adult] })
  });

  // hands the new values back to the page; nothing is saved until the admin enters their password there
  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const unchanged = v.firstName.trim() === this.data.firstName && v.lastName.trim() === this.data.lastName
      && v.dateOfBirth === this.data.customerDOB;
    if (unchanged) {
      this.error.set('Change at least one field first.');
      return;
    }
    const value: EditCustomerValue = { firstName: v.firstName.trim(), lastName: v.lastName.trim(), dateOfBirth: v.dateOfBirth };
    this.ref.close({ action: 'save', value } as CustomerDialogResult);
  }

  // closes with one of the account actions; the page takes it from there
  choose(action: 'reset' | 'deactivate' | 'reactivate') {
    this.ref.close({ action } as CustomerDialogResult);
  }
}
