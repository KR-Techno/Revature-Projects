/* Admin claims page: every claim, open ones first. The admin accepts or rejects open claims;
 no password is needed for this. Decided claims are hidden unless the toggle is on. */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminService } from '../../services/admin.service';
import { AdminClaim, ClaimDecision } from '../../models/admin.models';
import { apiErrorMessage } from '../../utils/api-error';
import { statusClass } from '../../utils/status-class';
import { ClaimDecisionDialog, ClaimDecisionData } from './claim-decision-dialog';

@Component({
  selector: 'app-admin-claims',
  imports: [CurrencyPipe, DatePipe, MatTableModule, MatButtonModule, MatSlideToggleModule],
  template: `
    <h1>Claims</h1>

    @if (decidedCount() > 0) {
      <mat-slide-toggle [checked]="showDecided()" (change)="showDecided.set($event.checked)">
        Show decided and withdrawn claims ({{ decidedCount() }})
      </mat-slide-toggle>
    }

    @if (loading()) {
      <p>Loading claims...</p>
    } @else if (visible().length === 0) {
      <p>{{ claims().length === 0 ? 'No claims have been filed yet.' : 'No open claims to review.' }}</p>
    } @else {
      <div class="table-wrap">
        <table mat-table [dataSource]="visible()">
          <ng-container matColumnDef="claimID">
            <th mat-header-cell *matHeaderCellDef>Claim #</th>
            <td mat-cell *matCellDef="let c">{{ c.claimID }}</td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Customer</th>
            <td mat-cell *matCellDef="let c">{{ c.customerName }}</td>
          </ng-container>
          <ng-container matColumnDef="policy">
            <th mat-header-cell *matHeaderCellDef>Policy</th>
            <td mat-cell *matCellDef="let c">{{ c.typeName }} · {{ c.levelName }}</td>
          </ng-container>
          <ng-container matColumnDef="incident">
            <th mat-header-cell *matHeaderCellDef>Incident</th>
            <td mat-cell *matCellDef="let c">{{ c.incidentDate | date:'MM/dd/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>Description</th>
            <td mat-cell *matCellDef="let c"><span class="desc" [title]="c.claimDescription">{{ c.claimDescription }}</span></td>
          </ng-container>
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Claimed</th>
            <td mat-cell *matCellDef="let c">{{ c.claimAmount | currency }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let c"><span [class]="statusClass(c.claimStatus)">{{ c.claimStatus }}</span></td>
          </ng-container>
          <ng-container matColumnDef="decision">
            <th mat-header-cell *matHeaderCellDef>Decision</th>
            <td mat-cell *matCellDef="let c">
              @if (c.claimStatus === 'Approved') {
                {{ c.approvedAmount | currency }} approved
              } @else if (c.decisionNote) {
                <span class="desc" [title]="c.decisionNote">{{ c.decisionNote }}</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c" class="actions">
              @if (isOpen(c)) {
                <button mat-button (click)="decide(c, 'Approved')">Accept</button>
                <button mat-button (click)="decide(c, 'Denied')">Reject</button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    }
  `,
  styles: `
    .table-wrap { overflow-x: auto; }
    .desc { display: inline-block; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
    .actions { white-space: nowrap; }
  `
})
export class AdminClaims {
  private svc = inject(AdminService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  claims = signal<AdminClaim[]>([]);
  loading = signal(true);
  showDecided = signal(false);
  statusClass = statusClass;
  columns = ['claimID', 'customer', 'policy', 'incident', 'description', 'amount', 'status', 'decision', 'actions'];

  // open = still waiting for a decision
  isOpen(c: AdminClaim) { return c.claimStatus === 'Submitted' || c.claimStatus === 'Under Review'; }

  visible = computed(() => this.showDecided() ? this.claims() : this.claims().filter(c => this.isOpen(c)));
  decidedCount = computed(() => this.claims().filter(c => !this.isOpen(c)).length);

  constructor() { this.load(); }

  private load() {
    this.svc.getClaims().subscribe({
      next: c => { this.claims.set(c); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snack.open(apiErrorMessage(err), 'OK', { duration: 8000 });
      }
    });
  }

  // opens the accept/reject pop-up; if the decision was saved, confirms it and refreshes the list
  decide(claim: AdminClaim, decision: ClaimDecision) {
    this.dialog.open(ClaimDecisionDialog, { data: { claim, decision } as ClaimDecisionData, width: '480px' })
      .afterClosed()
      .subscribe(done => {
        if (done) {
          this.snack.open(`Claim ${claim.claimID} ${decision === 'Approved' ? 'accepted' : 'rejected'}.`, 'OK', { duration: 6000 });
          this.load();
        }
      });
  }
}