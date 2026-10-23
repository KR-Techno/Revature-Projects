/* Shared password validation for the frontend forms, kept in one place so every page uses the same rule.
 Mirrors the API's PasswordRules so the browser catches a weak password before the request is sent. */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// same rule as the API: 8-64 characters with upper, lower, digit and special character
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;

// this field must equal another field in the same form
export const matchesField = (otherName: string): ValidatorFn =>
  (control: AbstractControl): ValidationErrors | null =>
    control.value === control.parent?.get(otherName)?.value ? null : { mismatch: true };
