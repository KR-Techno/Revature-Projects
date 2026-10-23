/* Register page: a reactive form for creating a new customer account.
 Validates the input in the browser first, then sends it to POST /api/auth/register through AuthService. */
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { BrandMark } from '../../shared/brand-mark';
import { apiErrorMessage } from '../../utils/api-error';
import { PASSWORD_PATTERN, matchesField } from '../../utils/password-rules';
import { map } from 'rxjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const MIN_AGE = 18;

// how many days a month has; with no year chosen yet, assume a leap year so Feb 29 stays selectable
function daysInMonth(month: number | null, year: number | null): number {
  if (!month) return 31;
  return new Date(year ?? 2000, month, 0).getDate();   // day 0 of the next month = last day of this one
}

// the form is invalid when the chosen birth date is less than 18 years ago
function adultValidator(group: AbstractControl): ValidationErrors | null {
  const year = group.get('dobYear')?.value;
  const month = group.get('dobMonth')?.value;
  const day = group.get('dobDay')?.value;
  if (!year || !month || !day) return null;        // the required validators handle an incomplete date

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE);
  return new Date(year, month - 1, day) <= cutoff ? null : { underage: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatButtonModule, MatIconModule, BrandMark],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  // UI state: hide = password shown as dots, loading = disables the button while waiting, error = message shown above the form
  hide = signal(true);
  loading = signal(false);
  error = signal('');

  months = MONTHS;
  // newest allowed year is 18 years ago; the list goes back 120 years from today
  years = Array.from({ length: 133 }, (_, i) => new Date().getFullYear() - MIN_AGE - i);

  // the form's fields and their validation rules (limits mirror the API's RegisterRequestDto)
  form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    dobMonth: new FormControl<number | null>(null, Validators.required),
    dobDay: new FormControl<number | null>(null, Validators.required),
    dobYear: new FormControl<number | null>(null, Validators.required),
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required, matchesField('password')]]   // must equal the password field
  }, { validators: [adultValidator ] });

  // the day list depends on the chosen month and year, so we track them as signals
  private selectedMonth = toSignal(this.form.controls.dobMonth.valueChanges, { initialValue: null });
  private selectedYear = toSignal(this.form.controls.dobYear.valueChanges, { initialValue: null });
    underage = toSignal(this.form.statusChanges.pipe(map(() => this.form.hasError('underage'))),
    { initialValue: false });
  days = computed(() =>
    Array.from({ length: daysInMonth(this.selectedMonth(), this.selectedYear()) }, (_, i) => i + 1));

  constructor() {
    // re-check the confirm field whenever the password changes
    this.form.controls.password.valueChanges.subscribe(() =>
      this.form.controls.confirmPassword.updateValueAndValidity());

    // if the chosen day no longer exists (31 then April, 29 then a non-leap year), clear it
    const clampDay = () => {
      const day = this.form.controls.dobDay.value;
      if (day && day > daysInMonth(this.selectedMonth(), this.selectedYear())) {
        this.form.controls.dobDay.setValue(null);
      }
    };
    this.form.controls.dobMonth.valueChanges.subscribe(clampDay);
    this.form.controls.dobYear.valueChanges.subscribe(clampDay);
  }

  // builds the "yyyy-mm-dd" text the API expects
  private dobString(): string {
    const { dobYear, dobMonth, dobDay } = this.form.getRawValue();
    return `${dobYear}-${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
  }

  // if the form is invalid, show every field's error instead of sending the request
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const v = this.form.getRawValue();

    // the one place that maps form fields to the API's field names
    this.auth.register({
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      dateOfBirth: this.dobString(),
      email: v.email.trim(),
      phone: v.phone.trim(),
      password: v.password
    }).subscribe({
      // success: show the new customer ID, then send them to the login page
      next: res => {
        this.snackBar.open(`Account created! Your customer ID is ${res.customerID}. Please log in.`, 'OK', { duration: 20000 });
        this.router.navigateByUrl('/login');
      },
      // failure (e.g. email already registered): show the API's message and re-enable the button
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err, 'Registration failed.'));
        this.loading.set(false);
      }
    });
  }
}