import { Component, computed, input, output } from '@angular/core';

/**
 * Side-panel card that reveals a puzzle's hints one at a time, in order, when
 * the solver asks. Renders nothing when the puzzle has no hints.
 */
@Component({
  selector: 'app-hints',
  standalone: false,
  templateUrl: './hints.component.html',
  styleUrl: './hints.component.css'
})
export class HintsComponent {
  /** All hints for the puzzle, in order. */
  readonly hints = input<string[]>([]);
  /** How many hints have been revealed so far. */
  readonly revealedCount = input<number>(0);
  /** Emitted when the solver requests the next hint. */
  readonly reveal = output<void>();

  readonly hasHints = computed(() => this.hints().length > 0);
  readonly revealedHints = computed(() => this.hints().slice(0, this.revealedCount()));
  readonly hasMoreHints = computed(() => this.revealedCount() < this.hints().length);

  requestHint(): void {
    this.reveal.emit();
  }
}

