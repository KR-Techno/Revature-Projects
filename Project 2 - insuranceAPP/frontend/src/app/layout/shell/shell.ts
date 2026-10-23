/* Shell layout for the logged-in pages: the toolbar with navigation links and the account avatar stays on screen,
 while the current page loads inside the <router-outlet>. AuthService and CurrentUserService are injected for the account menu. */
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth.service';
import { CurrentUserService } from '../../services/current-user.service';

// dark enough that white initials stay readable
const AVATAR_COLORS = ['#1565c0', '#2e7d32', '#6a1b9a', '#c62828', '#d84315', '#00838f', '#ad1457', '#37474f'];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule,
            MatMenuModule, MatIconModule, MatDividerModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss'
})
export class Shell {
  auth = inject(AuthService);
  user = inject(CurrentUserService);

  // "Maria Garcia" becomes "MG"
  initials = computed(() => {
    const me = this.user.me();
    return me ? (me.firstName.charAt(0) + me.lastName.charAt(0)).toUpperCase() : '';
  });

  // picks a color from the customer ID, so each customer always gets the same avatar color
  avatarColor = computed(() => {
    const me = this.user.me();
    return me ? AVATAR_COLORS[me.customerID % AVATAR_COLORS.length] : 'var(--mat-sys-primary)';
  });

  constructor() {
    // the shell is created on each login, so this loads the right customer's name for the avatar
    this.user.load();
  }
}
