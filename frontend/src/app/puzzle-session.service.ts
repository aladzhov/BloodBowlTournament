import { Injectable, OnDestroy, signal, Signal, WritableSignal } from '@angular/core';
import { PuzzleCharacteristics, PuzzleData, PuzzleTeam, PuzzleType } from './puzzles.data';
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
  activated: boolean;
  movementLeft: number;
  /** Extra Rush squares remaining (2 normally, 3 with Sprint). */
  rushLeft: number;
  hasMoved: boolean;
  /** Whether the Sure Feet reroll has already been used this activation. */
  sureFeetUsed: boolean;
  /** Whether the player is currently knocked down (prone) and exerts no tackle zone. */
  prone: boolean;
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
  /** Running probability (0..1) that the solution executes successfully. */
  successChance: number;
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

    // The player may move using remaining base movement or Rush squares.
    const isRush = selected.movementLeft === 0 && selected.rushLeft > 0;
    if (!isRush && selected.movementLeft <= 0) {
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

    // A Rush move requires a 2+ roll (3+ in Blizzard); Sure Feet grants one reroll.
    const rushChance = isRush
      ? this.engine.rushProbability(board, selected)
      : 1;

    // Bone Head: 2+ on D6 required before the player's first action (5/6 chance).
    const boneHeadChance = this.boneHeadChance(selected);

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

    boardSignal.set({
      ...board,
      players,
      ball: possessesBall ? { x, y } : board.ball,
      lastMovedPlayerId: selected.id,
      selectedPlayerId: solved ? null : selected.id,
      solved,
      successChance: board.successChance * dodgeChance * rushChance * boneHeadChance
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

    // Compute probability before mutating players (passer must still be on the ball).
    const passerOrig = board.players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    const passChance = passerOrig
      ? this.engine.passProbability(board, passerOrig, target)
      : 1;
    const passerBoneHead = passerOrig ? this.boneHeadChance(passerOrig) : 1;

    const players = board.players.map((p) => ({ ...p }));

    // Deactivate the passer (the player currently standing on the ball).
    const passer = players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    if (passer) {
      passer.activated = true;
    }

    const solved = board.puzzleType === 'score' && target.x === 0;

    boardSignal.set({
      ...board,
      players,
      ball: { x: target.x, y: target.y },
      passUsed: true,
      selectedPlayerId: null,
      solved,
      successChance: board.successChance * passChance * passerBoneHead
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
    const players = board.players.map((p) => ({ ...p }));

    const carrier = players.find((p) => p.x === board.ball.x && p.y === board.ball.y);
    if (carrier) {
      carrier.activated = true;
    }

    const catchChance = this.engine.handoffProbability(board, target);
    const carrierBoneHead = carrierOrig ? this.boneHeadChance(carrierOrig) : 1;
    const solved = board.puzzleType === 'score' && target.x === 0;

    boardSignal.set({
      ...board,
      players,
      ball: { x: target.x, y: target.y },
      handoffUsed: true,
      selectedPlayerId: null,
      solved,
      successChance: board.successChance * catchChance * carrierBoneHead
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

    // Track the ball carrier's position before any changes.
    const carrier = players.find((p) => p.x === board.ball.x && p.y === board.ball.y) ?? null;

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
        // Bone Head: fold in the 2+ roll chance if this is the attacker's first action.
        blockChance *= this.boneHeadChance(attacker);
        attacker.movementLeft = Math.max(0, attacker.movementLeft - 1);
        attacker.hasMoved = true;
      }
    }

    // Mark the original defender as prone on Stumble or Pow results.
    if (knocksDown && defenderId) {
      const defender = players.find((p) => p.id === defenderId);
      if (defender) {
        defender.prone = true;
      }
    }

    // Determine ball position before possibly removing the carrier.
    let ball = carrier ? { x: carrier.x, y: carrier.y } : board.ball;

    // Surf win condition: away player pushed off the pitch.
    let solved = false;
    if (removePlayerId) {
      const playerToRemove = players.find((p) => p.id === removePlayerId);
      if (playerToRemove && playerToRemove.team === 'away' && board.puzzleType === 'surf') {
        solved = true;
      }
      // If the removed player was carrying the ball, the ball leaves the pitch too.
      if (carrier && removePlayerId === carrier.id) {
        ball = { x: -1, y: -1 };
      }
      // Remove the player from the board.
      const idx = players.findIndex((p) => p.id === removePlayerId);
      if (idx >= 0) players.splice(idx, 1);
    }

    boardSignal.set({ ...board, players, ball, solved, successChance: board.successChance * blockChance });
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
    if (attacker) {
      attacker.movementLeft = Math.max(0, attacker.movementLeft - 1);
      attacker.hasMoved = true;
    }

    const defender = players.find((p) => p.id === defenderId);
    if (defender) {
      defender.prone = true;
    }

    boardSignal.set({ ...board, players, successChance: board.successChance * blockChance });
  }

  private hasSkill(player: WorkingPlayer, skill: string): boolean {
    const target = skill.toLowerCase().replace(/[^a-z]/g, '');
    return player.skills.some((s) => s.toLowerCase().replace(/[^a-z]/g, '') === target);
  }

  /**
   * Returns 5/6 if the player has Bone Head and hasn't acted yet this puzzle
   * (i.e. the Bone Head 2+ roll is still pending), otherwise 1.
   */
  private boneHeadChance(player: WorkingPlayer): number {
    return (!player.hasMoved && this.hasSkill(player, 'Bone Head')) ? 5 / 6 : 1;
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
          activated: player.activated,
          movementLeft: player.characteristics.movement,
          rushLeft: hasSprint ? 3 : 2,
          hasMoved: false,
          sureFeetUsed: false,
          prone: false
        };
      }),
      selectedPlayerId: null,
      lastMovedPlayerId: null,
      solved: false,
      passUsed: false,
      handoffUsed: false,
      successChance: 1
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
