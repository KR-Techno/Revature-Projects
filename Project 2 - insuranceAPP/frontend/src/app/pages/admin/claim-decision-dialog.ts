/* Pop-up that opens when the admin clicks a claim row. Shows the whole claim (including the full description);
 for an open claim the admin picks Accept or Reject right here. Accepting needs an approved amount (up to what was
 claimed); rejecting needs a reason. A claim that is already decided just shows the outcome. No password is needed for claims. */
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AdminService } from '../../services/admin.service';
import { AdminClaim, ClaimDecision } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';

export interface ClaimDecisionData { claim: AdminClaim; }

@Component({
  selector: 'app-claim-decision-dialog',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule, MatButtonToggleModule,
            MatFormFieldModule, MatInputModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>Claim {{ c.claimID }}</h2>
      <mat-dialog-content>
        <!-- the claim's details, so the admin can decide without leaving the pop-up -->
        <dl class="detail-list">
          <dt>Status</dt><dd><span [class]="statusClass(c.claimStatus)">{{ c.claimStatus }}</span></dd>
          <dt>Customer</dt><dd><strong>{{ c.customerName }}</strong></dd>
          <dt>Policy</dt><dd>{{ c.typeName }} · {{ c.levelName }} (#{{ c.policyID }})</dd>
          <dt>Incident</dt><dd>{{ c.incidentDate | date:'MM/dd/yyyy' }}</dd>
          <dt>Submitted</dt><dd>{{ c.submittedDate | date:'MM/dd/yyyy' }}</dd>
          <dt>Claimed</dt><dd><strong>{{ c.claimAmount | currency }}</strong></dd>
        </dl>
        <!-- the customer's own words about what happened, labelled and boxed so it stands apart from the details -->
        <h3>Description</h3>
        <p class="description">{{ c.claimDescription }}</p>

        @if (!open) {
          <!-- already decided (or withdrawn): show the outcome, nothing to change -->
          <div class="outcome">
            @if (c.claimStatus === 'Approved') {
              <strong>{{ c.approvedAmount | currency }} approved</strong>
            }
            @if (c.resolvedDate) { <div class="cell-sub">Decided {{ c.resolvedDate | date:'MM/dd/yyyy' }}</div> }
            @if (c.decisionNote) { <p>{{ c.decisionNote }}</p> }
          </div>
        } @else {
          <!-- the admin's choice; the fields below change to match it -->
          <h3>Your decision</h3>
          <mat-button-toggle-group [value]="decision()" (change)="choose($event.value)" aria-label="Accept or reject" class="choice">
            <mat-button-toggle value="Approved">Accept</mat-button-toggle>
            <mat-button-toggle value="Denied">Reject</mat-button-toggle>
          </mat-button-toggle-group>

          @if (decision() === 'Approved') {
            <mat-form-field appearance="outline" class="full">
              <mat-label>Approved amount</mat-label>
              <span matTextPrefix>$&nbsp;</span>
              <input matInput type="number" formControlName="approvedAmount" />
              <mat-hint>Up to {{ c.claimAmount | currency }}</mat-hint>
              @if (form.controls.approvedAmount.hasError('required')) {
                <mat-error>Enter the amount to approve</mat-error>
              } @else {
                <mat-error>Must be between $0 and the amount claimed</mat-error>
              }
            </mat-form-field>
          }

          @if (decision()) {
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ decision() === 'Approved' ? 'Note to customer (optional)' : 'Reason for rejecting' }}</mat-label>
              <textarea matInput rows="3" maxlength="500" formControlName="decisionNote"></textarea>
              <mat-error>A reason is required when rejecting a claim</mat-error>
            </mat-form-field>
          }
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">{{ open ? 'Cancel' : 'Close' }}</button>
        @if (open) {
          <button mat-flat-button type="submit" [class.danger-button]="decision() === 'Denied'" [disabled]="loading() || !decision()">
            {{ decision() === 'Denied' ? 'Reject claim' : 'Accept claim' }}
          </button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    /* everything in this pop-up is dark ink (labels included), so the claim is easy to read */
    .detail-list dt, .description, .cell-sub { color: var(--app-ink); }
    h3 { margin: 4px 0 10px; }
    .description { white-space: pre-wrap; background: var(--app-bg); border: 1px solid var(--app-border); border-radius: 12px;
                   padding: 14px 16px; margin: 0 0 20px; }
    .choice { margin-bottom: 20px; }
    .outcome { border-top: 1px solid var(--app-border); padding-top: 14px; }
    .outcome p { margin: 8px 0 0; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class ClaimDecisionDialog {
  data = inject<ClaimDecisionData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ClaimDecisionDialog>);
  private svc = inject(AdminService);

  c = this.data.claim;
  // open = still waiting for a decision, so the accept/reject controls show
  open = this.c.claimStatus === 'Submitted' || this.c.claimStatus === 'Under Review';
  decision = signal<ClaimDecision | null>(null);   // nothing picked until the admin clicks Accept or Reject
  loading = signal(false);
  error = signal('');
  statusClass = statusClass;      // colors the status badge

  // the rules are set by choose(): accepting needs an amount (starts at the full claimed amount), rejecting needs a reason
  form = new FormGroup({
    approvedAmount: new FormControl<number | null>(null),
    decisionNote: new FormControl('', { nonNullable: true })
  });

  // switches the form's rules to match Accept or Reject
  choose(d: ClaimDecision) {
    this.decision.set(d);
    this.error.set('');
    const { approvedAmount, decisionNote } = this.form.controls;
    if (d === 'Approved') {
      approvedAmount.setValidators([Validators.required, Validators.min(0), Validators.max(this.c.claimAmount)]);
      if (approvedAmount.value === null) approvedAmount.setValue(this.c.claimAmount);
      decisionNote.clearValidators();
    } else {
      approvedAmount.clearValidators();
      decisionNote.setValidators([Validators.required]);
    }
    approvedAmount.updateValueAndValidity();
    decisionNote.updateValueAndValidity();
  }

  // saves the decision; closes with it so the page can say "accepted" or "rejected"
  submit() {
    const d = this.decision();
    if (!d) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    const v = this.form.getRawValue();
    this.svc.decideClaim(this.c.claimID, {
      decision: d,
      approvedAmount: d === 'Approved' ? v.approvedAmount : null,
      decisionNote: v.decisionNote.trim() || null
    }).subscribe({
      next: () => this.ref.close(d),
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }
}
