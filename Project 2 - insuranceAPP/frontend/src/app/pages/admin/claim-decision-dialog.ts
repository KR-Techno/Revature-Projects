/* Pop-up for the admin to accept or reject one claim.
 Accepting needs an approved amount (up to what was claimed); rejecting needs a reason. No password is needed for claims. */
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AdminService } from '../../services/admin.service';
import { AdminClaim, ClaimDecision } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';

export interface ClaimDecisionData { claim: AdminClaim; decision: ClaimDecision; }

@Component({
  selector: 'app-claim-decision-dialog',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>{{ approving ? 'Accept' : 'Reject' }} claim {{ data.claim.claimID }}</h2>
      <mat-dialog-content>
        <!-- the claim's details, so the admin can decide without leaving the pop-up -->
        <p class="summary">
          <strong>{{ data.claim.customerName }}</strong><br />
          {{ data.claim.typeName }} · {{ data.claim.levelName }} (policy {{ data.claim.policyID }})<br />
          Incident: {{ data.claim.incidentDate | date:'MM/dd/yyyy' }} · Claimed: {{ data.claim.claimAmount | currency }}
        </p>
        <p class="description">{{ data.claim.claimDescription }}</p>

        @if (approving) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>Approved amount</mat-label>
            <span matTextPrefix>$&nbsp;</span>
            <input matInput type="number" formControlName="approvedAmount" />
            <mat-hint>Up to {{ data.claim.claimAmount | currency }}</mat-hint>
            @if (form.controls.approvedAmount.hasError('required')) {
              <mat-error>Enter the amount to approve</mat-error>
            } @else {
              <mat-error>Must be between $0 and the amount claimed</mat-error>
            }
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ approving ? 'Note to customer (optional)' : 'Reason for rejecting' }}</mat-label>
          <textarea matInput rows="3" maxlength="500" formControlName="decisionNote"></textarea>
          <mat-error>A reason is required when rejecting a claim</mat-error>
        </mat-form-field>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancel</button>
        <button mat-flat-button type="submit" [class.danger-button]="!approving" [disabled]="loading()">
          {{ approving ? 'Accept claim' : 'Reject claim' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .summary { margin-top: 0; }
    .description { font-style: italic; opacity: 0.85; white-space: pre-wrap; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `
})
export class ClaimDecisionDialog {
  data = inject<ClaimDecisionData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ClaimDecisionDialog>);
  private svc = inject(AdminService);

  approving = this.data.decision === 'Approved';
  loading = signal(false);
  error = signal('');

  // approving: amount required (starts at the full claimed amount); rejecting: the reason is required
  form = new FormGroup({
    approvedAmount: new FormControl<number | null>(
      this.approving ? this.data.claim.claimAmount : null,
      this.approving ? [Validators.required, Validators.min(0), Validators.max(this.data.claim.claimAmount)] : []),
    decisionNote: new FormControl('', { nonNullable: true, validators: this.approving ? [] : [Validators.required] })
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    const v = this.form.getRawValue();
    this.svc.decideClaim(this.data.claim.claimID, {
      decision: this.data.decision,
      approvedAmount: this.approving ? v.approvedAmount : null,
      decisionNote: v.decisionNote.trim() || null
    }).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => { this.error.set(apiErrorMessage(err)); this.loading.set(false); }
    });
  }
}