/* Profile page: shows the customer's details, with an edit mode for email and phone, a change-password dialog,
 and account deactivation. Saving and deactivating ask for the password in a pop-up; API calls go through CustomerService. */
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { CurrentUserService } from '../../services/current-user.service';
import { CustomerService } from '../../services/customer.service';
import { Customer } from '../../models/customer.models';
import { ChangePasswordDialog } from '../../shared/change-password-dialog';
import { PasswordPromptData, PasswordPromptDialog } from '../../shared/password-prompt-dialog';
import { apiErrorMessage } from '../../utils/api-error';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, DatePipe, MatCardModule, MatFormFieldModule, MatInputModule,
            MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class Profile {
  private fb = inject(FormBuilder);
  private customers = inject(CustomerService);
  private auth = inject(AuthService);
  private currentUser = inject(CurrentUserService);   // shared with the toolbar's account menu
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // page state as signals, so the template updates automatically when they change
  me = signal<Customer | null>(null);
  editing = signal(false);        // false = read-only details, true = email/phone form

  // only email and phone can be edited; the password is asked for separately when saving
  editForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required]
  });

  constructor() {
    // load the profile when the page opens
    this.customers.getMe().subscribe({
      next: c => this.me.set(c),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
  }

  // switches to edit mode with the form filled in from the saved profile
  startEdit() {
    const c = this.me();
    if (!c) return;
    this.editForm.reset({ email: c.customerEmail, phone: c.customerPhone });   // start from the saved values
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);       // the typed changes are simply discarded
  }

  // checks the form, then asks for the password in a pop-up that does the actual save
  save() {
    const c = this.me();
    if (!c) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const email = this.editForm.controls.email.value.trim();
    const phone = this.editForm.controls.phone.value.trim();

    // nothing changed: no reason to ask for a password
    if (email === c.customerEmail && phone === c.customerPhone) {
      this.editing.set(false);
      this.snack.open('No changes to save.', 'OK', { duration: 4000 });
      return;
    }

    const data: PasswordPromptData = {
      title: 'Confirm your changes',
      message: 'Enter your current password to save these changes.',
      confirmText: 'Save changes',
      action: password => this.customers.updateContact({ email, phone, currentPassword: password })
    };

    // an object result means the save worked; cancelling the prompt returns false
    this.dialog.open(PasswordPromptDialog, { data, width: '420px' }).afterClosed().subscribe(result => {
      if (result && typeof result === 'object') {
        const updated = result as Customer;           // the API returns the saved profile
        this.me.set(updated);
        this.currentUser.me.set(updated);             // keeps the account menu in sync
        this.editing.set(false);
        this.snack.open('Your details were updated.', 'OK', { duration: 6000 });
      }
    });
  }

  // opens the change-password dialog, which saves by itself and closes with true on success
  changePassword() {
    this.dialog.open(ChangePasswordDialog, { width: '420px' }).afterClosed().subscribe(done => {
      if (done) this.snack.open('Password updated.', 'OK', { duration: 6000 });
    });
  }

  // asks for the password in a red-button prompt; on success logs the customer out (the database decides if it's allowed)
  deactivate() {
    const data: PasswordPromptData = {
      title: 'Deactivate your account?',
      message: 'You will be logged out and will not be able to log in again until support reactivates your account. '
             + 'This is only possible when you have no active policies, open claims or overdue payments. '
             + 'Enter your password to continue.',
      confirmText: 'Deactivate account',
      destructive: true,
      action: password => this.customers.deactivate(password)
    };

    this.dialog.open(PasswordPromptDialog, { data, width: '440px' }).afterClosed().subscribe(result => {
      if (result && typeof result === 'object') {
        this.auth.logout();
        this.snack.open((result as { message: string }).message, 'OK', { duration: 15000 });
      }
    });
  }
}
