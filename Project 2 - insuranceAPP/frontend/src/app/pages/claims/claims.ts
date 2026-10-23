/* Claims page: lists the customer's claims, lets them file a new claim on an active policy, and withdraw pending ones.
 Uses ClaimService for claims and PolicyService to fill the policy dropdown; withdrawing asks for confirmation first. */
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormControl, FormGroupDirective, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ClaimService } from '../../services/claim.service';
import { PolicyService } from '../../services/policy.service';
import { Claim } from '../../models/claim.models';
import { Policy } from '../../models/policy.models';
import { ConfirmData, ConfirmDialog } from '../../shared/confirm-dialog';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

// how many days a month has; with no year chosen yet, assume a leap year so Feb 29 stays selectable
const daysInMonth = (month: number | null, year: number | null) =>
  month ? new Date(year ?? 2000, month, 0).getDate() : 31;

// turns 7 into "07" so dates come out as yyyy-mm-dd
const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-claims',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, MatCardModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatButtonModule, MatTableModule],
  templateUrl: './claims.html',
  styleUrl: './claims.scss'
})
export class Claims {
  private claimSvc = inject(ClaimService);
  private policySvc = inject(PolicyService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  // the <form> element's directive; resetting through it also clears the "submitted" state, so empty fields don't turn red
  private formDirective = viewChild(FormGroupDirective);

  // page state as signals, so the template updates automatically when they change
  claims = signal<Claim[]>([]);
  policies = signal<Policy[]>([]);
  loading = signal(false);
  error = signal('');
  statusClass = statusClass;      // exposed so the template can color the status badges
  // which table columns to show, in order (each name matches a matColumnDef in claims.html)
  columns =['claimID', 'policy', 'incidentDate', 'claimAmount', 'status', 'decision', 'actions'];
  today = new Date().toLocaleDateString('en-CA');      // today as yyyy-mm-dd in the user's time zone
  months = MONTHS;

  // claims can only be filed on an active policy
  activePolicies = computed(() => this.policies().filter(p => p.displayStatus === 'Active'));

  // the claim form's fields and their validation rules (the max claim amount is added once a policy is chosen)
  form = this.fb.nonNullable.group({
    policyID: new FormControl<number | null>(null, Validators.required),
    incidentMonth: new FormControl<number | null>(null, Validators.required),
    incidentDay: new FormControl<number | null>(null, Validators.required),
    incidentYear: new FormControl<number | null>(null, Validators.required),
    claimDescription: ['', [Validators.required, Validators.maxLength(1000)]],
    claimAmount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)])
  });

  // tracks the chosen policy so the date limits and coverage hint can update with it
  private policyId = toSignal(this.form.controls.policyID.valueChanges, { initialValue: null });
  selectedPolicy = computed(() => this.activePolicies().find(p => p.policyID === this.policyId()) ?? null);

  // the incident must fall inside the policy period and cannot be in the future (yyyy-mm-dd strings)
  minDate = computed(() => this.selectedPolicy()?.startDate ?? '');
  maxDate = computed(() => {
    const p = this.selectedPolicy();
    if (!p) return '';
    return p.endDate < this.today ? p.endDate : this.today;
  });

  // the day list depends on the chosen month and year, so we track them as signals
  private selectedMonth = toSignal(this.form.controls.incidentMonth.valueChanges, { initialValue: null });
  private selectedYear = toSignal(this.form.controls.incidentYear.valueChanges, { initialValue: null });

  // only the years the chosen policy covers (newest first)
  years = computed(() => {
    const lo = this.minDate(), hi = this.maxDate();
    if (!lo || !hi) return [];
    const first = Number(lo.slice(0, 4)), last = Number(hi.slice(0, 4));
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => last - i);
  });

  days = computed(() =>
    Array.from({ length: daysInMonth(this.selectedMonth(), this.selectedYear()) }, (_, i) => i + 1));

  // true while the chosen date is outside the allowed window
  outOfRange = toSignal(
    this.form.statusChanges.pipe(map(() => this.form.hasError('outOfRange'))),
    { initialValue: false });

  constructor() {
    // load the customer's policies (for the dropdown) and their existing claims when the page opens
    this.policySvc.getMine().subscribe(p => this.policies.set(p));
    this.load();

    // the date check needs all three dropdowns at once, so it runs on the whole form
    this.form.setValidators(this.validateIncidentDate);

    // the claim amount can't be more than the chosen policy's coverage
    this.form.controls.policyID.valueChanges.subscribe(id => {
      const policy = this.activePolicies().find(p => p.policyID === id);
      const amount = this.form.controls.claimAmount;
      amount.setValidators(policy
        ? [Validators.required, Validators.min(0.01), Validators.max(policy.coverageAmount)]
        : [Validators.required, Validators.min(0.01)]);
      amount.updateValueAndValidity();
    });

    // if the chosen day no longer exists (31 then April, 29 then a non-leap year), clear it
    const clampDay = () => {
      const day = this.form.controls.incidentDay.value;
      if (day && day > daysInMonth(this.selectedMonth(), this.selectedYear())) {
        this.form.controls.incidentDay.setValue(null);
      }
    };
    this.form.controls.incidentMonth.valueChanges.subscribe(clampDay);
    this.form.controls.incidentYear.valueChanges.subscribe(clampDay);
  }

  // form-level validator: flags "outOfRange" when the chosen date is before the policy started or after its limit
  private validateIncidentDate =(group: AbstractControl): ValidationErrors | null => {
    const y = group.get('incidentYear')?.value;
    const m = group.get('incidentMonth')?.value;
    const d = group.get('incidentDay')?.value;
    const lo = this.minDate(), hi = this.maxDate();
    if (!y || !m || !d || !lo || !hi) return null;       // the required validators handle an incomplete date

    const chosen = `${y}-${pad(m)}-${pad(d)}`;           // yyyy-mm-dd strings compare correctly as text
    return chosen < lo || chosen > hi ? { outOfRange: true } : null;
  };

  // fetches the customer's claims; called when the page opens and after filing or withdrawing
  private load() {
    this.claimSvc.getMine().subscribe({
      next: c => this.claims.set(c),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
  }

  // validates the form, files the claim, then clears the form and refreshes the table
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    const v = this.form.getRawValue();

    this.claimSvc.submit({
      policyID: v.policyID!,
      incidentDate: `${v.incidentYear}-${pad(v.incidentMonth!)}-${pad(v.incidentDay!)}`,
      claimDescription: v.claimDescription.trim(),
      claimAmount: v.claimAmount!
    }).subscribe({
      next: res => {
        this.snack.open(`Claim filed. Your claim number is ${res.claimID}.`, 'OK', { duration: 15000 });
        this.formDirective()?.resetForm();               // clears the values AND the "submitted" state
        this.loading.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      }
    });
  }

  // withdrawing is allowed only while the claim is still waiting for a decision
  canWithdraw(c: Claim) {
    return c.claimStatus === 'Submitted' || c.claimStatus === 'Under Review';
  }

  // asks for confirmation, withdraws the claim, then refreshes the table
  withdraw(c: Claim) {
    this.confirm({
      title: 'Withdraw this claim?',
      message: `Claim ${c.claimID} for $${c.claimAmount.toFixed(2)} will be withdrawn. This cannot be undone.`,
      confirmText: 'Withdraw claim'
    }, () => {
      this.claimSvc.withdraw(c.claimID).subscribe({
        next: () => {
          this.snack.open('Claim withdrawn.', 'OK', { duration: 6000 });
          this.load();
        },
        error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 10000 })
      });
    });
  }

  // opens the shared yes/no dialog and only runs onYes if the customer clicks the confirm button
  private confirm(data: ConfirmData, onYes: () => void) {
    this.dialog.open(ConfirmDialog, { data }).afterClosed().subscribe(ok => { if (ok) onYes(); });
  }
}