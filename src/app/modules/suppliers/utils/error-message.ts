import { HttpErrorResponse } from '@angular/common/http';

/** Map an HTTP failure to a short, recoverable message for the operator at the counter. */
export function httpErrorMessage(error: unknown, conflictLabel?: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 409 && conflictLabel) {
      return `${conflictLabel} already exists.`;
    }
    if (error.status === 400 || error.status === 422) {
      return 'Some details are invalid. Check the fields and try again.';
    }
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
  }
  return 'Something went wrong. Try again.';
}
