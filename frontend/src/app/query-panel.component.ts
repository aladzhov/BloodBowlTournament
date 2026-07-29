import { Component, computed, effect, input, output, signal } from '@angular/core';
import type { PuzzleQuery } from './puzzles.data';

/**
 * Side-panel card for `query` puzzles: shows the question and collects the
 * solver's answer, either as a single choice from predefined options (radio
 * buttons) or as freeform text. Once answered the card becomes read-only and
 * reveals the accepted answer plus any explanation.
 */
@Component({
  selector: 'app-query-panel',
  standalone: false,
  templateUrl: './query-panel.component.html',
  styleUrl: './query-panel.component.css'
})
export class QueryPanelComponent {
  /** The question for the current puzzle, or null when it is not a query puzzle. */
  readonly query = input<PuzzleQuery | null>(null);
  /** The answer already submitted for this puzzle, or null while unanswered. */
  readonly submittedAnswer = input<string | null>(null);
  /** True once the puzzle has been answered — locks the inputs. */
  readonly answered = input<boolean>(false);
  /** True before the solver presses "Start Solving" — locks the inputs. */
  readonly locked = input<boolean>(false);
  /** Emits the chosen/typed answer when the solver submits. */
  readonly submitAnswer = output<string>();

  /** The current draft answer (radio selection or freeform text). */
  readonly draft = signal('');

  readonly options = computed(() => this.query()?.options ?? []);
  readonly hasOptions = computed(() => this.options().length > 0);

  /** What is shown after answering: the submitted answer, or the draft while editing. */
  readonly displayAnswer = computed(() => this.submittedAnswer() ?? '');

  readonly canSubmit = computed(
    () => !this.answered() && !this.locked() && this.draft().trim().length > 0
  );

  /** The accepted answer(s), revealed once the puzzle has been answered. */
  readonly correctAnswers = computed(() => {
    const answer = this.query()?.answer;
    if (answer === undefined) {
      return [];
    }
    return Array.isArray(answer) ? answer : [answer];
  });

  /**
   * The explanation split into individual lines. Authors may supply an array of
   * lines or a single string containing newlines; blank lines are dropped.
   */
  readonly explanationLines = computed(() => {
    const explanation = this.query()?.explanation;
    if (explanation === undefined) {
      return [];
    }
    const parts = Array.isArray(explanation) ? explanation : [explanation];
    return parts
      .flatMap((part) => part.split('\n'))
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  });

  constructor() {
    // Clear the draft when navigating to another puzzle or after a restart.
    effect(() => {
      this.query();
      if (this.submittedAnswer() === null) {
        this.draft.set('');
      }
    });
  }

  selectOption(option: string): void {
    if (this.answered() || this.locked()) {
      return;
    }
    this.draft.set(option);
  }

  onFreeformInput(value: string): void {
    this.draft.set(value);
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.submitAnswer.emit(this.draft().trim());
  }
}
