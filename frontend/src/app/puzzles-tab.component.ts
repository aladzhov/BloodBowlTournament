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
  /** Whether this is a Frenzy follow-up that should trigger a second block. */
  isFrenzy: boolean;
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

  /** Active while the user is choosing where a blocked player is pushed. */
  readonly pushState = signal<PushState | null>(null);
  readonly pushing = computed(() => this.pushState() !== null);

  /** Active after a push resolves, waiting for Follow Up / Stay choice. */
  readonly followUpState = signal<FollowUpState | null>(null);
  readonly followingUp = computed(() => this.followUpState() !== null);

  /**
   * Set to the attacker's id after a block resolves and the player has movement
   * remaining, offering the choice to Blitz (continue moving) or end the turn.
   */
  readonly blitzChoiceAttackerId = signal<string | null>(null);
  readonly offeringBlitz = computed(() => this.blitzChoiceAttackerId() !== null);


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

  readonly solvedTitle = computed(() => {
    switch (this.current().type ?? 'score') {
      case 'surf':  return '🏄 Surfed! Solved in';
      case 'sack':  return '💥 Sacked! Solved in';
      case 'score':
      default:      return '🏆 Touchdown! Solved in';
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

  /**
   * Per-action breakdown of where success chance was lost. Each row carries the
   * reason, the percentage-point drop it caused, and the cumulative chance left
   * afterwards — derived from the board's chanceLog.
   */
  readonly chanceBreakdown = computed(() => {
    let before = 1;
    return this.working().chanceLog.map((entry) => {
      const dropPoints = Math.round((before - entry.chanceAfter) * 1000) / 10;
      before = entry.chanceAfter;
      return {
        reason: entry.reason,
        rollPercent: Math.round(entry.factor * 1000) / 10,
        dropPoints,
        chanceAfterPercent: Math.round(entry.chanceAfter * 1000) / 10
      };
    });
  });

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
      case 'menu': {
        const options = this.engine.actionOptions(this.working(), this.selectedPlayer(), outcome.target);
        if (options.length > 0) {
          this.blockStage.set(false);
          this.actionTarget.set(outcome.target);
        }
        break;
      }
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
      removePlayerId: state.currentId,
      isFrenzy: false // Cannot Frenzy if target is pushed off the pitch
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

    // Dodge (without attacker Tackle) converts a Stumble result into a plain push.
    const stumbleConvertsToPush =
      this.hasSkill(defender, 'Dodge') && !this.hasSkill(attacker, 'Tackle');

    // Board effect: if Push Back is one of the accepted outcomes the result is
    // always a plain push (the defender is not knocked prone). A Stumble that Dodge
    // converts counts as a push too. Knockdown only applies when every accepted
    // result is a knockdown (no push outcome selected).
    const hasPushback = sel.has('pushback') || (sel.has('stumble') && stumbleConvertsToPush);

    // A Stumble is a knockdown only when Dodge does NOT convert it to a push.
    const stumbleKnocksDown = sel.has('stumble') && !stumbleConvertsToPush;

    // "Prone in Place" is offered whenever Both Down is among the selections.
    const allowProneInPlace = sel.has('bothdown');

    if (hasPushback) {
      this.startPush('push', blockChance, allowProneInPlace);
    } else if (sel.has('pow')) {
      this.startPush('pow', blockChance, allowProneInPlace);
    } else if (stumbleKnocksDown) {
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
    const canPushOob = this.engine.hasPushOutOfBounds(this.working(), defender.x, defender.y, dir);

    if (options.length === 0 && !canPushOob) {
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
    const attackerId = state.attackerId;

    this.sessionService.applyBothDown(
      this.current().date, this.current().data,
      attackerId, state.firstDefenderId, state.blockChance
    );
    this.pushState.set(null);
    this.actionTarget.set(null);
    this.checkBlitzAfterBlock(attackerId);
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
      // Recalculate push direction: from the current player's position → chosen square.
      const current = board.players.find((p) => p.id === state.currentId);
      const newDir = current
        ? { dx: Math.sign(cell.x - current.x), dy: Math.sign(cell.y - current.y) }
        : state.dir;

      this.pushState.set({
        dir: newDir, frames, currentId: occupant.id, blockChance: state.blockChance,
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

    // Frenzy: follow-up is always mandatory, whether the push result was a plain push
    // or a knockdown. After the second block executeFrenzyFollowUp will detect
    // frenzyUsed=true and finalise the activation instead of opening a third block.
    const attacker = board.players.find((p) => p.id === state.attackerId);
    const shouldFrenzy = !!attacker && this.hasSkill(attacker, 'Frenzy') && !attacker.frenzyUsed;

    // For Frenzy, automatically follow up and trigger second block without showing UI choice
    if (shouldFrenzy) {
      this.executeFrenzyFollowUp(state, moves);
    } else {
      this.followUpState.set({
        attackerId: state.attackerId,
        followUpX: state.defenderX,
        followUpY: state.defenderY,
        pendingMoves: moves,
        blockChance: state.blockChance,
        firstDefenderId: state.firstDefenderId,
        knocksDown: state.knocksDown,
        removePlayerId: null,
        isFrenzy: false
      });
    }
  }

  /**
   * Execute the Frenzy follow-up automatically: apply the push moves with follow-up,
   * then immediately open the block menu for the second block.
   */
  private executeFrenzyFollowUp(state: PushState, moves: { playerId: string; x: number; y: number }[]): void {
    const movesWithFollowUp = [...moves, {
      playerId: state.attackerId,
      x: state.defenderX,
      y: state.defenderY
    }];

    this.sessionService.applyPushMoves(
      this.current().date, this.current().data,
      movesWithFollowUp, state.blockChance, state.attackerId,
      state.firstDefenderId, state.knocksDown,
      null // removePlayerId
    );

    // Now trigger the second block
    this.triggerFrenzySecondBlock(state.attackerId, state.firstDefenderId);
  }

  /**
   * Trigger the automatic second block for a Frenzy player. This consumes an
   * additional square of movement (or Rush if no movement is left).
   */
  private triggerFrenzySecondBlock(attackerId: string, defenderId: string): void {
    const board = this.working();
    const attacker = board.players.find((p) => p.id === attackerId);
    const defender = board.players.find((p) => p.id === defenderId);

    if (!attacker || !defender || board.solved) {
      return;
    }

    // If frenzyUsed is already true, the second block has just been resolved —
    // applyPushMoves marked it used. Apply the same Blitz-continuation check as a
    // regular block: offer "Continue moving" when movement remains and the team's
    // Blitz is unused or owned by this player.
    if (attacker.frenzyUsed) {
      this.checkBlitzAfterBlock(attackerId);
      return;
    }

    // Check if attacker has movement or rush left for the Frenzy block
    const hasMovement = attacker.movementLeft > 0 || attacker.rushLeft > 0;
    if (!hasMovement) {
      // Cannot perform Frenzy block without movement - finalize activation
      this.sessionService.finalizeBlockerActivation(
        this.current().date, this.current().data, attackerId
      );
      return;
    }

    // Go straight to the block-result stage: the second Frenzy block is mandatory
    // and the player is already "in position" (follow-up applied). Skip the
    // intermediate action-menu step so the block-dice sub-menu opens directly.
    this.blockStage.set(true);
    this.selectedBlockResults.set([]);
    this.actionTarget.set(defender);
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
    this.checkBlitzAfterBlock(state.attackerId);
  }

  private closeMenu(): void {
    this.actionTarget.set(null);
    this.blockStage.set(false);
    this.selectedBlockResults.set([]);
    this.pushState.set(null);
    this.followUpState.set(null);
    this.blitzChoiceAttackerId.set(null);
  }

  /**
   * After a block resolves, check whether to offer the Blitz choice (continue moving)
   * or immediately finalize the attacker's activation.
   *
   * The board's `blitzPlayerId` is the single source of truth: the attacker may
   * continue moving when it still has movement AND the team's Blitz is either
   * unused (null) or already owned by this same player. No snapshots are needed
   * because ownership — not a transient boolean — is what's being checked.
   */
  private checkBlitzAfterBlock(attackerId: string): void {
    const board = this.working();
    const attacker = board.players.find((p) => p.id === attackerId);
    if (!attacker || board.solved) return;

    const blitzAvailable = board.blitzPlayerId === null || board.blitzPlayerId === attackerId;
    if (attacker.movementLeft > 0 && blitzAvailable) {
      this.blitzChoiceAttackerId.set(attackerId);
    } else {
      this.sessionService.finalizeBlockerActivation(
        this.current().date, this.current().data, attackerId
      );
    }
  }

  /** Player chooses to continue moving after the block (Blitz action). */
  continueMoving(): void {
    const attackerId = this.blitzChoiceAttackerId();
    if (!attackerId) return;
    this.blitzChoiceAttackerId.set(null);
    this.sessionService.applyBlitz(this.current().date, this.current().data, attackerId);
    // The player remains selected; the board now records them as the Blitz owner.
  }

  /** Player ends their activation after the block (no further movement). */
  endBlockTurn(): void {
    const attackerId = this.blitzChoiceAttackerId();
    if (!attackerId) return;
    this.blitzChoiceAttackerId.set(null);
    this.sessionService.finalizeBlockerActivation(
      this.current().date, this.current().data, attackerId
    );
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

  private hasSkill(player: WorkingPlayer, skill: string): boolean {
    const target = skill.toLowerCase().replace(/[^a-z]/g, '');
    return player.skills.some((s) => s.toLowerCase().replace(/[^a-z]/g, '') === target);
  }

  ngOnDestroy(): void {
    // Pause the timer when leaving the Puzzles tab (component destroyed).
    this.sessionService.setDisplayed(null);
  }
}
