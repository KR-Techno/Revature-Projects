/* Forced "create your new password" screen, shown after an admin reset the customer's password.
 It takes over the whole window and has no way out: no menu, no back link, no log out button. The customer enters the
 temporary password they were given plus a new one; on success they are logged out and sign in with the new password.
 The API also refuses every other request until this is done, so the screen can't be skipped. */
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../services/customer.service';
import { apiErrorMessage } from '../../utils/api-error';
import { PASSWORD_PATTERN, matchesField } from '../../utils/password-rules';

@Component({
  selector: 'app-change-password-required',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <!-- fixed over everything, like a pop-up that can't be closed -->
    <div class="overlay">
      <!-- role="dialog" + aria-modal tell screen readers this panel is the only thing on screen -->
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div class="lock"><mat-icon>lock_reset</mat-icon></div>
        <h1 id="reset-title">Create your new password</h1>
        <p class="lead">An administrator reset your password. Enter the temporary password you were given, then choose a new one to continue.</p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <!-- eye button toggles between showing the password as dots and as plain text -->
          <mat-form-field appearance="outline" class="full">
            <mat-label>Temporary password</mat-label>
            <input matInput [type]="hideCurrent() ? 'password' : 'text'" formControlName="currentPassword" autocomplete="current-password" />
            <button mat-icon-button matSuffix type="button" (click)="hideCurrent.set(!hideCurrent())"
                    [attr.aria-label]="hideCurrent() ? 'Show password' : 'Hide password'">
              <mat-icon>{{ hideCurrent() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            <mat-error>Enter the temporary password</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>New password</mat-label>
            <input matInput [type]="hideNew() ? 'password' : 'text'" formControlName="newPassword" autocomplete="new-password" />
            <button mat-icon-button matSuffix type="button" (click)="hideNew.set(!hideNew())"
                    [attr.aria-label]="hideNew() ? 'Show password' : 'Hide password'">
              <mat-icon>{{ hideNew() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
          </mat-form-field>

          <!-- live checklist: each rule ticks off as the customer types -->
          <ul class="rules">
            @for (r of rules(); track r.label) {
              <li [class.ok]="r.ok">
                <mat-icon>{{ r.ok ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ r.label }}
              </li>
            }
          </ul>

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

          <button mat-flat-button type="submit" class="submit" [disabled]="loading()">Set new password</button>
        </form>
      </div>
    </div>
  `,
  styles: `
    /* full-window backdrop with a soft gradient; scrolls on short screens so the button is always reachable */
    .overlay {
      position: fixed; inset: 0; z-index: 1000; overflow-y: auto;
      display: flex; align-items: center; justify-content: center; padding: 24px 16px;
      background: linear-gradient(160deg, var(--mat-sys-primary-container), var(--mat-sys-surface) 70%);
    }
    .panel {
      width: 100%; max-width: 440px; padding: 32px 28px;
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface);
      border-radius: 28px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }
    /* round lock badge above the title */
    .lock {
      width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container);
    }
    .lock mat-icon { font-size: 32px; width: 32px; height: 32px; }
    h1 { margin: 0 0 8px; text-align: center; font-size: 1.6rem; }
    .lead { margin: 0 0 20px; text-align: center; opacity: 0.8; }
    .full { width: 100%; }
    /* unmet rules are faded; met rules turn the primary color */
    .rules { list-style: none; margin: 0 0 16px; padding: 0; font-size: 0.9rem; }
    .rules li { display: flex; align-items: center; gap: 8px; margin: 2px 0; opacity: 0.7; }
    .rules li.ok { opacity: 1; color: var(--mat-sys-primary); }
    .rules mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .error { color: var(--mat-sys-error); margin: 0 0 12px; }
    .submit { width: 100%; height: 48px; }
  `
})
export class ChangePasswordRequired {
  private fb = inject(FormBuilder);
  private customers = inject(CustomerService);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  // page state as signals; each password pair has its own show/hide switch
  hideCurrent = signal(true);
  hideNew = signal(true);
  loading = signal(false);
  error = signal('');

  // same rule as registration and the profile's change-password dialog
  form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required, matchesField('newPassword')]]
  });

  // the new password as it is typed, so the checklist can tick off each rule live
  private typed = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });
  rules = computed(() => {
    const p = this.typed();
    return [
      { label: '8 to 64 characters', ok: p.length >= 8 && p.length <= 64 },
      { label: 'An uppercase letter', ok: /[A-Z]/.test(p) },
      { label: 'A lowercase letter', ok: /[a-z]/.test(p) },
      { label: 'A number', ok: /\d/.test(p) },
      { label: 'A special character', ok: /[^A-Za-z0-9]/.test(p) }
    ];
  });

  constructor() {
    // re-check the confirm field whenever the new password changes
    this.form.controls.newPassword.valueChanges.subscribe(() =>
      this.form.controls.confirmPassword.updateValueAndValidity());
  }

  // saves through PUT /api/customers/me/password (the one call the API allows during a reset), then logs out.
  // The old token still says "must change password", so a fresh login is needed anyway.
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.error.set('');
    this.loading.set(true);

    this.customers.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => {
        this.snack.open('Password updated. Please log in with your new password.', 'OK', { duration: 10000 });
        this.auth.logout();
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      }
    });
  }
}
