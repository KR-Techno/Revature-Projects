/* Pop-up for changing the customer's password: current password, new password, and confirmation.
 Saves through CustomerService and closes with true on success; any API error shows inside the dialog. */
import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CustomerService } from '../services/customer.service';
import { apiErrorMessage } from '../utils/api-error';
import { PASSWORD_PATTERN, matchesField } from '../utils/password-rules';

@Component({
  selector: 'app-change-password-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <!-- the whole dialog is one form, so pressing Enter submits it -->
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>Change password</h2>
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Current password</mat-label>
          <input matInput [type]="hideCurrent() ? 'password' : 'text'" formControlName="currentPassword" autocomplete="current-password" />
          <button mat-icon-button matSuffix type="button" (click)="hideCurrent.set(!hideCurrent())"
                  [attr.aria-label]="hideCurrent() ? 'Show password' : 'Hide password'">
            <mat-icon>{{ hideCurrent() ? 'visibility' : 'visibility_off' }}</mat-icon>
          </button>
          <mat-error>Enter your current password</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>New password</mat-label>
          <input matInput [type]="hideNew() ? 'password' : 'text'" formControlName="newPassword" autocomplete="new-password" />
          <button mat-icon-button matSuffix type="button" (click)="hideNew.set(!hideNew())"
                  [attr.aria-label]="hideNew() ? 'Show password' : 'Hide password'">
            <mat-icon>{{ hideNew() ? 'visibility' : 'visibility_off' }}</mat-icon>
          </button>
          <mat-hint>8-64 characters with upper and lower case, a number and a special character.</mat-hint>
          @if (form.controls.newPassword.hasError('required')) {
            <mat-error>New password is required</mat-error>
          } @else if (form.controls.newPassword.hasError('pattern')) {
            <mat-error>Needs upper and lower case, a number and a special character (8-64 characters).</mat-error>
          }
        </mat-form-field>

        <!-- shares the new password's show/hide switch, so both fields are visible or hidden together -->
        <mat-form-field appearance="outline" class="full">
          <mat-label>Confirm new password</mat-label>
          <input matInput [type]="hideNew() ? 'password' : 'text'" formControlName="confirmPassword" autocomplete="new-password" />
          @if (form.controls.confirmPassword.hasError('required')) {
            <mat-error>Please confirm your new password</mat-error>
          } @else if (form.controls.confirmPassword.hasError('mismatch')) {
            <mat-error>Passwords do not match</mat-error>
          }
        </mat-form-field>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="loading()">Update password</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class ChangePasswordDialog {
  private fb = inject(FormBuilder);
  private ref = inject(MatDialogRef<ChangePasswordDialog>);   // used to close the dialog and send back the result
  private customers = inject(CustomerService);

  // dialog state as signals; each password field pair has its own show/hide switch
  hideCurrent = signal(true);
  hideNew = signal(true);
  loading = signal(false);
  error = signal('');

  // the new password must meet the same rule as registration and be typed twice
  form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required, matchesField('newPassword')]]
  });

  constructor() {
    // re-check the confirm field whenever the new password changes
    this.form.controls.newPassword.valueChanges.subscribe(() =>
      this.form.controls.confirmPassword.updateValueAndValidity());
  }

  // saves the new password; stays open on failure (e.g. wrong current password) so the customer can try again
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.error.set('');
    this.loading.set(true);

    this.customers.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      }
    });
  }
}
