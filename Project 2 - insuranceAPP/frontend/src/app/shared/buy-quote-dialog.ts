/* Pop-up for buying a policy from a saved quote: the customer picks monthly or yearly payments and confirms.
 Closes with { policyID } on success; any API error (e.g. the quote expired) shows inside the dialog. */
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { QuoteService } from '../services/quote.service';
import { PaymentPlan, SavedQuote } from '../models/policy.models';
import { apiErrorMessage } from '../utils/api-error';

// what the opening page passes in: the saved quote being bought
export interface BuyQuoteData { quote: SavedQuote; }

@Component({
  selector: 'app-buy-quote-dialog',
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Buy this policy?</h2>
    <mat-dialog-content>
      <!-- a summary of what is being bought, and how long the quoted price is held -->
      <p>
        <strong>{{ data.quote.typeName }} · {{ data.quote.levelName }}</strong><br />
        {{ data.quote.coverageAmount | currency }} coverage for 12 months<br />
        Quote #{{ data.quote.quoteID }}, price locked until {{ data.quote.expiryDate | date:'MM/dd/yyyy' }}
      </p>

      <!-- choose how to pay: 12 monthly payments, or one yearly payment that costs less -->
      <mat-radio-group class="plans" [value]="plan()" (change)="plan.set($event.value)" aria-label="Payment plan">
        <mat-radio-button value="Monthly" class="plan">
          <strong>Pay monthly</strong>
          <span class="plan-desc">{{ data.quote.monthlyPremium | currency }} a month for 12 months ({{ data.quote.yearlyTotal | currency }} total)</span>
        </mat-radio-button>
        <mat-radio-button value="Yearly" class="plan">
          <strong>Pay yearly</strong>
          <!-- the saving is the difference between the 12 monthly payments and the one-time price -->
          <span class="plan-desc">{{ data.quote.yearlyDiscountedTotal | currency }} once. You save {{ (data.quote.yearlyTotal - data.quote.yearlyDiscountedTotal) | currency }}</span>
        </mat-radio-button>
      </mat-radio-group>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button [disabled]="loading()" (click)="buy()">Buy policy</button>
    </mat-dialog-actions>
  `,
  styles: `
    /* plan radio buttons stacked, each with a smaller description under its name */
    .plans { display: flex; flex-direction: column; margin: 8px 0; }
    .plan { margin-bottom: 4px; }
    .plan-desc { display: block; font-size: 0.85rem; opacity: 0.8; white-space: normal; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class BuyQuoteDialog {
  data = inject<BuyQuoteData>(MAT_DIALOG_DATA);          // the quote passed in by dialog.open()
  private ref = inject(MatDialogRef<BuyQuoteDialog>);    // used to close the dialog and send back the new policy ID
  private quotes = inject(QuoteService);

  // dialog state as signals, so the template updates automatically when they change
  plan = signal<PaymentPlan>('Monthly');   // monthly is the default choice
  loading = signal(false);
  error = signal('');

  // creates the policy from the quote; stays open on failure so the message can be read
  buy() {
    this.error.set('');
    this.loading.set(true);
    this.quotes.buy(this.data.quote.quoteID, this.plan()).subscribe({
      next: res => this.ref.close({ policyID: res.policyID }),
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }
}
