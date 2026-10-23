/* Runs on every HTTP request the app makes:
 attaches the customer's JWT token as an "Authorization: Bearer" header
 on calls to our API,
 and logs the customer out automatically if the API says their session has expired (401). */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApiCall = req.url.startsWith(environment.apiUrl);

  // only our own API ever receives the token
  if (isApiCall && auth.token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 on a normal call = expired/invalid session. Login/register 401s are just "wrong password", so skip those.
      if (err.status === 401 && isApiCall && !req.url.includes('/auth/')) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};