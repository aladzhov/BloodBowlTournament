import { Component, computed, effect, inject, OnDestroy, output, signal } from '@angular/core';
import type { Puzzle } from './puzzles.data';
import { PuzzleLoaderService } from './puzzle-loader.service';
import { PuzzleSessionService, WorkingPlayer } from './puzzle-session.service';
import { ActionId, BoardCell, PushDirection, PuzzleEngineService } from './puzzle-engine.service';

interface PushState {
  dir: PushDirection;
  frames: { playerId: string; x: number; y: number }[];
  currentId: string;
  blockChance: number;
  attackerId: string;
  defenderX: number;
  defenderY: number;
  /** ID of the first defender targeted (for knockdown / prone marking). */
  firstDefenderId: string;
  /** Whether the result knocks the defender prone (Stumble+ or Pow). */
  knocksDown: boolean;
  /** Whether a "Prone in Place" option should be offered (Both Down in selection). */
  allowProneInPlace: boolean;
  /** When true only Prone in Place is available — no push squares (BD-only selection). */
  proneInPlaceOnly: boolean;
}

interface FollowUpState {
  attackerId: string;
  followUpX: number;
  followUpY: number;
  pendingMoves: { playerId: string; x: number; y: number }[];
  blockChance: number;
  firstDefenderId: string;
  knocksDown: boolean;
  /** Player pushed off the pitch — will be removed when follow-up resolves. */
  removePlayerId: string | null;
}

@Component({
  selector: 'app-puzzles-tab',
  standalone: false,
  templateUrl: './puzzles-tab.component.html',
  styleUrl: './puzzles-tab.component.css'
})
export class PuzzlesTabComponent implements OnDestroy {
  private readonly sessionService = inject(PuzzleSessionService);
  private readonly engine = inject(PuzzleEngineService);
  private readonly loaderService = inject(PuzzleLoaderService);

  /** Emits the date string whenever the user navigates to a different puzzle. */
  readonly puzzleDateChange = output<string>();

  /** Sorted, visible puzzles loaded from /puzzles/. Empty until HTTP completes. */
  readonly puzzles = this.loaderService.puzzles;

  readonly touchdownLetters = 'TOUCHDOWN'.split('');

  readonly currentIndex = signal(0);
  readonly hoveredPlayer = signal<WorkingPlayer | null>(null);

  /** The player targeted for an action menu (opponent or friendly). */
  readonly actionTarget = signal<WorkingPlayer | null>(null);

  /** True while the block result sub-menu (Push Back / Stumble / Pow / Both Down) is showing. */
  readonly blockStage = signal(false);

  /** Which block result options the user has toggled on. */
  readonly selectedBlockResults = signal<ActionId[]>([]);

  /** Combined probability for the currently selected block results (null when none selected). */
  readonly blockCombinedChance = computed<number | null>(() => {
    if (!this.blockStage()) return null;
    const selected = this.selectedBlockResults();
    if (selected.length === 0) return null;
    const attacker = this.selectedPlayer();
    const target = this.actionTarget();
    if (!attacker || !target) return null;
    return this.engine.blockProbabilityMulti(this.working(), attacker, target, selected);
  });

  /** Active while the user is choosing where a blocked player is pushed. */
  readonly pushState = signal<PushState | null>(null);
  readonly pushing = computed(() => this.pushState() !== null);

  /** Active after a push resolves, waiting for Follow Up / Stay choice. */
  readonly followUpState = signal<FollowUpState | null>(null);
  readonly followingUp = computed(() => this.followUpState() !== null);

  readonly current = computed<Puzzle>(() => {
    const ps = this.puzzles();
    return ps[this.currentIndex()] ?? ps[0];
  });

  readonly working = computed(() =>
    this.sessionService.board(this.current().date, this.current().data, this.current().type ?? 'score')()
  );

  readonly selectedPlayer = computed(() => {
    const board = this.working();
    return board.players.find((p) => p.id === board.selectedPlayerId) ?? null;
  });

  /** The pushback squares offered for the player currently being pushed. */
  readonly pushTargets = computed(() => {
    const state = this.pushState();
    if (!state || state.proneInPlaceOnly) {
      return [];
    }
    const board = this.working();
    const current = board.players.find((p) => p.id === state.currentId);
    if (!current) {
      return [];
    }
    return this.engine.pushOptions(board, current.x, current.y, state.dir);
  });

  private readonly pushTargetKeys = computed(
    () => new Set(this.pushTargets().map((s) => `${s.x},${s.y}`))
  );

  /** Name of the player currently being pushed (for the prompt). */
  readonly pushPlayerName = computed(() => {
    const state = this.pushState();
    if (!state) {
      return '';
    }
    return this.working().players.find((p) => p.id === state.currentId)?.name ?? '';
  });

  /** True when the player being pushed can be sent off the pitch. */
  readonly pushOutOfBoundsAvailable = computed(() => {
    const state = this.pushState();
    if (!state) return false;
    const board = this.working();
    const current = board.players.find((p) => p.id === state.currentId);
    if (!current) return false;
    return this.engine.hasPushOutOfBounds(board, current.x, current.y, state.dir);
  });

  readonly actionTitle = computed(() => {
    const target = this.actionTarget();
    if (!target) {
      return '';
    }
    const base = this.engine.actionTitle(target);
    return this.blockStage() ? `Block ${base}` : base;
  });

  readonly actionOptions = computed(() => {
    const target = this.actionTarget();
    if (!target) {
      return [];
    }
    if (this.blockStage()) {
      return this.engine.blockOptions(this.selectedPlayer(), target);
    }
    return this.engine.actionOptions(this.working(), this.selectedPlayer(), target);
  });

  private readonly session = computed(() =>
    this.sessionService.sessionState(this.current().date)()
  );

  readonly revealed = computed(() => this.session().started);
  readonly solved = computed(() => this.session().solved);

  readonly timerDisplay = computed(() => {
    const total = this.session().elapsed;
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  readonly hasPrevious = computed(() => this.currentIndex() > 0);
  readonly hasNext = computed(() => this.currentIndex() < this.puzzles().length - 1);

  readonly formattedDate = computed(() =>
    new Date(this.current().date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  );

  readonly objectiveLabel = computed(() => {
    switch (this.current().type ?? 'score') {
      case 'surf':  return 'Surf a player';
      case 'sack':  return 'Sack the ball';
      case 'score':
      default:      return 'Score a touchdown';
    }
  });

  readonly gridTemplateColumns = computed(() => `repeat(${this.working().cols}, 1fr)`);

  /** Current cumulative success chance as a rounded percentage. */
  readonly chancePercent = computed(() => Math.round(this.working().successChance * 1000) / 10);
  readonly targetScore = computed(() => this.working().targetScore);
  /** True when the solved chance is below the target (the solver could do better). */
  readonly canDoBetter = computed(() => this.chancePercent() < this.targetScore());
  /** True when the solved chance exceeds the target by 1 or more (wrong path taken). */
  readonly isIncorrectSolution = computed(() => this.chancePercent() >= this.targetScore() + 1);

  readonly cells = computed<BoardCell[]>(() => this.engine.buildCells(this.working()));

  private puzzlesInitialized = false;

  constructor() {
    // Run initial navigation once puzzles are loaded from the server.
    effect(() => {
      const loaded = this.puzzles();
      if (loaded.length === 0 || this.puzzlesInitialized) return;
      this.puzzlesInitialized = true;

      const lastViewedKey = this.sessionService.getLastViewedKey();
      const lastViewedIndex = lastViewedKey
        ? loaded.findIndex((p) => p.date === lastViewedKey)
        : -1;
      const initialIndex = lastViewedIndex >= 0 ? lastViewedIndex : loaded.length - 1;

      this.currentIndex.set(initialIndex);
      this.sessionService.setLastViewedKey(loaded[initialIndex].date);
      this.sessionService.setDisplayed(loaded[initialIndex].date);
      this.puzzleDateChange.emit(loaded[initialIndex].date);
    });
  }

  goTo(index: number): void {
    if (index < 0 || index >= this.puzzles().length) {
      return;
    }
    this.currentIndex.set(index);
    this.hoveredPlayer.set(null);
    this.closeMenu();
    this.sessionService.setLastViewedKey(this.current().date);
    this.sessionService.setDisplayed(this.current().date);
    this.puzzleDateChange.emit(this.current().date);
  }

  previous(): void {
    this.goTo(this.currentIndex() - 1);
  }

  next(): void {
    this.goTo(this.currentIndex() + 1);
  }

  startSolving(): void {
    this.sessionService.start(this.current().date);
  }

  restart(): void {
    this.hoveredPlayer.set(null);
    this.closeMenu();
    this.sessionService.resetBoard(this.current().date, this.current().data, this.current().type ?? 'score');
  }

  onCellClick(cell: BoardCell): void {
    if (!this.revealed() || this.solved()) {
      return;
    }

    // While resolving a block push, clicks pick a pushback square.
    if (this.pushing()) {
      this.onPushSquareChosen(cell);
      return;
    }

    const key = this.current().date;
    const data = this.current().data;
    const outcome = this.engine.resolveCellClick(this.working(), cell, this.selectedPlayer());

    switch (outcome.type) {
      case 'select':
        this.closeMenu();
        this.sessionService.selectPlayer(key, data, outcome.playerId);
        break;
      case 'menu':
        this.blockStage.set(false);
        this.actionTarget.set(outcome.target);
        break;
      case 'move':
        this.closeMenu();
        this.sessionService.moveSelectedTo(key, data, outcome.x, outcome.y);
        break;
      case 'none':
        break;
    }
  }

  runAction(id: ActionId): void {
    // Choosing Block opens the block-result sub-menu and clears any prior selection.
    if (id === 'block') {
      this.blockStage.set(true);
      this.selectedBlockResults.set([]);
      return;
    }

    // While in the block sub-menu, options are toggles — not immediate actions.
    if (this.blockStage()) {
      const current = this.selectedBlockResults();
      const alreadySelected = current.includes(id);
      this.selectedBlockResults.set(
        alreadySelected ? current.filter(r => r !== id) : [...current, id]
      );
      return;
    }

    const target = this.actionTarget();

    if (id === 'activate') {
      this.activateTargetPlayer();
    } else if (id === 'pass' && target) {
      this.sessionService.passBallTo(this.current().date, this.current().data, target.id);
    } else if (id === 'handoff' && target) {
      this.sessionService.handOffTo(this.current().date, this.current().data, target.id);
    }
    // TODO: resolve jump / throw mechanics once defined.
    this.closeMenu();
  }

  isPushTarget(cell: BoardCell): boolean {
    return this.pushing() && this.pushTargetKeys().has(`${cell.x},${cell.y}`);
  }

  /** Push the current player off the pitch — removes them from the board. */
  pushOutOfBounds(): void {
    const state = this.pushState();
    if (!state) return;

    const moves = [...state.frames].reverse();
    this.pushState.set(null);
    this.actionTarget.set(null);
    this.blockStage.set(false);
    this.followUpState.set({
      attackerId: state.attackerId,
      followUpX: state.defenderX,
      followUpY: state.defenderY,
      pendingMoves: moves,
      blockChance: state.blockChance,
      firstDefenderId: state.firstDefenderId,
      knocksDown: state.knocksDown,
      removePlayerId: state.currentId
    });
  }

  /** Confirm the multi-selected block results and resolve the push. */
  confirmBlock(): void {
    const selected = this.selectedBlockResults();
    if (selected.length === 0) return;

    const attacker = this.selectedPlayer();
    const defender = this.actionTarget();
    if (!attacker || !defender) { this.closeMenu(); return; }

    const blockChance = this.engine.blockProbabilityMulti(this.working(), attacker, defender, selected);
    const sel = new Set(selected);

    // Board effect: if Push Back is one of the accepted outcomes the result is
    // always a plain push (the defender is not knocked prone). Knockdown only
    // applies when every accepted result is a knockdown (no Push Back selected).
    const hasPushback = sel.has('pushback');

    // "Prone in Place" is offered whenever Both Down is among the selections.
    const allowProneInPlace = sel.has('bothdown');

    if (hasPushback) {
      this.startPush('push', blockChance, allowProneInPlace);
    } else if (sel.has('pow')) {
      this.startPush('pow', blockChance, allowProneInPlace);
    } else if (sel.has('stumble')) {
      this.startPush('stumble', blockChance, allowProneInPlace);
    } else if (sel.has('bothdown')) {
      // BD-only: show push menu with Prone in Place available.
      this.startBothDownWithPush(blockChance, true);
    } else {
      this.startPush('push', blockChance, false);
    }
  }

  cancelAction(): void {
    this.closeMenu();
  }

  private startPush(result: 'push' | 'stumble' | 'pow', overrideChance?: number, allowProneInPlace = false): void {
    const blocker = this.selectedPlayer();
    const defender = this.actionTarget();
    if (!blocker || !defender) {
      this.closeMenu();
      return;
    }

    const dir = this.engine.pushDirection(blocker, defender);
    const options = this.engine.pushOptions(this.working(), defender.x, defender.y, dir);
    if (options.length === 0) {
      this.closeMenu();
      return;
    }

    const blockChance = overrideChance ?? this.engine.blockProbability(this.working(), blocker, defender, result);
    this.blockStage.set(false);
    this.pushState.set({
      dir,
      frames: [],
      currentId: defender.id,
      blockChance,
      attackerId: blocker.id,
      defenderX: defender.x,
      defenderY: defender.y,
      firstDefenderId: defender.id,
      knocksDown: result === 'stumble' || result === 'pow',
      allowProneInPlace,
      proneInPlaceOnly: false
    });
  }

  /**
   * Both Down effect: offers the user a choice between pushing the defender prone
   * (regular push-square selection) or proneing them in their current square.
   * The push state is entered even when no push squares exist so "Prone in Place"
   * remains available.
   */
  private startBothDownWithPush(blockChance: number, allowProneInPlace: boolean): void {
    const blocker = this.selectedPlayer();
    const defender = this.actionTarget();
    if (!blocker || !defender) {
      this.closeMenu();
      return;
    }

    const dir = this.engine.pushDirection(blocker, defender);
    this.blockStage.set(false);
    this.selectedBlockResults.set([]);
    // proneInPlaceOnly = true when allowProneInPlace is the ONLY option
    // (BD selected alone — no push squares offered, only Prone in Place).
    const proneInPlaceOnly = allowProneInPlace;
    this.pushState.set({
      dir,
      frames: [],
      currentId: defender.id,
      blockChance,
      attackerId: blocker.id,
      defenderX: defender.x,
      defenderY: defender.y,
      firstDefenderId: defender.id,
      knocksDown: true,
      allowProneInPlace,
      proneInPlaceOnly
    });
  }

  /** Prone the defender on their current square (no push). Only available on Both Down. */
  proneInPlace(): void {
    const state = this.pushState();
    if (!state?.allowProneInPlace) return;

    this.sessionService.applyBothDown(
      this.current().date, this.current().data,
      state.attackerId, state.firstDefenderId, state.blockChance
    );
    this.pushState.set(null);
    this.actionTarget.set(null);
  }

  private onPushSquareChosen(cell: BoardCell): void {
    const state = this.pushState();
    if (!state || !this.isPushTarget(cell)) {
      return;
    }

    const board = this.working();
    const occupant = board.players.find(
      (p) => p.x === cell.x && p.y === cell.y && p.id !== state.currentId
    );
    const frames = [...state.frames, { playerId: state.currentId, x: cell.x, y: cell.y }];

    if (occupant) {
      this.pushState.set({
        dir: state.dir, frames, currentId: occupant.id, blockChance: state.blockChance,
        attackerId: state.attackerId, defenderX: state.defenderX, defenderY: state.defenderY,
        firstDefenderId: state.firstDefenderId, knocksDown: state.knocksDown,
        allowProneInPlace: false, proneInPlaceOnly: false
      });
      return;
    }

    const moves = [...frames].reverse();
    this.pushState.set(null);
    this.actionTarget.set(null);
    this.blockStage.set(false);
    this.followUpState.set({
      attackerId: state.attackerId,
      followUpX: state.defenderX,
      followUpY: state.defenderY,
      pendingMoves: moves,
      blockChance: state.blockChance,
      firstDefenderId: state.firstDefenderId,
      knocksDown: state.knocksDown,
      removePlayerId: null
    });
  }

  /** Confirm or skip the follow-up move after a push. */
  confirmFollowUp(follow: boolean): void {
    const state = this.followUpState();
    if (!state) {
      return;
    }

    const moves = follow
      ? [...state.pendingMoves, { playerId: state.attackerId, x: state.followUpX, y: state.followUpY }]
      : state.pendingMoves;

    this.sessionService.applyPushMoves(
      this.current().date, this.current().data,
      moves, state.blockChance, state.attackerId,
      state.firstDefenderId, state.knocksDown,
      state.removePlayerId
    );
    this.followUpState.set(null);
  }

  private closeMenu(): void {
    this.actionTarget.set(null);
    this.blockStage.set(false);
    this.selectedBlockResults.set([]);
    this.pushState.set(null);
    this.followUpState.set(null);
  }


  private activateTargetPlayer(): void {
    const target = this.actionTarget();
    if (!target) {
      return;
    }
    this.sessionService.activatePlayer(this.current().date, this.current().data, target.id);
  }

  onPlayerHover(player: WorkingPlayer | null): void {
    this.hoveredPlayer.set(player);
  }

  ngOnDestroy(): void {
    // Pause the timer when leaving the Puzzles tab (component destroyed).
    this.sessionService.setDisplayed(null);
  }
}
