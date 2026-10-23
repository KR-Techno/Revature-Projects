/* CurrentUserService loads the logged-in customer's profile once and keeps it in a shared signal.
 Provided in root through Dependency Injection, so the toolbar avatar and the profile page see the same data. */
import { Injectable, inject, signal } from '@angular/core';
import { CustomerService } from './customer.service';
import { Customer } from '../models/customer.models';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private customers = inject(CustomerService);

  // the current customer, or null while loading (anything reading it updates automatically)
  me = signal<Customer | null>(null);

  // fetches the profile; called by the shell each time a customer logs in
  load() {
    this.me.set(null);     // never show the previous person's name while the new one loads
    this.customers.getMe().subscribe({
      next: c => this.me.set(c),
      error: () => {}      // a 401 is already handled by the interceptor
    });
  }
}
