/* Payments page: lists the customer's payments, warns about overdue ones, and lets them pay the next one due.
 All API calls go through PaymentService; paying asks for confirmation first. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PaymentService } from '../../services/payment.service';
import { Payment } from '../../models/payment.models';
import { ConfirmData, ConfirmDialog } from '../../shared/confirm-dialog';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';

@Component({
  selector: 'app-payments',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonModule, MatSlideToggleModule],
  templateUrl: './payments.html',
  styleUrl: './payments.scss'
})
export class Payments {
  private svc = inject(PaymentService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // page state as signals, so the template updates automatically when they change
  payments = signal<Payment[]>([]);
  loading = signal(false);
  showCancelled = signal(false);  // whether the table includes cancelled payments
  statusClass = statusClass;      // exposed so the template can color the status badges
  // which table columns to show, in order (each name matches a matColumnDef in payments.html)
  columns = ['policy', 'dueDate', 'amount', 'lateFee', 'total', 'status', 'paidDate', 'actions'];

  // cancelled payments are hidden by default; paid ones stay (they are the customer's receipts)
  visiblePayments = computed(() =>
    this.showCancelled() ? this.payments() : this.payments().filter(p => p.paymentStatus !== 'Cancelled'));
  cancelledCount = computed(() => this.payments().filter(p => p.paymentStatus === 'Cancelled').length);

  // overdue payments and their combined total, used by the alert banner at the top of the page
  overdue = computed(() => this.payments().filter(p => p.displayStatus === 'Overdue'));
  overdueTotal = computed(() => this.overdue().reduce((sum, p) => sum + p.totalAmount, 0));

  // paying always settles the OLDEST unpaid payment of a policy (that is how pay_Payment works),
  // so only that one row gets a Pay button
  private payableIds = computed(() => {
    const oldest = new Map<number, Payment>();
    for (const p of this.payments()) {
      if (p.paymentStatus !== 'Pending') continue;
      const current = oldest.get(p.policyID);
      if (!current || p.dueDate < current.dueDate) oldest.set(p.policyID, p);
    }
    return new Set([...oldest.values()].map(p => p.paymentID));
  });

  canPay(p: Payment) { return this.payableIds().has(p.paymentID); }

  constructor() {
    this.load();
  }

  // fetches the customer's payments; called when the page opens and again after each payment
  private load() {
    this.svc.getMine().subscribe({
      next: p => this.payments.set(p),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
  }

  // confirms the amount (mentioning any late fee), then pays and reloads the table to show it as Paid
  pay(p: Payment) {
    const fee = p.lateFee > 0 ? ` This includes a $${p.lateFee.toFixed(2)} late fee.` : '';
    this.confirm({
      title: 'Make this payment?',
      message: `Pay $${p.totalAmount.toFixed(2)} for ${p.typeName} policy ${p.policyID}, due ${p.dueDate}.${fee}`,
      confirmText: 'Pay now'
    }, () => {
      this.loading.set(true);
      this.svc.pay(p.policyID).subscribe({
        next: r => {
          this.snack.open(`Payment received: $${r.totalCharged.toFixed(2)}.`, 'OK', { duration: 8000 });
          this.loading.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.snack.open(apiErrorMessage(err), 'OK', { duration: 10000 });
          this.loading.set(false);
        }
      });
    });
  }

  // opens the shared yes/no dialog and only runs onYes if the customer clicks the confirm button
  private confirm(data: ConfirmData, onYes: () => void) {
    this.dialog.open(ConfirmDialog, { data }).afterClosed().subscribe(ok => { if (ok) onYes(); });
  }
}