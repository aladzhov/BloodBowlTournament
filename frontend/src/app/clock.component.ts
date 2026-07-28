import { Component, OnDestroy, computed, signal } from '@angular/core';

type PlayerId = 1 | 2;

/**
 * Chess-like match clock for Blood Bowl, optimised for a phone held between two
 * coaches (the top panel is rotated 180deg so each coach reads their own time).
 *
 * Rules modelled:
 *  - Each coach gets a fresh per-turn allowance. Unused turn time
 *    is discarded when the turn ends (it does NOT add up).
 *  - Each coach has a personal time bank for the whole match (default 7:30). The
 *    bank is only consumed once the per-turn allowance for the active turn hits 0.
 *  - Tapping your own panel ends your turn and starts the opponent's turn with a
 *    fresh per-turn allowance.
 *  - The per-turn and time-bank frames blink during their final seconds.
 */
@Component({
  selector: 'app-clock',
  standalone: false,
  templateUrl: './clock.component.html',
  styleUrl: './clock.component.css'
})
export class ClockComponent implements OnDestroy {
  private static readonly WARN_MS = 15_000;

  readonly phase = signal<'setup' | 'running'>('setup');

  // Setup inputs (bound in the template).
  turnMin = 4;
  turnSec = 0;
  bankMin = 7;
  bankSec = 30;

  private turnMs = this.turnMin * 60_000 + this.turnSec * 1_000;
  private bankMs = this.bankMin * 60_000 + this.bankSec * 1_000;

  readonly p1Turn = signal(0);
  readonly p1Bank = signal(0);
  readonly p2Turn = signal(0);
  readonly p2Bank = signal(0);

  /** Whose clock is currently ticking, or null before the first tap. */
  readonly running = signal<PlayerId | null>(null);
  readonly paused = signal(false);
  readonly flagged = signal<PlayerId | null>(null);

  readonly p1TurnWarn = computed(() => this.turnWarn(1));
  readonly p2TurnWarn = computed(() => this.turnWarn(2));
  readonly p1BankWarn = computed(() => this.bankWarn(1));
  readonly p2BankWarn = computed(() => this.bankWarn(2));

  readonly p1TurnSpent = computed(() => this.turnSpent(1));
  readonly p2TurnSpent = computed(() => this.turnSpent(2));

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  ngOnDestroy(): void {
    this.stopTicking();
  }

  start(): void {
    const turn = this.clampMs(this.turnMin, this.turnSec, this.turnMs);
    const bank = this.clampMs(this.bankMin, this.bankSec, this.bankMs);
    this.turnMs = turn;
    this.bankMs = bank;

    this.p1Turn.set(turn);
    this.p2Turn.set(turn);
    this.p1Bank.set(bank);
    this.p2Bank.set(bank);

    this.running.set(null);
    this.paused.set(false);
    this.flagged.set(null);
    this.phase.set('running');
    this.startTicking();
  }

  /** A coach taps their own panel to end their turn and hand over to the opponent. */
  tapPlayer(player: PlayerId): void {
    const current = this.running();
    // Only the active coach (or nobody yet) may end a turn from their own panel.
    if (current !== null && current !== player) {
      return;
    }
    this.flagged.set(null);
    this.p1Turn.set(this.turnMs);
    this.p2Turn.set(this.turnMs);

    const opponent: PlayerId = player === 1 ? 2 : 1;
    this.running.set(opponent);
    this.paused.set(false);
    this.lastTick = performance.now();
  }

  togglePause(): void {
    if (this.running() === null) {
      return;
    }
    const next = !this.paused();
    this.paused.set(next);
    if (!next) {
      this.lastTick = performance.now();
    }
  }

  reset(): void {
    this.stopTicking();
    this.running.set(null);
    this.paused.set(false);
    this.flagged.set(null);
    this.phase.set('setup');
  }

  format(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private turnWarn(player: PlayerId): boolean {
    const turn = player === 1 ? this.p1Turn() : this.p2Turn();
    return this.running() === player && !this.paused() && turn > 0 && turn <= ClockComponent.WARN_MS;
  }

  private bankWarn(player: PlayerId): boolean {
    const turn = player === 1 ? this.p1Turn() : this.p2Turn();
    const bank = player === 1 ? this.p1Bank() : this.p2Bank();
    return this.running() === player && !this.paused() && turn <= 0 && bank > 0 && bank <= ClockComponent.WARN_MS;
  }

  /** True while the per-turn allowance is exhausted but the bank is still running. */
  private turnSpent(player: PlayerId): boolean {
    const turn = player === 1 ? this.p1Turn() : this.p2Turn();
    const bank = player === 1 ? this.p1Bank() : this.p2Bank();
    return this.running() === player && turn <= 0 && bank > 0;
  }

  private clampMs(min: number, sec: number, fallback: number): number {
    const safeMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
    const safeSec = Number.isFinite(sec) ? Math.max(0, Math.min(59, Math.floor(sec))) : 0;
    const ms = (safeMin * 60 + safeSec) * 1000;
    return ms > 0 ? ms : fallback;
  }

  private startTicking(): void {
    this.stopTicking();
    this.lastTick = performance.now();
    this.intervalId = setInterval(() => this.tick(), 100);
  }

  private stopTicking(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const now = performance.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    const player = this.running();
    if (player === null || this.paused() || this.flagged() !== null) {
      return;
    }

    const turnSignal = player === 1 ? this.p1Turn : this.p2Turn;
    const bankSignal = player === 1 ? this.p1Bank : this.p2Bank;

    if (turnSignal() > 0) {
      turnSignal.set(Math.max(0, turnSignal() - delta));
      return;
    }

    const bank = Math.max(0, bankSignal() - delta);
    bankSignal.set(bank);
    if (bank === 0) {
      this.flagged.set(player);
      this.playTimeUpSound();
    }
  }

  /** A descending, bell-like fantasy flourish when a coach runs out of time. */
  private playTimeUpSound(): void {
    const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtor) {
      return;
    }
    try {
      const ctx = new AudioCtor();
      const now = ctx.currentTime;
      // Descending minor arpeggio with ringing, overlapping bell tails (harp/chime feel).
      const notes = [
        { freq: 440.0, start: 0.0, dur: 0.9 },
        { freq: 349.23, start: 0.18, dur: 1.0 },
        { freq: 293.66, start: 0.36, dur: 1.2 },
        { freq: 193.66, start: 0.54, dur: 1.2 }
      ];
      for (const note of notes) {
        const t0 = now + note.start;
        // Layers: mellow triangle body + soft sine shimmer an octave up.
        const layers = [
          { type: 'triangle' as OscillatorType, mult: 1, level: 0.5 },
          { type: 'sine' as OscillatorType, mult: 2, level: 0.14 },
          { type: 'sine' as OscillatorType, mult: 3, level: 0.06 }
        ];
        for (const layer of layers) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = layer.type;
          osc.frequency.value = note.freq * layer.mult;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(layer.level, t0 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + note.dur + 0.05);
        }
      }
      setTimeout(() => ctx.close(), 2200);
    } catch {
      // Audio is a nice-to-have; ignore failures (e.g. autoplay restrictions).
    }
  }
}
