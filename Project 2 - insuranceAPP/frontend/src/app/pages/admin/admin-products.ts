/* Admin "Policy products" page: lists the products customers can buy today (with how many customers hold each, and a
 pop-up listing those customers), and a form to create a new one
 (for example Disability): name, yearly rate, age factors, and 1-5 coverage levels with descriptions and ranges.
 Creating a product asks for the admin's password. */
import { Component, inject, signal, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { AbstractControl, FormBuilder, FormControl, FormGroupDirective, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminService } from '../../services/admin.service';
import { AdminProductSummary, CreateProductRequest } from '../../models/admin.models';
import { ProductCustomersDialog } from '../../shared/product-customers-dialog';
import { PasswordPromptDialog, PasswordPromptData } from '../../shared/password-prompt-dialog';

// the maximum coverage of a level can't be below its minimum
const validRange = (group: AbstractControl): ValidationErrors | null => {
  const min = group.get('minCoverage')?.value;
  const max = group.get('maxCoverage')?.value;
  return min !== null && max !== null && max < min ? { range: true } : null;
};

@Component({
  selector: 'app-admin-products',
  imports: [ReactiveFormsModule, CurrencyPipe, MatTableModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <div class="page-header">
      <h1>Policy products</h1>
      <p class="page-sub">See what customers can buy today, or create a new product.</p>
    </div>

    <!-- what customers can already buy: each product's level names, how many customers hold it, and a button to see them -->
    <h2 class="first">Available to customers now</h2>
    <div class="table-wrap">
      <table mat-table [dataSource]="products()">
        <!-- each ng-container defines one column: its header (th) and what each row shows (td) -->
        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef>Product</th>
          <td mat-cell *matCellDef="let t"><strong>{{ t.typeName }}</strong></td>
        </ng-container>
        <ng-container matColumnDef="levels">
          <th mat-header-cell *matHeaderCellDef>Coverage levels</th>
          <td mat-cell *matCellDef="let t">{{ t.levels }}</td>
        </ng-container>
        <ng-container matColumnDef="customers">
          <th mat-header-cell *matHeaderCellDef>Customers</th>
          <td mat-cell *matCellDef="let t">{{ t.customers }}</td>
        </ng-container>
        <!-- disabled when nobody holds the product, since the pop-up would be empty -->
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let t" class="actions">
            <button mat-button [disabled]="t.customers === 0" (click)="viewCustomers(t)">View customers</button>
          </td>
        </ng-container>

        <!-- the header row and one row per product, using the column order from "productColumns" below -->
        <tr mat-header-row *matHeaderRowDef="productColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: productColumns"></tr>
      </table>
    </div>

    <h2>Create a new policy product</h2>
    <mat-card>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Product name</mat-label>
            <input matInput formControlName="typeName" maxlength="30" placeholder="For example: Disability" />
            <mat-error>A product name is required</mat-error>
          </mat-form-field>

          <!-- typed as a percent for readability; submit() turns it into the decimal rate the database stores -->
          <mat-form-field appearance="outline" class="full">
            <mat-label>Yearly rate</mat-label>
            <input matInput type="number" step="0.01" formControlName="yearlyRatePercent" />
            <span matTextSuffix>% of coverage per year</span>
            <mat-hint>1 means a $100,000 policy costs $1,000/year before the factors below</mat-hint>
            <mat-error>Enter a rate between 0.01 and 99</mat-error>
          </mat-form-field>

          <p class="section">Age factors (1.00 = normal price, 2.00 = pays double, 0.80 = 20% cheaper)</p>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>Under 25</mat-label>
              <input matInput type="number" step="0.01" formControlName="factorUnder25" />
              <mat-error>0.01 to 99.99</mat-error>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>25 to 64</mat-label>
              <input matInput type="number" step="0.01" formControlName="factor25to64" />
              <mat-error>0.01 to 99.99</mat-error>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>65 and over</mat-label>
              <input matInput type="number" step="0.01" formControlName="factor65plus" />
              <mat-error>0.01 to 99.99</mat-error>
            </mat-form-field>
          </div>

          <!-- one card per coverage level; formArrayName/formGroupName connect each card to levels[i] in the form -->
          <p class="section">Coverage levels (cheapest first, up to 5)</p>
          <div formArrayName="levels">
            @for (level of levels.controls; track level; let i = $index) {
              <mat-card appearance="outlined" class="level" [formGroupName]="i">
                <mat-card-content>
                  <div class="row">
                    <mat-form-field appearance="outline" class="grow">
                      <mat-label>Level name</mat-label>
                      <input matInput formControlName="levelName" maxlength="40" />
                      <mat-error>Required</mat-error>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Price factor</mat-label>
                      <input matInput type="number" step="0.01" formControlName="rateFactor" />
                      <mat-hint>1.00 = standard</mat-hint>
                      <mat-error>0.01 to 9.99</mat-error>
                    </mat-form-field>
                  </div>

                  <mat-form-field appearance="outline" class="full">
                    <mat-label>What the customer gets (plain English)</mat-label>
                    <textarea matInput rows="2" maxlength="400" formControlName="description"></textarea>
                    <mat-error>A description is required</mat-error>
                  </mat-form-field>

                  <div class="row">
                    <mat-form-field appearance="outline">
                      <mat-label>Minimum coverage</mat-label>
                      <span matTextPrefix>$&nbsp;</span>
                      <input matInput type="number" formControlName="minCoverage" />
                      <mat-error>Required</mat-error>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Maximum coverage</mat-label>
                      <span matTextPrefix>$&nbsp;</span>
                      <input matInput type="number" formControlName="maxCoverage" />
                      <mat-error>Required</mat-error>
                    </mat-form-field>
                  </div>
                  <!-- the range check runs on the whole level card, so its message is shown by hand -->
                  @if (level.hasError('range')) {
                    <p class="error">The maximum can't be below the minimum.</p>
                  }

                  <!-- live example so the admin can see what the numbers add up to -->
                  @if (example(i); as price) {
                    <p class="example">Example: about {{ price | currency }}/month at the maximum coverage, for a customer aged 25 to 64.</p>
                  }

                  <!-- a product always keeps at least one level -->
                  @if (levels.length > 1) {
                    <button mat-button type="button" (click)="removeLevel(i)">Remove this level</button>
                  }
                </mat-card-content>
              </mat-card>
            }
          </div>

          @if (levels.length < 5) {
            <button mat-stroked-button type="button" (click)="addLevel()">Add another level</button>
          }

          <div class="submit">
            <button mat-flat-button type="submit">Create product</button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .full { width: 100%; }
    /* fields side by side, wrapping onto new lines on narrow screens */
    .row { display: flex; flex-wrap: wrap; gap: 16px; }
    .grow { flex: 1 1 220px; }
    .section { margin: 24px 0 12px; font-weight: 700; }
    .level { margin-bottom: 16px; background: var(--app-bg); }
    h2.first { margin-top: 0; }
    .actions { white-space: nowrap; text-align: right; }
    .example { color: var(--app-muted); font-size: 0.9rem; }
    .error { color: var(--mat-sys-error); margin: 0 0 8px; }
    .submit { margin-top: 28px; }
    .submit button { height: 46px; padding: 0 28px; }
  `
})
export class AdminProducts {
  private fb = inject(FormBuilder);
  private svc = inject(AdminService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  // resetting through the form directive also clears the "submitted" state, so empty fields don't turn red after a successful create
  private formDirective = viewChild(FormGroupDirective);

  products = signal<AdminProductSummary[]>([]);   // the products customers can buy, with how many customers hold each
  // which product table columns to show, in order (each name matches a matColumnDef above)
  productColumns = ['typeName', 'levels', 'customers', 'actions'];

  // a fresh, empty coverage level card (price factor starts at 1.00 = standard)
  private newLevel() {
    return this.fb.nonNullable.group({
      levelName: ['', [Validators.required, Validators.maxLength(40)]],
      description: ['', [Validators.required, Validators.maxLength(400)]],
      rateFactor: [1, [Validators.required, Validators.min(0.01), Validators.max(9.99)]],
      minCoverage: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
      maxCoverage: new FormControl<number | null>(null, [Validators.required, Validators.min(1)])
    }, { validators: validRange });
  }

  // the list of level cards; the form starts with one
  levels = this.fb.array([this.newLevel()]);

  // the product's own fields, with the levels array nested inside; age factors start at 1.00 (normal price)
  form = this.fb.nonNullable.group({
    typeName: ['', [Validators.required, Validators.maxLength(30)]],
    yearlyRatePercent: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(99)]),
    factorUnder25: [1, [Validators.required, Validators.min(0.01), Validators.max(99.99)]],
    factor25to64: [1, [Validators.required, Validators.min(0.01), Validators.max(99.99)]],
    factor65plus: [1, [Validators.required, Validators.min(0.01), Validators.max(99.99)]],
    levels: this.levels
  });

  constructor() { this.loadProducts(); }

  // fetches the product list (level names come pre-joined from SQL, e.g. "Liability Only, Full Coverage");
  // called when the page opens and after a new product is created
  private loadProducts() {
    this.svc.getProducts().subscribe(p => this.products.set(p));
  }

  // opens the list of customers who currently hold this product
  viewCustomers(t: AdminProductSummary) {
    this.dialog.open(ProductCustomersDialog, { data: { policyTypeID: t.policyTypeID, typeName: t.typeName }, width: '960px', maxWidth: '95vw' });
  }

  addLevel() { if (this.levels.length < 5) this.levels.push(this.newLevel()); }
  removeLevel(i: number) { if (this.levels.length > 1) this.levels.removeAt(i); }

  // monthly price at the level's maximum coverage for a customer aged 25-64 (null until the needed fields are filled in)
  example(i: number): number | null {
    const rate = this.form.controls.yearlyRatePercent.value;
    const level = this.levels.at(i).getRawValue();
    const factor = this.form.controls.factor25to64.value;
    if (rate === null || level.maxCoverage === null || !level.rateFactor || !factor) return null;
    return Math.round(level.maxCoverage * (rate / 100) * factor * level.rateFactor / 12 * 100) / 100;
  }

  // checks the form, then asks for the admin's password before creating anything
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    // builds the request once the password is known (the prompt passes it in)
    const body = (password: string): CreateProductRequest => ({
      password,
      typeName: v.typeName.trim(),
      baseRate: Math.round(v.yearlyRatePercent! * 100) / 10000,   // percent to a yearly decimal rate, 4 decimals
      factorUnder25: v.factorUnder25,
      factor25to64: v.factor25to64,
      factor65plus: v.factor65plus,
      levels: v.levels.map(l => ({
        levelName: l.levelName.trim(),
        description: l.description.trim(),
        rateFactor: l.rateFactor,
        minCoverage: l.minCoverage!,
        maxCoverage: l.maxCoverage!
      }))
    });

    const data: PasswordPromptData = {
      title: 'Create this product?',
      message: `${v.typeName.trim()} will be available to every customer right away. Enter your admin password to continue.`,
      confirmText: 'Create product',
      action: pw => this.svc.createProduct(body(pw))
    };

    // the prompt sends the request itself; a wrong password shows inside it and keeps it open
    this.dialog.open(PasswordPromptDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe(done => {
        if (!done) return;
        this.snack.open(`${v.typeName.trim()} created and now available to customers.`, 'OK', { duration: 8000 });
        // back to one empty level, then reset through the directive so nothing shows red
        this.levels.clear();
        this.levels.push(this.newLevel());
        this.formDirective()?.resetForm({ typeName: '', yearlyRatePercent: null, factorUnder25: 1, factor25to64: 1, factor65plus: 1 });
        this.loadProducts();
      });
  }
}
