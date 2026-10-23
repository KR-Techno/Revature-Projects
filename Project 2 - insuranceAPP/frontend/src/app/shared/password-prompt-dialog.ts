/* Reusable pop-up that asks for the current password, then runs whatever action the caller passed in.
 Used for saving profile details and for deactivating; any API error (e.g. wrong password) shows inside the prompt. */
import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { apiErrorMessage } from '../utils/api-error';

// what the opening page passes in: the wording, and the action to run with the password
export interface PasswordPromptData {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;                                // shows the confirm button in red
  action: (password: string) => Observable<unknown>;    // what to do once the password is entered
}

@Component({
  selector: 'app-password-prompt-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <!-- the whole dialog is one form, so pressing Enter in the password field submits it -->
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        <p>{{ data.message }}</p>
        <!-- eye button toggles between showing the password as dots and as plain text -->
        <mat-form-field appearance="outline" class="full">
          <mat-label>Current password</mat-label>
          <input matInput [type]="hide() ? 'password' : 'text'" formControlName="password" autocomplete="current-password" />
          <button mat-icon-button matSuffix type="button" (click)="hide.set(!hide())"
                  [attr.aria-label]="hide() ? 'Show password' : 'Hide password'">
            <mat-icon>{{ hide() ? 'visibility' : 'visibility_off' }}</mat-icon>
          </button>
          <mat-error>Enter your current password</mat-error>
        </mat-form-field>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </mat-dialog-content>
      <!-- the confirm button turns red for destructive actions like deactivating -->
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancel</button>
        <button mat-flat-button type="submit" [class.danger-button]="data.destructive" [disabled]="loading()">
          {{ data.confirmText }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class PasswordPromptDialog {
  data = inject<PasswordPromptData>(MAT_DIALOG_DATA);        // the wording and action passed in by dialog.open()
  private ref = inject(MatDialogRef<PasswordPromptDialog>);  // used to close the dialog and send back the result

  // dialog state as signals, so the template updates automatically when they change
  hide = signal(true);
  loading = signal(false);
  error = signal('');

  form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: Validators.required })
  });

  // runs the caller's action with the password; stays open on failure so the customer can try again
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);

    this.data.action(this.form.controls.password.value).subscribe({
      // closing hands the action's result back to whoever opened the prompt
      next: result => this.ref.close(result ?? true),
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));    // e.g. "Current password is incorrect."
        this.loading.set(false);
      }
    });
  }
}
