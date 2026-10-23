/* Payments page: shows when the next payment is due and what is left to pay on monthly plans, lists the customer's
 payments, warns about overdue ones, and lets them pay the next one due.
 API calls go through PaymentService (and PolicyService for the balances); paying asks for confirmation first. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PaymentService } from '../../services/payment.service';
import { PolicyService } from '../../services/policy.service';
import { Payment } from '../../models/payment.models';
import { Policy } from '../../models/policy.models';
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
  private policySvc = inject(PolicyService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // page state as signals, so the template updates automatically when they change
  payments = signal<Payment[]>([]);
  policies = signal<Policy[]>([]);   // only used for the "left to pay" summary (remaining balance per policy)
  loading = signal(false);
  showCancelled = signal(false);  // whether the table includes cancelled payments
  statusClass = statusClass;      // exposed so the template can color the status badges
  // which table columns to show, in order (each name matches a matColumnDef in payments.html)
  columns = ['policy', 'dueDate', 'amount', 'lateFee', 'total', 'status', 'paidDate', 'confirmation', 'actions'];

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

  // the unpaid payment with the earliest due date (it can be overdue), shown in the "Next payment due" tile
  nextPayment = computed(() => {
    const unpaid = this.payments().filter(p => p.paymentStatus === 'Pending');
    return unpaid.length ? unpaid.reduce((a, b) => (a.dueDate <= b.dueDate ? a : b)) : null;
  });

  // "in 5 days", "today" or "3 days overdue" under the next payment's date
  dueCountdown = computed(() => {
    const n = this.nextPayment();
    if (!n) return '';
    const [y, m, d] = n.dueDate.split('-').map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
    if (days === 0) return 'Due today';
    if (days > 0) return `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
    return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  });

  // current (Active or Pending) policies paid monthly, each with how many payments are still unpaid and what is
  // left to pay. The policy's remainingBalance doesn't count late fees, so the fees on its unpaid payments are added on top.
  monthlyPlans = computed(() => this.policies()
    .filter(p => p.paymentPlan === 'Monthly' && (p.displayStatus === 'Active' || p.displayStatus === 'Pending'))
    .map(p => {
      const unpaid = this.payments().filter(x => x.policyID === p.policyID && x.paymentStatus === 'Pending');
      const lateFees = unpaid.reduce((sum, x) => sum + x.lateFee, 0);
      return {
        policy: p,
        paymentsLeft: unpaid.length,
        lateFees,
        leftToPay: p.remainingBalance + lateFees,
        percentPaid: p.policyTotal > 0 ? Math.round(p.paidSoFar / p.policyTotal * 100) : 0
      };
    }));
  // the headline "left to pay" number across all monthly plans, late fees included
  monthlyRemaining = computed(() => this.monthlyPlans().reduce((sum, m) => sum + m.leftToPay, 0));
  monthlyLateFees = computed(() => this.monthlyPlans().reduce((sum, m) => sum + m.lateFees, 0));

  constructor() {
    this.load();
  }

  // fetches the customer's payments and policies; called when the page opens and again after each payment
  // (paying lowers the policy's remaining balance, so both lists are refreshed)
  private load() {
    this.svc.getMine().subscribe({
      next: p => this.payments.set(p),
      error: (err: HttpErrorResponse) => this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 })
    });
    this.policySvc.getMine().subscribe({
      next: p => this.policies.set(p),
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