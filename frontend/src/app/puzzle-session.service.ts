import { Injectable, OnDestroy, signal, Signal, WritableSignal } from '@angular/core';
import { PuzzleCharacteristics, PuzzleData, PuzzlePosition, PuzzleTeam, PuzzleType } from './puzzles.data';
import { PuzzleEngineService } from './puzzle-engine.service';

export interface PuzzleSessionState {
  started: boolean;
  elapsed: number;
  solved: boolean;
}

export interface WorkingPlayer {
  id: string;
  team: PuzzleTeam;
  name: string;
  x: number;
  y: number;
  characteristics: PuzzleCharacteristics;
  skills: string[];
  extraSkills: string[];
  activated: boolean;
  movementLeft: number;
  /** Extra Rush squares remaining (2 normally, 3 with Sprint). */
  rushLeft: number;
  hasMoved: boolean;
  /** Whether the Sure Feet reroll has already been used this activation. */
  sureFeetUsed: boolean;
  /** Whether the player is currently knocked down (prone) and exerts no tackle zone. */
  prone: boolean;
  /** True once this player has performed a Block (prevents a second block/pass/handoff). */
  hasBlocked: boolean;
  /** Whether the player has already used their Frenzy second block this activation. */
  frenzyUsed: boolean;
  /**
   * True when this player has been hit by an attacker with the Eye Gouge skill.
   * An eye-gouged player cannot provide assists (offensive or defensive) for any block.
   */
  eyeGouged: boolean;
  /**
   * Sidestep destinations, ordered by priority. When this player (who must have
   * the Sidestep skill) is blocked, they choose any empty adjacent square to be
   * pushed into — these are the squares they want, highest priority first.
   */
  goTo?: PuzzlePosition[];
  /**
   * Whether a Both Down result against this player may participate in a correct
   * solution. When `false`, choosing Both Down against this player flags the
   * solution as incorrect (see WorkingBoard.incorrectSolution).
   */
  bothDown?: boolean;
}

/**
 * One probability-reducing event in a puzzle solution. Recorded whenever an
 * action multiplies the running success chance by a factor below 1, so the UI
 * can show a per-step breakdown of where chance was lost and why.
 */
export interface ChanceLogEntry {
  /** Human-readable cause, e.g. "Dodge — Skaven Blitzer". */
  reason: string;
  /** The multiplicative probability applied for this step (0..1, < 1). */
  factor: number;
  /** Cumulative success chance (0..1) AFTER this factor was applied. */
  chanceAfter: number;
}

export interface WorkingBoard {
  rows: number;
  cols: number;
  targetScore: number;
  /** Determines the win condition: 'score' = touchdown, 'surf' = push opponent OOB. */
  puzzleType: PuzzleType;
  ball: { x: number; y: number };
  players: WorkingPlayer[];
  selectedPlayerId: string | null;
  lastMovedPlayerId: string | null;
  solved: boolean;
  /** Whether the single allowed pass has already been used this puzzle. */
  passUsed: boolean;
  /** Whether the single allowed hand-off has already been used this puzzle. */
  handoffUsed: boolean;
  /**
   * The id of the home player performing the team's single Blitz this turn,
   * or null while the Blitz is still available. A Blitz is the once-per-turn
   * Move + Block action; the owning player may keep moving after the block,
   * while any other moved player is barred from blocking. This single value is
   * the sole source of truth for "is the Blitz used, and by whom".
   */
  blitzPlayerId: string | null;
  /** Running probability (0..1) that the solution executes successfully. */
  successChance: number;
  /** Ordered log of every action that reduced the success chance, with reasons. */
  chanceLog: ChanceLogEntry[];
  /**
   * Sticky flag: set once the player performs an action that cannot be part of a
   * correct solution (e.g. a Both Down against a player flagged `bothDown: false`).
   * When true the puzzle is reported as an incorrect solution regardless of the
   * final success chance.
   */
  incorrectSolution: boolean;
  /** Ordered hints for this puzzle (may be empty). */
  hints: string[];
  /** How many hints have been revealed so far (in order). */
  hintsRevealed: number;
}

/**
 * Holds per-puzzle solving state for the current session (in memory).
 *
 * The timer for the *displayed* puzzle only ticks while all of these hold:
 *  - the puzzle has been started,
 *  - it is the puzzle currently shown (not navigated away to another puzzle),
 *  - the Puzzles tab is mounted (component not destroyed by an app-tab switch),
 *  - the browser tab/document is visible.
 */
@Injectable({ providedIn: 'root' })
export class PuzzleSessionService implements OnDestroy {
  private readonly engine = new PuzzleEngineService();
  private readonly sessions = new Map<string, WritableSignal<PuzzleSessionState>>();
  private readonly boards = new Map<string, WritableSignal<WorkingBoard>>();
  private displayedKey: string | null = null;
  private lastViewedKey: string | null = null;
  private documentVisible = true;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.documentVisible = document.visibilityState === 'visible';
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** Read-only reactive state for a puzzle, created lazily. */
  sessionState(key: string): Signal<PuzzleSessionState> {
    return this.sessionSignal(key).asReadonly();
  }

  /** Mark a puzzle as started (idempotent) and (re)evaluate the timer. */
  start(key: string): void {
    const session = this.sessionSignal(key);
    if (!session().started) {
      session.set({ started: true, elapsed: 0, solved: false });
    }
    this.updateTimer();
  }

  /** Set which puzzle is currently on screen (or null when none is shown). */
  setDisplayed(key: string | null): void {
    this.displayedKey = key;
    this.updateTimer();
  }

  /** The last puzzle the user viewed this session, or null if none yet. */
  getLastViewedKey(): string | null {
    return this.lastViewedKey;
  }

  /** Remember the last puzzle the user viewed this session. */
  setLastViewedKey(key: string): void {
    this.lastViewedKey = key;
  }

  /** Read-only reactive working board for a puzzle, created lazily from its data. */
  board(key: string, data: PuzzleData, puzzleType: PuzzleType = 'score'): Signal<WorkingBoard> {
    return this.boardSignal(key, data, puzzleType).asReadonly();
  }

  /** Reveal the next hint (in order), up to the number available for this puzzle. */
  revealNextHint(key: string, data: PuzzleData): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    if (board.hintsRevealed >= board.hints.length) {
      return;
    }
    boardSignal.set({ ...board, hintsRevealed: board.hintsRevealed + 1 });
  }

  /** Restore the working board to the puzzle's initial state (does not affect the timer). */
  resetBoard(key: string, data: PuzzleData, puzzleType: PuzzleType = 'score'): void {
    this.boardSignal(key, data, puzzleType).set(this.createWorkingBoard(data, puzzleType));

    const session = this.sessions.get(key);
    if (session && session().solved) {
      session.set({ ...session(), solved: false });
    }
    this.updateTimer();
  }

  /** Select (or toggle off) a home player, if it is not already activated. */
  selectPlayer(key: string, data: PuzzleData, playerId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const player = board.players.find((p) => p.id === playerId);

    if (board.solved || !player || player.team !== 'home' || player.activated) {
      return;
    }

    const selectedPlayerId = board.selectedPlayerId === playerId ? null : playerId;
    boardSignal.set({ ...board, selectedPlayerId });
  }

  /**
   * Switch control to another (not-yet-activated) home player. The previously
   * active player is locked in as activated and can no longer be activated.
   */
  activatePlayer(key: string, data: PuzzleData, playerId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const target = board.players.find((p) => p.id === playerId);

    if (board.solved || !target || target.team !== 'home' || target.activated) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    if (board.selectedPlayerId !== null && board.selectedPlayerId !== playerId) {
      const previous = players.find((p) => p.id === board.selectedPlayerId);
      if (previous) {
        previous.activated = true;
      }
    }

    boardSignal.set({
      ...board,
      players,
      selectedPlayerId: playerId,
      lastMovedPlayerId: null
    });
  }

  /**
   * Move the selected player into an adjacent empty square (costs 1 movement).
   * When a *different* player is moved after a previously moved one, the previous
   * player is locked in as activated and can no longer be selected.
   */
  moveSelectedTo(key: string, data: PuzzleData, x: number, y: number): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const selectedId = board.selectedPlayerId;

    if (board.solved || selectedId === null) {
      return;
    }

    const selected = board.players.find((p) => p.id === selectedId);
    if (!selected || selected.activated) {
      return;
    }

    // A prone player must stand up before moving — standing up costs 3 movement.
    const standUpCost = selected.prone ? 3 : 0;
    if (selected.prone && selected.movementLeft < standUpCost) {
      return; // not enough movement to stand up
    }
    const movementForMove = selected.movementLeft - standUpCost;

    // After any stand-up, the move uses remaining base movement or a Rush square.
    const isRush = movementForMove <= 0 && selected.rushLeft > 0;
    if (!isRush && movementForMove <= 0) {
      return;
    }

    if (x < 0 || y < 0 || x >= board.rows || y >= board.cols) {
      return;
    }

    const isAdjacent = Math.max(Math.abs(x - selected.x), Math.abs(y - selected.y)) === 1;
    if (!isAdjacent) {
      return;
    }

    if (board.players.some((p) => p.x === x && p.y === y)) {
      return; // square occupied
    }

    // A player with 0 passing (PA=0) cannot pick up the ball.
    const ballOnTarget = board.ball.x === x && board.ball.y === y;
    const alreadyCarrying = board.ball.x === selected.x && board.ball.y === selected.y;
    if (ballOnTarget && !alreadyCarrying && selected.characteristics.passing === 0) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    // A move out of an enemy tackle zone is a Dodge; fold its success chance in.
    const dodgeChance = this.engine.dodgeProbability(board, selected, x, y);

    // Picking up the ball requires an Agility test (modified by enemy TZs on the square).
    const pickingUpBall = ballOnTarget && !alreadyCarrying;
    const pickupChance = pickingUpBall
      ? this.engine.pickupProbability(board, selected, x, y)
      : 1;

    // A Rush move requires a 2+ roll (3+ in Blizzard); Sure Feet grants one reroll.
    const rushChance = isRush
      ? this.engine.rushProbability(board, selected)
      : 1;

    // Bone Head: 2+ on D6 required before the player's first action (5/6 chance).
    const negatraitChance = this.negatraitChance(board, selected);

    // Moving a different player finalizes (activates) the previously moved one.
    if (board.lastMovedPlayerId !== null && board.lastMovedPlayerId !== selected.id) {
      const previous = players.find((p) => p.id === board.lastMovedPlayerId);
      if (previous) {
        previous.activated = true;
      }
    }

    const moving = players.find((p) => p.id === selected.id)!;
    const carrying = board.ball.x === moving.x && board.ball.y === moving.y;
    const pickingUp = board.ball.x === x && board.ball.y === y;

    moving.x = x;
    moving.y = y;
    // Stand up first if prone (consumes the 3-movement stand-up cost).
    if (moving.prone) {
      moving.movementLeft = Math.max(0, moving.movementLeft - standUpCost);
      moving.prone = false;
    }
    if (isRush) {
      moving.rushLeft -= 1;
      // Mark Sure Feet as used if it was applied on this Rush.
      if (!moving.sureFeetUsed && this.hasSkill(moving, 'Sure Feet')) {
        moving.sureFeetUsed = true;
      }
    } else {
      moving.movementLeft -= 1;
    }
    moving.hasMoved = true;

    const possessesBall = carrying || pickingUp;
    // A touchdown is scored when the ball carrier reaches the endzone (row 0, i.e. x === 0).
    const solved = board.puzzleType === 'score' && possessesBall && x === 0;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Dodge — ${selected.name}`, factor: dodgeChance },
      { reason: `Rush — ${selected.name}`, factor: rushChance },
      { reason: `Pick up — ${selected.name}`, factor: pickupChance },
      { reason: `${this.negatraitName(selected)} — ${selected.name}`, factor: negatraitChance }
    ]);

    boardSignal.set({
      ...board,
      players,
      ball: possessesBall ? { x, y } : board.ball,
      lastMovedPlayerId: selected.id,
      selectedPlayerId: solved ? null : selected.id,
      solved,
      successChance,
      chanceLog
    });

    if (solved) {
      this.markSolved(key);
    }
  }

  /**
   * Stand the selected prone player up in place, without moving. Standing up
   * costs 3 movement points; the player must have at least that much remaining.
   * Used when a player wants to get up and then act (e.g. block) without stepping.
   */
  standUpSelected(key: string, data: PuzzleData): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const selectedId = board.selectedPlayerId;

    if (board.solved || selectedId === null) {
      return;
    }

    const selected = board.players.find((p) => p.id === selectedId);
    if (!selected || selected.activated || !selected.prone || selected.movementLeft < 3) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    // The negatrait check (Bone Head / Animal Savagery / Really Stupid) is the
    // first step of activation — it is rolled before the prone player stands up.
    const negatraitChance = this.negatraitChance(board, selected);

    // Standing a different player finalizes the previously moved one.
    if (board.lastMovedPlayerId !== null && board.lastMovedPlayerId !== selected.id) {
      const previous = players.find((p) => p.id === board.lastMovedPlayerId);
      if (previous) {
        previous.activated = true;
      }
    }

    const standing = players.find((p) => p.id === selected.id)!;
    standing.movementLeft = Math.max(0, standing.movementLeft - 3);
    standing.prone = false;
    standing.hasMoved = true;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `${this.negatraitName(selected)} — ${selected.name}`, factor: negatraitChance }
    ]);

    boardSignal.set({
      ...board,
      players,
      lastMovedPlayerId: selected.id,
      selectedPlayerId: selected.id,
      successChance,
      chanceLog
    });
  }

  /**
   * Jump Over a prone player and land at (x, y) — one of the three squares
   * directly beyond the prone player. Costs 2 squares of movement (Rushing for
   * any shortfall) and requires an Agility landing test (see jumpProbability).
   * The jumper stays selected afterwards so movement can continue.
   */
  jumpOver(key: string, data: PuzzleData, proneId: string, x: number, y: number): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const selectedId = board.selectedPlayerId;

    if (board.solved || selectedId === null) {
      return;
    }

    const selected = board.players.find((p) => p.id === selectedId);
    if (!selected || selected.activated) {
      return;
    }

    // Only prone players can be jumped over.
    const prone = board.players.find((p) => p.id === proneId);
    if (!prone || !prone.prone) {
      return;
    }

    // The landing square must be on-board and empty.
    if (x < 0 || y < 0 || x >= board.rows || y >= board.cols) {
      return;
    }
    if (board.players.some((p) => p.x === x && p.y === y)) {
      return;
    }

    // Cost is 2 squares: spend base movement first, then Rush for any shortfall.
    const movementUsed = Math.min(selected.movementLeft, 2);
    const rushUsed = 2 - movementUsed;
    if (rushUsed > selected.rushLeft) {
      return; // cannot afford the jump even with Rush
    }

    // A player with PA=0 cannot pick up the ball on landing.
    const ballOnTarget = board.ball.x === x && board.ball.y === y;
    const alreadyCarrying = board.ball.x === selected.x && board.ball.y === selected.y;
    if (ballOnTarget && !alreadyCarrying && selected.characteristics.passing === 0) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    // Each Rush square needs a 2+ (5/6). Sure Feet rerolls the first failure only.
    let rushChance = 1;
    let sureFeetUsed = selected.sureFeetUsed;
    for (let i = 0; i < rushUsed; i++) {
      let pr = 5 / 6;
      if (this.hasSkill(selected, 'Sure Feet') && !sureFeetUsed) {
        pr = 1 - (1 - pr) * (1 - pr);
        sureFeetUsed = true;
      }
      rushChance *= pr;
    }

    const landingChance = this.engine.jumpProbability(board, selected, x, y);
    const negatraitChance = this.negatraitChance(board, selected);

    // Picking up the ball on landing also requires an Agility test.
    // (ballOnTarget / alreadyCarrying were already computed for the PA=0 guard above.)
    const pickupChance = (ballOnTarget && !alreadyCarrying)
      ? this.engine.pickupProbability(board, selected, x, y)
      : 1;

    // Jumping a different player finalizes (activates) the previously moved one.
    if (board.lastMovedPlayerId !== null && board.lastMovedPlayerId !== selected.id) {
      const previous = players.find((p) => p.id === board.lastMovedPlayerId);
      if (previous) {
        previous.activated = true;
      }
    }

    const moving = players.find((p) => p.id === selected.id)!;
    const carrying = board.ball.x === moving.x && board.ball.y === moving.y;
    const pickingUp = ballOnTarget;

    moving.x = x;
    moving.y = y;
    moving.movementLeft -= movementUsed;
    moving.rushLeft -= rushUsed;
    if (rushUsed > 0) {
      moving.sureFeetUsed = sureFeetUsed;
    }
    moving.hasMoved = true;

    const possessesBall = carrying || pickingUp;
    const solved = board.puzzleType === 'score' && possessesBall && x === 0;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Rush — ${selected.name}`, factor: rushChance },
      { reason: `Jump over ${prone.name} — ${selected.name}`, factor: landingChance },
      { reason: `Pick up — ${selected.name}`, factor: pickupChance },
      { reason: `${this.negatraitName(selected)} — ${selected.name}`, factor: negatraitChance }
    ]);

    boardSignal.set({
      ...board,
      players,
      ball: possessesBall ? { x, y } : board.ball,
      lastMovedPlayerId: selected.id,
      selectedPlayerId: solved ? null : selected.id,
      solved,
      successChance,
      chanceLog
    });

    if (solved) {
      this.markSolved(key);
    }
  }

  /**
   * Complete a pass: move the ball to a target team-mate. The passer (the
   * player currently holding the ball) is deactivated, and only one pass is
   * allowed per puzzle. Scores if the receiver stands in the endzone row.
   */
  passBallTo(key: string, data: PuzzleData, targetId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const target = board.players.find((p) => p.id === targetId);

    if (board.solved || board.passUsed || !target) {
      return;
    }

    // A player with PA=0 cannot throw or catch the ball.
    const passerCheck = board.players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    if ((passerCheck && passerCheck.characteristics.passing === 0) || target.characteristics.passing === 0) {
      return;
    }

    // "My Ball": a selfish carrier refuses to pass the ball.
    if (passerCheck && this.hasSkill(passerCheck, 'My Ball')) {
      return;
    }

    // Compute probability before mutating players (passer must still be on the ball).
    const passerOrig = board.players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    const passChance = passerOrig
      ? this.engine.passProbability(board, passerOrig, target)
      : 1;
    const passerBoneHead = passerOrig ? this.negatraitChance(board, passerOrig) : 1;

    const players = board.players.map((p) => ({ ...p }));

    // Deactivate the passer (the player currently standing on the ball).
    const passer = players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    if (passer) {
      passer.activated = true;
    }

    const solved = board.puzzleType === 'score' && target.x === 0;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Pass — ${passerOrig?.name ?? 'passer'} → ${target.name}`, factor: passChance },
      ...(passerOrig
        ? [{ reason: `${this.negatraitName(passerOrig)} — ${passerOrig.name}`, factor: passerBoneHead }]
        : [])
    ]);

    boardSignal.set({
      ...board,
      players,
      ball: { x: target.x, y: target.y },
      passUsed: true,
      selectedPlayerId: null,
      solved,
      successChance,
      chanceLog
    });

    if (solved) {
      this.markSolved(key);
    }
  }

  /**
   * Hand the ball off to an adjacent team-mate. Behaves like a pass (the carrier
   * is deactivated and the ball moves to the receiver) but is not subject to the
   * one-pass-per-puzzle limit. Only one hand-off is allowed per puzzle.
   */
  handOffTo(key: string, data: PuzzleData, targetId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const target = board.players.find((p) => p.id === targetId);

    if (board.solved || board.handoffUsed || !target) {
      return;
    }

    // A player with PA=0 cannot catch the ball.
    if (target.characteristics.passing === 0) {
      return;
    }

    const carrierOrig = board.players.find((p) => p.x === board.ball.x && p.y === board.ball.y);

    // "My Ball": a selfish carrier refuses to hand the ball off.
    if (carrierOrig && this.hasSkill(carrierOrig, 'My Ball')) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    const carrier = players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    if (carrier) {
      carrier.activated = true;
    }

    const catchChance = this.engine.handoffProbability(board, target);
    const carrierBoneHead = carrierOrig ? this.negatraitChance(board, carrierOrig) : 1;
    const solved = board.puzzleType === 'score' && target.x === 0;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Hand-off — ${carrierOrig?.name ?? 'carrier'} → ${target.name}`, factor: catchChance },
      ...(carrierOrig
        ? [{ reason: `${this.negatraitName(carrierOrig)} — ${carrierOrig.name}`, factor: carrierBoneHead }]
        : [])
    ]);

    boardSignal.set({
      ...board,
      players,
      ball: { x: target.x, y: target.y },
      handoffUsed: true,
      selectedPlayerId: null,
      solved,
      successChance,
      chanceLog
    });

    if (solved) {
      this.markSolved(key);
    }
  }

  private markSolved(key: string): void {
    const session = this.sessionSignal(key);
    if (!session().solved) {
      session.set({ ...session(), solved: true });
    }
    this.updateTimer();
  }

  /**
   * Apply a sequence of player relocations (used to resolve a block push / chain).
   * `blockChance` (0..1, default 1) is the probability that the chosen block
   * result was achievable; it is multiplied into `successChance`.
   * `attackerId` (optional): the blocking player — costs 1 movementLeft for the block.
   * `removePlayerId` (optional): a player pushed off the pitch — removed from the board.
   */
  applyPushMoves(
    key: string,
    data: PuzzleData,
    moves: { playerId: string; x: number; y: number }[],
    blockChance: number = 1,
    attackerId: string | null = null,
    defenderId: string | null = null,
    knocksDown: boolean = false,
    removePlayerId: string | null = null
  ): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();

    if (board.solved) return;
    if (moves.length === 0 && !attackerId && !removePlayerId) return;

    const players = board.players.map((p) => ({ ...p }));
    let blitzPlayerId = board.blitzPlayerId;

    // Captured from the attacker (if any) for the chance-log entries below.
    let attackerName: string | null = null;
    let attackerNegatraitName = 'Bone Head';
    let attackerNegatraitChance = 1;
    let defenderName: string | null = null;
    let foulAppearanceChance = 1;

    // Track the ball carrier's position before any changes.
    const carrier = players.find((p) => p.x === board.ball.x && p.y === board.ball.y) ?? null;
    const attacker = attackerId ? players.find((p) => p.id === attackerId) : null;
    const defender = defenderId ? players.find((p) => p.id === defenderId) : null;

    // Strip Ball: Check if the attacker has Strip Ball and the defender is the ball carrier
    // Strip Ball forces a ball drop when a player is pushed (not knocked down)
    // Exception: Sure Hands negates Strip Ball
    const shouldStripBall = !knocksDown && attacker && defender && carrier
      && carrier.id === defender.id
      && this.hasSkill(attacker, 'Strip Ball')
      && !this.hasSkill(defender, 'Sure Hands');

    // Capture the attacker's negatrait (Bone Head / Animal Savagery / Really Stupid)
    // check NOW — before the push `moves` below relocate the attacker (e.g. a follow
    // up). The test, and its Really Stupid support check, must use the attacker's
    // position from BEFORE it moved, which is when the test is actually made.
    if (attacker) {
      attackerName = attacker.name;
      attackerNegatraitName = this.negatraitName(attacker);
      attackerNegatraitChance = this.negatraitChance(board, attacker);
    }

    for (const move of moves) {
      const player = players.find((p) => p.id === move.playerId);
      if (player) {
        player.x = move.x;
        player.y = move.y;
      }
    }

    if (attackerId) {
      const attacker = players.find((p) => p.id === attackerId);
      if (attacker) {

        // Foul Appearance: the defender forces the attacker to roll 2+ before the block.
        if (defender && this.hasSkill(defender, 'Foul Appearance')) {
          defenderName = defender.name;
          foulAppearanceChance = 5 / 6;
        }
        // Moving before the (first) block is a Blitz: this player claims the team's
        // Blitz. Guard on !hasBlocked so a Frenzy second block — where hasMoved is
        // already true from the first block — does not re-derive blitz ownership.
        if (attacker.hasMoved && !attacker.hasBlocked) blitzPlayerId = attacker.id;
        attacker.movementLeft = Math.max(0, attacker.movementLeft - 1);
        attacker.hasMoved = true;

        // If this is a Frenzy second block, mark it as used
        if (this.hasSkill(attacker, 'Frenzy') && attacker.hasBlocked) {
          attacker.frenzyUsed = true;
        }

        attacker.hasBlocked = true;
      }
    }

    // Mark the original defender as prone on Stumble or Pow results.
    if (knocksDown && defenderId) {
      const defender = players.find((p) => p.id === defenderId);
      if (defender) {
        defender.prone = true;
      }
    }

    // Eye Gouge: if the attacker has the Eye Gouge skill, the defender can no longer
    // provide assists (offensive or defensive) for the rest of the turn.
    if (attacker && defender && this.hasSkill(attacker, 'Eye Gouge')) {
      defender.eyeGouged = true;
    }

    // Determine ball position before possibly removing the carrier.
    let ball = carrier ? { x: carrier.x, y: carrier.y } : board.ball;
    let solved = false;

    // Strip Ball: If the defender with the ball was pushed (not knocked down),
    // and the attacker has Strip Ball (and defender doesn't have Sure Hands),
    // the ball is dropped at the defender's new position and scatters.
    if (shouldStripBall && carrier) {
      const scattered = this.scatterBall(players, board, carrier.x, carrier.y);
      if (scattered) ball = scattered;
      if (board.puzzleType === 'sack') solved = true;
    }

    // If the away-team carrier was knocked prone (and stays on pitch), scatter the ball.
    // For 'sack' puzzles this also solves the puzzle.
    if (carrier && carrier.team === 'away' && carrier.prone && !removePlayerId && !shouldStripBall) {
      const scattered = this.scatterBall(players, board, carrier.x, carrier.y);
      if (scattered) ball = scattered;
      if (board.puzzleType === 'sack') solved = true;
    }

    // Score: home ball carrier chain-pushed onto the touchdown line (row 0).
    if (!solved && carrier && carrier.team === 'home' && board.puzzleType === 'score' && carrier.x === 0) {
      solved = true;
    }

    // Surf / sack win conditions when a player is pushed off the pitch.
    if (removePlayerId) {
      const playerToRemove = players.find((p) => p.id === removePlayerId);
      if (playerToRemove && playerToRemove.team === 'away') {
        if (board.puzzleType === 'surf') solved = true;
        // Sack: away ball carrier pushed off the pitch.
        if (board.puzzleType === 'sack' && carrier && removePlayerId === carrier.id) solved = true;
      }
      // If the removed player was carrying the ball, the ball leaves the pitch too.
      if (carrier && removePlayerId === carrier.id) {
        ball = { x: -1, y: -1 };
      }
      // Remove the player from the board.
      const idx = players.findIndex((p) => p.id === removePlayerId);
      if (idx >= 0) players.splice(idx, 1);
    }

    const factors: { reason: string; factor: number }[] = [];
    if (attackerName !== null) {
      factors.push({ reason: `Block — ${attackerName}`, factor: blockChance });
      factors.push({ reason: `${attackerNegatraitName} — ${attackerName}`, factor: attackerNegatraitChance });
    }
    if (defenderName !== null) {
      factors.push({ reason: `Foul Appearance — ${defenderName}`, factor: foulAppearanceChance });
    }
    const { successChance, chanceLog } = this.applyChanceFactors(board, factors);

    boardSignal.set({ ...board, players, ball, solved, blitzPlayerId, successChance, chanceLog });
    if (solved) this.markSolved(key);
  }

  applyBothDown(
    key: string,
    data: PuzzleData,
    attackerId: string,
    defenderId: string,
    blockChance: number = 1
  ): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();

    if (board.solved) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    const attacker = players.find((p) => p.id === attackerId);
    const attackerName = attacker?.name ?? null;
    // Negatrait (Bone Head / Animal Savagery / Really Stupid): captured BEFORE
    // hasMoved flips, so a player going straight to a block is still gated.
    let attackerNegatraitName = 'Negatrait';
    let attackerNegatraitChance = 1;
    let blitzPlayerId = board.blitzPlayerId;
    if (attacker) {
      attackerNegatraitName = this.negatraitName(attacker);
      attackerNegatraitChance = this.negatraitChance(board, attacker);
      // Moving before the (first) block is a Blitz: this player claims the team's
      // Blitz. Guard on !hasBlocked so a Frenzy second block does not re-derive it.
      if (attacker.hasMoved && !attacker.hasBlocked) blitzPlayerId = attacker.id;
      attacker.movementLeft = Math.max(0, attacker.movementLeft - 1);
      attacker.hasMoved = true;

      // If this is a Frenzy second block, mark it as used
      if (this.hasSkill(attacker, 'Frenzy') && attacker.hasBlocked) {
        attacker.frenzyUsed = true;
      }

      attacker.hasBlocked = true;
    }

    const defender = players.find((p) => p.id === defenderId);
    if (defender) {
      defender.prone = true;
    }

    // Wrestle: a Wrestle attacker is Placed Prone alongside the defender on a Both
    // Down (both players in the Block Action go down). A Block attacker stays up.
    if (attacker && this.hasSkill(attacker, 'Wrestle')) {
      attacker.prone = true;
    }

    // Eye Gouge: mark the defender as unable to provide assists.
    if (attacker && defender && this.hasSkill(attacker, 'Eye Gouge')) {
      defender.eyeGouged = true;
    }

    // Scatter the ball if the defender (away team) was carrying it and is now prone.
    // For 'sack' puzzles this also solves the puzzle.
    const carrierBD = players.find((p) => p.x === board.ball.x && p.y === board.ball.y) ?? null;
    let ball = board.ball;
    let solved = false;
    if (carrierBD && carrierBD.id === defenderId && carrierBD.team === 'away') {
      const scattered = this.scatterBall(players, board, carrierBD.x, carrierBD.y);
      if (scattered) ball = scattered;
      if (board.puzzleType === 'sack') solved = true;
    }

    const foulAppearanceBD = (defender && this.hasSkill(defender, 'Foul Appearance')) ? 5 / 6 : 1;
    const defenderNameBD = defender?.name ?? null;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Both Down — ${attackerName ?? 'blocker'}`, factor: blockChance },
      { reason: `${attackerNegatraitName} — ${attackerName ?? 'blocker'}`, factor: attackerNegatraitChance },
      ...(foulAppearanceBD < 1 ? [{ reason: `Foul Appearance — ${defenderNameBD}`, factor: foulAppearanceBD }] : [])
    ]);

    // A Both Down against a player flagged `bothDown: false` cannot be part of a
    // correct solution: allow it to resolve, but mark the puzzle as incorrect.
    const incorrectSolution = board.incorrectSolution || defender?.bothDown === false;

    boardSignal.set({ ...board, players, ball, blitzPlayerId, solved, successChance, chanceLog, incorrectSolution });
    if (solved) this.markSolved(key);
  }

  /**
   * Resolve a Projectile Vomit attack: the attacker rolls 2D6 vs the target's
   * Armour Value; on success the target is knocked Prone. Like a Block this can
   * be the team's Blitz (when the attacker moved first), costs 1 movement, and
   * locks the attacker out of a further block/vomit this activation.
   *
   * `vomitChance` (0..1) is the probability the armour roll beat the target AV
   * and is folded into the running success chance.
   */
  applyVomit(
    key: string,
    data: PuzzleData,
    attackerId: string,
    defenderId: string,
    vomitChance: number = 1
  ): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();

    if (board.solved) {
      return;
    }

    const players = board.players.map((p) => ({ ...p }));

    const attacker = players.find((p) => p.id === attackerId);
    const attackerName = attacker?.name ?? null;
    // Negatrait captured BEFORE hasMoved flips so a straight-to-vomit player is gated.
    let attackerNegatraitName = 'Negatrait';
    let attackerNegatraitChance = 1;
    let blitzPlayerId = board.blitzPlayerId;
    if (attacker) {
      attackerNegatraitName = this.negatraitName(attacker);
      attackerNegatraitChance = this.negatraitChance(board, attacker);
      // Moving before the attack is a Blitz: this player claims the team's Blitz.
      if (attacker.hasMoved && !attacker.hasBlocked) blitzPlayerId = attacker.id;
      attacker.movementLeft = Math.max(0, attacker.movementLeft - 1);
      attacker.hasMoved = true;
      attacker.hasBlocked = true;
    }

    const defender = players.find((p) => p.id === defenderId);
    if (defender) {
      defender.prone = true;
    }

    // Scatter the ball if the (away) defender carrier was knocked prone.
    // For 'sack' puzzles this also solves the puzzle.
    const carrierV = players.find((p) => p.x === board.ball.x && p.y === board.ball.y) ?? null;
    let ball = board.ball;
    let solved = false;
    if (carrierV && carrierV.id === defenderId && carrierV.team === 'away') {
      const scattered = this.scatterBall(players, board, carrierV.x, carrierV.y);
      if (scattered) ball = scattered;
      if (board.puzzleType === 'sack') solved = true;
    }

    // Foul Appearance: the target forces the attacker to roll 2+ before the Vomit.
    const foulAppearance = (defender && this.hasSkill(defender, 'Foul Appearance')) ? 5 / 6 : 1;
    const defenderName = defender?.name ?? null;

    const { successChance, chanceLog } = this.applyChanceFactors(board, [
      { reason: `Vomit — ${attackerName ?? 'attacker'}`, factor: vomitChance },
      { reason: `${attackerNegatraitName} — ${attackerName ?? 'attacker'}`, factor: attackerNegatraitChance },
      ...(foulAppearance < 1 ? [{ reason: `Foul Appearance — ${defenderName}`, factor: foulAppearance }] : [])
    ]);

    boardSignal.set({ ...board, players, ball, blitzPlayerId, solved, successChance, chanceLog });
    if (solved) this.markSolved(key);
  }

  /**
   * Mark the blocking player as activated (done for this turn) and clear the
   * selection. Called when the player chooses NOT to continue moving after a block.
   */
  finalizeBlockerActivation(key: string, data: PuzzleData, attackerId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    const players = board.players.map((p) => ({ ...p }));
    const attacker = players.find((p) => p.id === attackerId);
    if (attacker) {
      attacker.activated = true;
    }
    boardSignal.set({ ...board, players, selectedPlayerId: null, lastMovedPlayerId: null });
  }

  /**
   * Record that the given player is performing the team's Blitz this turn
   * (one per team per turn). Called when a player who has already blocked
   * chooses to continue moving. The attacker remains selected.
   */
  applyBlitz(key: string, data: PuzzleData, attackerId: string): void {
    const boardSignal = this.boardSignal(key, data);
    const board = boardSignal();
    boardSignal.set({ ...board, blitzPlayerId: attackerId });
  }

  private hasSkill(player: WorkingPlayer, skill: string): boolean {
    const target = skill.toLowerCase().replace(/[^a-z]/g, '');
    return player.skills.some((s) => s.toLowerCase().replace(/[^a-z]/g, '') === target);
  }

  /**
   * Finds the closest empty square(s) to (fromX, fromY) using Chebyshev distance
   * and picks one at random. Returns null if the board is completely full.
   */
  private scatterBall(
    players: WorkingPlayer[],
    board: WorkingBoard,
    fromX: number,
    fromY: number
  ): { x: number; y: number } | null {
    const occupied = new Set(players.map((p) => `${p.x},${p.y}`));
    const candidates: { x: number; y: number; dist: number }[] = [];

    for (let x = 0; x < board.rows; x++) {
      for (let y = 0; y < board.cols; y++) {
        if (!occupied.has(`${x},${y}`)) {
          const dist = Math.max(Math.abs(x - fromX), Math.abs(y - fromY));
          candidates.push({ x, y, dist });
        }
      }
    }

    if (candidates.length === 0) return null;

    const minDist = Math.min(...candidates.map((c) => c.dist));
    const closest = candidates.filter((c) => c.dist === minDist);
    return closest[Math.floor(Math.random() * closest.length)];
  }

  /**
   * Returns the probability the player passes a pending "negatrait" check before
   * their first action this puzzle (while !hasMoved), otherwise 1.
   *
   *  - Bone Head / Animal Savagery: a single 2+ D6 check (5/6).
   *  - Really Stupid: 4+ (3/6) when no standing team-mate is adjacent, or 2+
   *    (5/6) when a non-prone team-mate stands next to the player.
   */
  private negatraitChance(board: WorkingBoard, player: WorkingPlayer): number {
    if (player.hasMoved) return 1;

    if (this.hasSkill(player, 'Bone Head') || this.hasSkill(player, 'Animal Savagery')) {
      return 5 / 6;
    }

    if (this.hasSkill(player, 'Really Stupid')) {
      const supported = board.players.some(
        (p) => p.id !== player.id && p.team === player.team && !p.prone
          && Math.max(Math.abs(p.x - player.x), Math.abs(p.y - player.y)) === 1
      );
      return supported ? 5 / 6 : 3 / 6;
    }

    return 1;
  }

  /** The name of the player's negatrait skill (for chance-log reasons). */
  private negatraitName(player: WorkingPlayer): string {
    if (this.hasSkill(player, 'Bone Head')) return 'Bone Head';
    if (this.hasSkill(player, 'Animal Savagery')) return 'Animal Savagery';
    if (this.hasSkill(player, 'Really Stupid')) return 'Really Stupid';
    return 'Negatrait';
  }

  /**
   * Apply a list of probability factors to the board's running success chance,
   * appending a chance-log entry for each factor that actually reduces it.
   * Factors that are effectively 1 (no penalty) are skipped so the log only
   * lists meaningful decreases. Returns the new chance and the extended log.
   */
  private applyChanceFactors(
    board: WorkingBoard,
    factors: { reason: string; factor: number }[]
  ): { successChance: number; chanceLog: ChanceLogEntry[] } {
    let successChance = board.successChance;
    const chanceLog = [...board.chanceLog];
    for (const { reason, factor } of factors) {
      if (factor >= 0.999999) continue; // no meaningful decrease
      successChance *= factor;
      chanceLog.push({ reason, factor, chanceAfter: successChance });
    }
    return { successChance, chanceLog };
  }

  private boardSignal(key: string, data: PuzzleData, puzzleType: PuzzleType = 'score'): WritableSignal<WorkingBoard> {
    let board = this.boards.get(key);
    if (!board) {
      board = signal(this.createWorkingBoard(data, puzzleType));
      this.boards.set(key, board);
    }
    return board;
  }

  private createWorkingBoard(data: PuzzleData, puzzleType: PuzzleType = 'score'): WorkingBoard {
    return {
      rows: data.field.rows,
      cols: data.field.cols,
      targetScore: data.targetScore,
      puzzleType,
      ball: { x: data.ball.position.x, y: data.ball.position.y },
      players: data.players.map((player, index) => {
        const hasSprint = player.skills.some(
          (s) => s.toLowerCase().replace(/[^a-z]/g, '') === 'sprint'
        );
        return {
          id: `${player.team}-${index}`,
          team: player.team,
          name: player.name,
          x: player.position.x,
          y: player.position.y,
          characteristics: player.characteristics,
          skills: player.skills,
          extraSkills: player.extraSkills ?? [],
          activated: player.activated ?? false,
          movementLeft: player.characteristics.movement,
          rushLeft: hasSprint ? 3 : 2,
          hasMoved: false,
          sureFeetUsed: false,
          prone: player.prone ?? false,
          hasBlocked: false,
          frenzyUsed: false,
          eyeGouged: false,
          goTo: player.goTo,
          bothDown: player.bothDown
        };
      }),
      selectedPlayerId: null,
      lastMovedPlayerId: null,
      solved: false,
      passUsed: false,
      handoffUsed: false,
      blitzPlayerId: null,
      successChance: 1,
      chanceLog: [],
      incorrectSolution: false,
      hints: data.hints ?? [],
      hintsRevealed: 0
    };
  }

  private sessionSignal(key: string): WritableSignal<PuzzleSessionState> {
    let session = this.sessions.get(key);
    if (!session) {
      session = signal<PuzzleSessionState>({ started: false, elapsed: 0, solved: false });
      this.sessions.set(key, session);
    }
    return session;
  }

  private readonly onVisibilityChange = (): void => {
    this.documentVisible = document.visibilityState === 'visible';
    this.updateTimer();
  };

  private updateTimer(): void {
    const session = this.displayedKey !== null ? this.sessionSignal(this.displayedKey)() : null;
    const shouldRun =
      session !== null &&
      this.documentVisible &&
      session.started &&
      !session.solved;

    if (shouldRun && this.intervalId === null) {
      this.intervalId = setInterval(() => this.advanceDisplayed(), 1000);
    } else if (!shouldRun && this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private advanceDisplayed(): void {
    if (this.displayedKey === null) {
      return;
    }

    const session = this.sessionSignal(this.displayedKey);
    const current = session();
    session.set({ ...current, elapsed: current.elapsed + 1 });
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }
}
