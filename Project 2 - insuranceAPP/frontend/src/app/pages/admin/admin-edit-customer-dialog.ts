/* Pop-up for the admin to edit a customer's name and date of birth.
 It does NOT save anything itself: it returns the new values, and the page then asks for the admin's password before saving. */
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AdminCustomer } from '../../models/admin.models';

export interface EditCustomerValue { firstName: string; lastName: string; dateOfBirth: string; }

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
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <h2 mat-dialog-title>Edit {{ data.firstName }} {{ data.lastName }}</h2>
      <mat-dialog-content>
        <p class="note">Email and phone are changed by the customer. You'll be asked for your password to save.</p>

        <mat-form-field appearance="outline" class="full">
          <mat-label>First name</mat-label>
          <input matInput formControlName="firstName" />
          <mat-error>First name is required</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Last name</mat-label>
          <input matInput formControlName="lastName" />
          <mat-error>Last name is required</mat-error>
        </mat-form-field>

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
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit">Continue</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .note { opacity: 0.8; font-size: 0.9rem; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class AdminEditCustomerDialog {
  data = inject<AdminCustomer>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AdminEditCustomerDialog>);
  error = signal('');

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
    this.ref.close({ firstName: v.firstName.trim(), lastName: v.lastName.trim(), dateOfBirth: v.dateOfBirth } as EditCustomerValue);
  }
}