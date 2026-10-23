/* Pop-up dialog for changing an existing policy's coverage level and/or amount (upgrade or downgrade).
 The customer picks a level and amount, sees the new monthly price first, then confirms; returns true to the caller on success. */
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { PolicyService } from '../services/policy.service';
import { Policy, PolicyType, Quote } from '../models/policy.models';
import { apiErrorMessage } from '../utils/api-error';

// the note shown when an amount was moved to fit a level, e.g. "Your coverage was adjusted to $50,000, the maximum for Liability Only."
// exported so the Policies page shows the exact same wording
export const adjustedNote = (fitted: number, max: number, levelName: string) =>
  `Your coverage was adjusted to ${fitted.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}, ` +
  `the ${fitted === max ? 'maximum' : 'minimum'} for ${levelName}.`;

// what the opening page passes in: the policy being changed and its product (for the levels and min/max coverage limits)
export interface CoverageData { policy: Policy; type: PolicyType; }

@Component({
  selector: 'app-coverage-dialog',
  imports: [ReactiveFormsModule, CurrencyPipe, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Change your {{ data.policy.typeName }} coverage</h2>
    <mat-dialog-content>
      <p>Current: <strong>{{ data.policy.levelName }}</strong>, {{ data.policy.coverageAmount | currency }} coverage at {{ data.policy.monthlyPremium | currency }} a month.</p>

      <!-- every level of this product with its description; the current one starts selected -->
      <mat-radio-group [formControl]="level" class="levels">
        @for (l of data.type.levels; track l.coverageLevelID) {
          <mat-radio-button [value]="l.coverageLevelID" class="level">
            <strong>{{ l.levelName }}</strong>
            <span class="level-desc">{{ l.description }}</span>
          </mat-radio-button>
        }
      </mat-radio-group>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Coverage amount</mat-label>
        <span matTextPrefix>$&nbsp;</span>
        <input matInput type="number" [formControl]="coverage" />
        <!-- the hint follows whichever level is selected, since each level has its own range -->
        @if (selectedLevel(); as l) {
          <mat-hint>Between {{ l.minCoverage | currency:'USD':'symbol':'1.0-0' }} and {{ l.maxCoverage | currency:'USD':'symbol':'1.0-0' }}</mat-hint>
        }
        @if (coverage.hasError('required')) {
          <mat-error>Enter a coverage amount</mat-error>
        } @else if (coverage.hasError('min') || coverage.hasError('max')) {
          <mat-error>Outside the allowed range for this coverage level</mat-error>
        }
      </mat-form-field>
      <!-- explains an automatic change to the amount after switching to a level with a different range -->
      @if (adjusted()) {
        <p class="note">{{ adjusted() }}</p>
      }

      <!-- the new price, shown only after "See new price" and cleared if the level or amount changes -->
      @if (quote(); as q) {
        <p class="price">{{ q.monthlyPremium | currency }} <span>a month (now {{ data.policy.monthlyPremium | currency }})</span></p>
        <p class="note">Payments not yet due will use the new amount. Payments already made or overdue don't change.</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Go back</button>
      <!-- two-step button: get the price first, and only then can the change be confirmed.
           "See new price" stays greyed out until the level or amount actually differs from the current policy -->
      @if (quote()) {
        <button mat-flat-button [disabled]="loading()" (click)="confirm()">Confirm change</button>
      } @else {
        <button mat-flat-button [disabled]="loading() || unchanged()" (click)="getQuote()">See new price</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .full { width: 100%; }
    /* level radio buttons stacked, each with a smaller description under its name */
    .levels { display: flex; flex-direction: column; margin-bottom: 12px; }
    .level { margin-bottom: 4px; }
    .level-desc { display: block; font-size: 0.85rem; opacity: 0.8; white-space: normal; }
    .price { font-size: 1.5rem; font-weight: 500; margin: 8px 0 4px; }
    .price span { font-size: 0.9rem; font-weight: 400; }
    .note { font-size: 0.85rem; opacity: 0.8; }
    .error { color: var(--mat-sys-error); }
  `
})
export class CoverageDialog {
  data = inject<CoverageData>(MAT_DIALOG_DATA);        // the policy and type passed in by dialog.open()
  private ref = inject(MatDialogRef<CoverageDialog>);  // used to close the dialog and send back the result
  private svc = inject(PolicyService);

  // dialog state as signals, so the template updates automatically when they change
  quote = signal<Quote | null>(null);
  loading = signal(false);
  error = signal('');
  adjusted = signal('');   // note shown when switching level moved the amount to fit the new level's range

  // both fields start with the policy's current values; the amount must be in the chosen LEVEL's range
  // (the min/max rule is added by applyRange() in the constructor)
  level = new FormControl<number>(this.data.policy.coverageLevelID, { nonNullable: true });
  coverage = new FormControl<number | null>(this.data.policy.coverageAmount, Validators.required);

  // true while nothing differs from the current policy (so there is nothing to change yet)
  private levelValue = toSignal(this.level.valueChanges, { initialValue: this.level.value });
  private coverageValue = toSignal(this.coverage.valueChanges, { initialValue: this.coverage.value });
  unchanged = computed(() =>
    this.levelValue() === this.data.policy.coverageLevelID &&
    Number(this.coverageValue()) === this.data.policy.coverageAmount);

  // the level currently selected in the radio list (drives the hint and the min/max rule)
  selectedLevel = computed(() => this.data.type.levels.find(l => l.coverageLevelID === this.levelValue()) ?? null);

  constructor() {
    // start with the current level's range, so the amount is checked before anything is touched
    // (no adjusting here: the policy's saved amount is left exactly as it is when the dialog opens)
    this.applyRange(this.level.value);
    // a changed level or amount makes the old price stale; a new level also brings a new allowed range
    this.level.valueChanges.subscribe(id => { this.applyRange(id, true); this.quote.set(null); });
    // typing a new amount by hand also hides the "adjusted" note, since it no longer applies
    this.coverage.valueChanges.subscribe(() => { this.quote.set(null); this.adjusted.set(''); });
  }

  // sets the min/max rule on the amount from the chosen level
  // when the customer switches level, an amount outside the new range is moved to the nearest limit automatically
  private applyRange(levelId: number, adjust = false) {
    const l = this.data.type.levels.find(x => x.coverageLevelID === levelId);
    let note = '';
    if (adjust && l && this.coverage.value !== null) {
      const amount = Number(this.coverage.value);
      // clamp: below the minimum becomes the minimum, above the maximum becomes the maximum
      const fitted = Math.min(Math.max(amount, l.minCoverage), l.maxCoverage);
      if (fitted !== amount) {
        this.coverage.setValue(fitted);
        note = adjustedNote(fitted, l.maxCoverage, l.levelName);
      }
    }
    this.coverage.setValidators(l
      ? [Validators.required, Validators.min(l.minCoverage), Validators.max(l.maxCoverage)]
      : [Validators.required]);
    this.coverage.updateValueAndValidity();
    // set last: setValue and updateValueAndValidity both fire valueChanges, which clears the note
    this.adjusted.set(note);
  }

  // asks the API what the new choice would cost per month, without changing anything yet
  getQuote() {
    if (this.coverage.invalid) {
      this.coverage.markAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.svc.getQuote({
      policyTypeID: this.data.type.policyTypeID,
      coverageLevelID: this.level.value,
      coverageAmount: this.coverage.value!
    }).subscribe({
      next: q => { this.quote.set(q); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }

  // saves the change through PUT /api/policies/{policyId}/coverage, then closes the dialog with true so the page reloads
  confirm() {
    this.error.set('');
    this.loading.set(true);
    this.svc.changeCoverage(this.data.policy.policyID, this.level.value, this.coverage.value!).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }
}
