/* The DucklingInsurance logo next to the app's name, used on the welcome (login) screen, the register page and the toolbar.
 size="large" is the big welcome-screen version; the default is the compact toolbar version. */
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  template: `
    <span class="brand-mark" [class.large]="size() === 'large'">
      <!-- the logo file lives in /public, so it is served from the site root -->
      <img src="duckling-insurance-logo.png" alt="" class="logo" />
      <span class="name">Duckling<span class="name-accent">Insurance</span></span>
    </span>
  `,
  styles: `
    .brand-mark { display: inline-flex; align-items: center; gap: 12px; }
    .logo { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .name { font-family: Nunito, sans-serif; font-weight: 800; font-size: 1.25rem; letter-spacing: -0.01em; color: inherit; }
    /* "Insurance" is a touch lighter so the two words read separately without a second color */
    .name-accent { font-weight: 600; }
    /* welcome-screen size */
    .large { gap: 18px; }
    .large .logo { width: 84px; height: 84px; border-radius: 20px; box-shadow: 0 8px 20px rgba(229, 88, 18, 0.18); }
    .large .name { font-size: 2.2rem; }
  `
})
export class BrandMark {
  size = input<'normal' | 'large'>('normal');
}
