/* Policies page: lists the customer's policies, gets a quote for a new one,
and lets them buy or cancel policies.
 All API calls go through PolicyService and QuoteService; buying and cancelling ask for confirmation first. */
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PolicyService } from '../../services/policy.service';
import { QuoteService } from '../../services/quote.service';
import { CreateQuoteRequest, Policy, PolicyType, SavedQuote } from '../../models/policy.models';
import { BuyQuoteDialog } from '../../shared/buy-quote-dialog';
import { ConfirmData, ConfirmDialog } from '../../shared/confirm-dialog';
import { CoverageDialog, adjustedNote } from '../../shared/coverage-dialog';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';

@Component({
  selector: 'app-policies',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, MatCardModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatButtonModule, MatTableModule, MatSlideToggleModule, MatRadioModule],
  templateUrl: './policies.html',
  styleUrl: './policies.scss'
})
export class Policies {
  private svc = inject(PolicyService);
  private quoteSvc = inject(QuoteService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  // the <form> element's directive; resetting through it also clears the "submitted" state, so empty fields don't turn red
  private formDirective = viewChild(FormGroupDirective);

  // page state as signals, so the template updates automatically when they change
  types = signal<PolicyType[]>([]);
  policies = signal<Policy[]>([]);
  quote = signal<SavedQuote | null>(null);   // the quote just requested (it is saved in the database)
  quotes = signal<SavedQuote[]>([]);         // all of the customer's saved quotes
  loading = signal(false);
  error = signal('');
  showOldQuotes = signal(false);  // whether the saved quotes list includes expired and used quotes
  showPast = signal(false);       // whether the table includes cancelled and expired policies
  adjusted = signal('');          // note shown when picking a level moved the amount to fit its range
  statusClass = statusClass;      // exposed so the template can color the status badges
  // which table columns to show, in order (each name matches a matColumnDef in policies.html)
  columns = ['policyID', 'typeName', 'levelName', 'coverageAmount', 'monthlyPremium', 'paymentPlan', 'remaining', 'dates', 'status', 'actions'];

  // saved quotes: only active ones show unless the toggle is on
  quoteColumns = ['quoteID', 'policy', 'coverageAmount', 'monthlyPremium', 'expiry', 'status', 'actions'];
  visibleQuotes = computed(() => this.showOldQuotes() ? this.quotes() : this.quotes().filter(q => q.displayStatus === 'Active'));
  oldQuoteCount = computed(() => this.quotes().filter(q => q.displayStatus !== 'Active').length);

  // the table hides past policies unless the toggle is on; pastCount labels the toggle
  visiblePolicies = computed(() => this.showPast() ? this.policies() : this.policies().filter(p => this.isCurrent(p)));
  pastCount = computed(() => this.policies().filter(p => !this.isCurrent(p)).length);

  // the balance card: what is still left to pay across the customer's current policies, and when the next payment is due
  currentPolicies = computed(() => this.policies().filter(p => this.isCurrent(p)));
  totalRemaining = computed(() => this.currentPolicies().reduce((sum, p) => sum + p.remainingBalance, 0));
  nextDue = computed(() => {
    const dates = this.currentPolicies().map(p => p.nextDueDate).filter((d): d is string => !!d).sort();   // "yyyy-mm-dd" sorts correctly as text
    return dates[0] ?? null;
  });

  form = this.fb.nonNullable.group({
    policyTypeID: new FormControl<number | null>(null, Validators.required),
    // which tier of the product (Liability Only / Full Coverage / ...), chosen with the radio buttons
    coverageLevelID: new FormControl<number | null>(null, Validators.required),
    coverageAmount: new FormControl<number | null>(null, Validators.required)
  });

  // lets the page show the levels of the chosen product, and the coverage range of the chosen level
  private typeId = toSignal(this.form.controls.policyTypeID.valueChanges, { initialValue: null });
  private levelId = toSignal(this.form.controls.coverageLevelID.valueChanges, { initialValue: null });
  selectedType = computed(() => this.types().find(t => t.policyTypeID === this.typeId()) ?? null);
  selectedLevel = computed(() => this.selectedType()?.levels.find(l => l.coverageLevelID === this.levelId()) ?? null);

  constructor() {
    // load the policy type dropdown, the customer's existing policies and their saved quotes when the page opens
    this.svc.getTypes().subscribe(t => this.types.set(t));
    this.loadPolicies();
    this.loadQuotes();

    // levels belong to one product, so picking another product clears the chosen level
    this.form.controls.policyTypeID.valueChanges.subscribe(() => this.form.controls.coverageLevelID.reset(null));

    // each coverage LEVEL has its own range, so the coverage rule changes with the chosen level
    // (clearing the level above lands here with null, which drops back to just "required")
    this.form.controls.coverageLevelID.valueChanges.subscribe(id => {
      const level = this.types().flatMap(t => t.levels).find(l => l.coverageLevelID === id);
      const coverage = this.form.controls.coverageAmount;
      coverage.setValidators(level
        ? [Validators.required, Validators.min(level.minCoverage), Validators.max(level.maxCoverage)]
        : [Validators.required]);
      // an amount already typed that doesn't fit the new level is moved to the nearest limit
      let note = '';
      if (level && coverage.value !== null) {
        const fitted = Math.min(Math.max(coverage.value, level.minCoverage), level.maxCoverage);
        if (fitted !== coverage.value) {
          coverage.setValue(fitted);
          note = adjustedNote(fitted, level.maxCoverage, level.levelName);
        }
      }
      coverage.updateValueAndValidity();
      // set last: setValue and updateValueAndValidity both fire valueChanges, which clears the note
      this.adjusted.set(note);
    });

    // typing a new amount by hand (or the form being reset after a purchase) hides the note
    this.form.controls.coverageAmount.valueChanges.subscribe(() => this.adjusted.set(''));

    // changing anything hides the quote shown under the form (it stays in the saved quotes list)
    this.form.valueChanges.subscribe(() => this.quote.set(null));
  }

  // turns the form values into the body the API expects for a quote (no price: the server works it out)
  private request(): CreateQuoteRequest {
    const v = this.form.getRawValue();
    return { policyTypeID: v.policyTypeID!, coverageLevelID: v.coverageLevelID!, coverageAmount: v.coverageAmount! };
  }

  // fetches the customer's saved quotes; called when the page opens and after getting, buying or removing one
  private loadQuotes() {
    this.quoteSvc.getMine().subscribe({
      next: q => this.quotes.set(q),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
  }

  // fetches the customer's policies; called when the page opens and after buying, changing or cancelling
  private loadPolicies() {
    this.svc.getMine().subscribe({
      next: p => this.policies.set(p),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
  }

  // asks the API for a price; the quote is saved for 30 days and shows below the form and in the saved quotes list
  getQuote() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.quoteSvc.create(this.request()).subscribe({
      next: q => { this.quote.set(q); this.loading.set(false); this.loadQuotes(); },
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }

  // opens the buy pop-up for a saved quote: the customer picks monthly or yearly and confirms.
  // The policy is created from the quote at the quoted price; on success the table and quotes refresh.
  openBuy(q: SavedQuote) {
    this.dialog.open(BuyQuoteDialog, { data: { quote: q }, width: '480px' })
      .afterClosed()
      .subscribe((res: { policyID: number } | false | undefined) => {
        if (!res) return;   // cancelled, or closed without buying
        this.snack.open(`Policy purchased! Your policy number is ${res.policyID}.`, 'OK', { duration: 15000 });
        this.formDirective()?.resetForm();
        this.loadPolicies();
        this.loadQuotes();
      });
  }

  // a quote can be bought while it is active and the customer doesn't already hold that product
  canBuy(q: SavedQuote) {
    return q.displayStatus === 'Active' && !this.heldTypes().has(q.typeName);
  }

  // removes a saved quote from the list (it is kept in the database, just hidden)
  removeQuote(q: SavedQuote) {
    this.confirm({
      title: 'Remove this quote?',
      message: `Quote ${q.quoteID} (${q.typeName}, ${q.levelName}) will be removed from your list.`,
      confirmText: 'Remove'
    }, () => {
      this.quoteSvc.dismiss(q.quoteID).subscribe({
        next: () => this.loadQuotes(),
        error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
      });
    });
  }

  // opens the coverage dialog for this policy; if the change was saved, confirms it and refreshes the table
  changeCoverage(p: Policy) {
    // matched by ID (not name) so the dialog gets the right product and its levels
    const type = this.types().find(t => t.policyTypeID === p.policyTypeID);
    if (!type) return;

    this.dialog.open(CoverageDialog, { data: { policy: p, type }, width: '440px' })
      .afterClosed()
      .subscribe(done => {
        if (done) {
          this.snack.open('Coverage updated.', 'OK', { duration: 8000 });
          this.loadPolicies();
        }
      });
  }

  // names of the policy types the customer currently holds (Active or Pending), disabled in the type dropdown
  heldTypes = computed(() => new Set(this.policies().filter(p => this.isCurrent(p)).map(p => p.typeName)));

  // a policy that is still running (Active or Pending); only these get the Change coverage and Cancel buttons
  isCurrent(p: Policy) {
    return p.displayStatus === 'Active' || p.displayStatus === 'Pending';
  }

  // asks for confirmation, cancels the policy, then refreshes the table
  cancel(p: Policy) {
    this.confirm({
      title: 'Cancel this policy?',
      message: `Policy ${p.policyID} (${p.typeName}, ${p.levelName}) will be cancelled and its remaining unpaid payments will be cancelled too. This cannot be undone.`,
      confirmText: 'Cancel policy'
    }, () => {
      this.svc.cancel(p.policyID).subscribe({
        next: () => {
          this.snack.open('Policy cancelled.', 'OK', { duration: 6000 });
          this.loadPolicies();
        },
        // e.g. "cannot cancel: this policy has an open claim." comes straight from the database
        error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 10000 })
      });
    });
  }

  // opens the shared yes/no dialog and only runs onYes if the customer clicks the confirm button
  private confirm(data: ConfirmData, onYes: () => void) {
    this.dialog.open(ConfirmDialog, { data }).afterClosed().subscribe(ok => { if (ok) onYes(); });
  }
}
