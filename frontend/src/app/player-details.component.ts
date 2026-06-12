import { Component, input } from '@angular/core';
import { WorkingPlayer } from './puzzle-session.service';

/**
 * Side-panel card showing the hovered player's name, status tags,
 * characteristics and skills. Purely presentational — the hovered player is
 * supplied by the parent.
 */
@Component({
  selector: 'app-player-details',
  standalone: false,
  templateUrl: './player-details.component.html',
  styleUrl: './player-details.component.css'
})
export class PlayerDetailsComponent {
  /** The player to display, or null when nothing is hovered. */
  readonly player = input<WorkingPlayer | null>(null);
}

