import { HttpErrorResponse } from '@angular/common/http';

// uppercases the first letter, so "policy not found." shows as "Policy not found."
function capitalize(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// turns whatever the API sent back into one readable sentence
export function apiErrorMessage(err: HttpErrorResponse, fallback = 'Something went wrong. Please try again.'): string {
  const body = err.error;
  if (body?.message) return capitalize(String(body.message));    // our own { message } errors (404, 409, 429...)
  if (body?.errors) {                                            // ASP.NET validation errors (400)
    const first = Object.values(body.errors).flat()[0];
    if (first) return capitalize(String(first));
  }
  if (err.status === 0) return 'Cannot reach the server. Please try again later.';
  return fallback;
}