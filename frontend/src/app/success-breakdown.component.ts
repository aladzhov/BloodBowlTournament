import { Component, computed, input } from '@angular/core';
import { ChanceLogEntry } from './puzzle-session.service';

/**
 * Side-panel card listing every action that reduced the solution's success
 * chance, each shown as a fraction (e.g. "5/6"), plus the running total.
 */
@Component({
  selector: 'app-success-breakdown',
  standalone: false,
  templateUrl: './success-breakdown.component.html',
  styleUrl: './success-breakdown.component.css'
})
export class SuccessBreakdownComponent {
  /** Ordered chance-reducing events from the working board. */
  readonly log = input<ChanceLogEntry[]>([]);
  /** Current cumulative success chance as a percentage. */
  readonly percent = input<number>(100);

  /** Each row: the per-action roll as a fraction plus its reason. */
  readonly rows = computed(() =>
    this.log().map((entry) => ({
      reason: entry.reason,
      rollFraction: this.toFraction(entry.factor)
    }))
  );

  /**
   * Render a probability (0..1) as the simplest fraction "n/d" that matches it
   * within a small tolerance, preferring the smallest denominator. Dice odds are
   * multiples of 1/6, 1/36 or 1/216, so a search up to 216 covers them exactly.
   * Falls back to a rounded percentage when no clean fraction is found.
   */
  private toFraction(value: number): string {
    const eps = 1e-6;
    if (value >= 1 - eps) return '1';
    if (value <= eps) return '0';

    for (let den = 2; den <= 216; den++) {
      const num = Math.round(value * den);
      if (num <= 0 || num >= den) continue;
      if (Math.abs(num / den - value) < eps) {
        const g = this.gcd(num, den);
        return `${num / g}/${den / g}`;
      }
    }
    return `${Math.round(value * 1000) / 10}%`;
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }
}

