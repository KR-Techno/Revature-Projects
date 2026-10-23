/* Shows the admin a customer's new temporary password ONCE (it is never stored in readable form or shown again).
 The admin gives it to the customer, who must choose a new password at their next login. */
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

// what the admin page passes in: whose password it is, and the password itself
export interface TempPasswordData { name: string; password: string; }

@Component({
  selector: 'app-temp-password-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Temporary password for {{ data.name }}</h2>
    <mat-dialog-content>
      <!-- user-select: all lets one click select the whole password -->
      <p class="code">{{ data.password }}</p>
      <p class="note">This is the only time it will be shown. Give it to the customer; they will be asked to choose a new password when they log in.</p>
      @if (copied()) {
        <p class="note">Copied to clipboard.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="copy()">Copy</button>
      <button mat-flat-button mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
  styles: `
    /* large monospace box so look-alike characters are easy to tell apart */
    .code { font-family: monospace; font-size: 1.4rem; letter-spacing: 1px; padding: 12px; border-radius: 8px;
            background: var(--mat-sys-surface-container-high); text-align: center; user-select: all; }
    .note { opacity: 0.8; font-size: 0.9rem; }
  `
})
export class TempPasswordDialog {
  data = inject<TempPasswordData>(MAT_DIALOG_DATA);   // passed in by dialog.open()
  copied = signal(false);                             // shows "Copied to clipboard." after a successful copy

  // copies the password; if the browser blocks clipboard access, nothing happens and the admin can copy it by hand
  copy() {
    navigator.clipboard.writeText(this.data.password).then(() => this.copied.set(true), () => {});
  }
}
