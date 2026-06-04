import { Injectable } from '@angular/core';
import type { WorkingBoard, WorkingPlayer } from './puzzle-session.service';

export interface BoardCell {
  x: number;
  y: number;
  player: WorkingPlayer | null;
  hasBall: boolean;
  isSelected: boolean;
  isMoveTarget: boolean;
  requiresDodge: boolean;
  requiresRush: boolean;
}

export type ActionId =
  | 'block'
  | 'jump'
  | 'activate'
  | 'pass'
  | 'handoff'
  | 'throw'
  | 'pushback'
  | 'stumble'
  | 'pow'
  | 'bothdown';

export interface ActionOption {
  id: ActionId;
  label: string;
  kind: 'primary' | 'opponent';
}

export interface PushDirection {
  dx: number;
  dy: number;
}

export interface PushSquare {
  x: number;
  y: number;
  occupantId: string | null;
}

/** Outcome of clicking a board cell, decided by the engine and applied by the caller. */
export type CellClickOutcome =
  | { type: 'none' }
  | { type: 'select'; playerId: string }
  | { type: 'menu'; target: WorkingPlayer }
  | { type: 'move'; x: number; y: number };

/**
 * Pure derivations and rules for the puzzle board: turning the working board into
 * renderable cells, deciding what a click means, and building the contextual
 * action menu. Holds no state — all inputs are passed in.
 */
@Injectable({ providedIn: 'root' })
export class PuzzleEngineService {
  /** Build the flat list of renderable cells (with selection / move / dodge hints). */
  buildCells(board: WorkingBoard): BoardCell[] {
    const selected = board.players.find((p) => p.id === board.selectedPlayerId) ?? null;

    // A dodge is required for every move when the selected player currently
    // stands adjacent to an opposition player (i.e. inside a tackle zone).
    // Prone players exert no tackle zone.
    const selectedInTackleZone =
      !!selected &&
      board.players.some(
        (p) => p.team === 'away' && !p.prone && this.isAdjacent(p.x, p.y, selected.x, selected.y)
      );

    const cells: BoardCell[] = [];

    for (let x = 0; x < board.rows; x++) {
      for (let y = 0; y < board.cols; y++) {
        const player = board.players.find((p) => p.x === x && p.y === y) ?? null;
        const occupied = player !== null;
        const adjacent = !!selected && this.isAdjacent(x, y, selected.x, selected.y);

        const canMove   = !!selected && !occupied && adjacent && selected.movementLeft > 0;
        const canRush   = !!selected && !occupied && adjacent
                          && selected.movementLeft === 0 && selected.rushLeft > 0;
        const isMoveTarget = canMove || canRush;

        cells.push({
          x,
          y,
          player,
          hasBall: board.ball.x === x && board.ball.y === y,
          isSelected: !!selected && selected.id === player?.id,
          isMoveTarget,
          requiresDodge: isMoveTarget && selectedInTackleZone,
          requiresRush: canRush
        });
      }
    }

    return cells;
  }

  /** Decide what clicking a cell should do, given the currently selected player. */
  resolveCellClick(
    board: WorkingBoard,
    cell: BoardCell,
    selected: WorkingPlayer | null
  ): CellClickOutcome {
    const player = cell.player;

    if (player) {
      if (player.team === 'away') {
        return selected ? { type: 'menu', target: player } : { type: 'none' };
      }

      // Friendly player clicked while another friendly is active → menu (if it has options).
      if (selected && selected.id !== player.id) {
        const options = this.friendlyOptions(board, selected, player);
        return options.length > 0 ? { type: 'menu', target: player } : { type: 'none' };
      }

      // Clicking the active player again (or with none active) toggles selection.
      if (!player.activated) {
        return { type: 'select', playerId: player.id };
      }
      return { type: 'none' };
    }

    if (cell.isMoveTarget) {
      return { type: 'move', x: cell.x, y: cell.y };
    }

    return { type: 'none' };
  }

  /** Title shown above the action menu. */
  actionTitle(target: WorkingPlayer | null): string {
    if (!target) {
      return '';
    }
    return target.team === 'away' ? `vs ${target.name}` : target.name;
  }

  /** Context-aware options for the action target (Cancel is added by the view). */
  actionOptions(
    board: WorkingBoard,
    selected: WorkingPlayer | null,
    target: WorkingPlayer | null
  ): ActionOption[] {
    if (!selected || !target) {
      return [];
    }

    if (target.team === 'away') {
      const options: ActionOption[] = [];
      // A prone player is already down — they cannot be blocked again.
      if (!target.prone) {
        options.push({ id: 'block', label: 'Block', kind: 'opponent' });
      }
      // Jumping over a standing player requires the Leap skill.
      if (target.prone || this.hasSkill(selected, 'Leap')) {
        options.push({ id: 'jump', label: 'Jump over', kind: 'opponent' });
      }
      return options;
    }

    return this.friendlyOptions(board, selected, target);
  }

  /**
   * Options for a friendly target. Actions only apply to a "deactivated"
   * (not-yet-activated) team-mate:
   *  - Activate player: take control of that team-mate.
   *  - Pass: when the active player is holding the ball.
   *  - Throw team-mate: when adjacent and the Throw Team-Mate / Right Stuff
   *    skill pair is present.
   * An already-activated team-mate offers no actions.
   */
  private friendlyOptions(
    board: WorkingBoard,
    selected: WorkingPlayer,
    target: WorkingPlayer
  ): ActionOption[] {
    const options: ActionOption[] = [];

    // Activate is only offered for players not yet activated.
    if (!target.activated) {
      options.push({ id: 'activate', label: 'Activate player', kind: 'primary' });
    }

    const carriesBall = board.ball.x === selected.x && board.ball.y === selected.y;
    const adjacent = this.isAdjacent(selected.x, selected.y, target.x, target.y);

    if (carriesBall && !board.passUsed) {
      options.push({ id: 'pass', label: 'Pass', kind: 'primary' });
    }

    // Hand off is available to an adjacent team-mate, once per puzzle.
    if (carriesBall && adjacent && !board.handoffUsed) {
      options.push({ id: 'handoff', label: 'Hand off', kind: 'primary' });
    }

    if (
      adjacent &&
      this.hasSkill(selected, 'Throw Team-Mate') &&
      this.hasSkill(target, 'Right Stuff')
    ) {
      options.push({ id: 'throw', label: 'Throw team-mate', kind: 'primary' });
    }

    return options;
  }

  /**
   * Probability (0..1) that a block with `result` as the minimum desired
   * outcome completes without the attacker being knocked down (turnover).
   *
   * Accounts for:
   *  - Strength comparison → dice count and who picks the result
   *  - Offensive / defensive assists (Guard, Defensive)
   *  - Horns (+1 ST on a Blitz when attacker hasMoved)
   *  - Dauntless (probabilistic ST equalisation)
   *  - Block / Wrestle / Brawler (attacker skills affecting Both Down)
   *  - Dodge (defender skill converting Stumbles to Pushback)
   */
  blockProbability(
    board: WorkingBoard,
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    result: 'push' | 'stumble' | 'pow' | 'bothdown'
  ): number {
    const { attackerSt, defenderSt } = this.effectiveStrengths(board, attacker, defender);

    // Dauntless: roll 1D6 + own base ST; if > defenderSt, treat attacker ST as defenderSt.
    if (attackerSt < defenderSt && this.hasSkill(attacker, 'Dauntless')) {
      const needed = defenderSt - attacker.characteristics.strength + 1;
      const pDauntless = needed <= 1 ? 1 : needed > 6 ? 0 : (7 - needed) / 6;
      const pSuccess = this.blockProbabilityForSts(attacker, defender, result, defenderSt, defenderSt);
      const pFail    = this.blockProbabilityForSts(attacker, defender, result, attackerSt, defenderSt);
      return pDauntless * pSuccess + (1 - pDauntless) * pFail;
    }

    return this.blockProbabilityForSts(attacker, defender, result, attackerSt, defenderSt);
  }

  /**
   * Compute effective attacker and defender Strength values, adding:
   *  - Horns (+1 for the attacker when blitzing, i.e. hasMoved is true)
   *  - Offensive assists (attacker teammates adjacent to the defender,
   *    not marked — or Guard unless negated by Defensive)
   *  - Defensive assists (defender teammates adjacent to the defender,
   *    not marked — or Guard unless negated by Defensive)
   */
  private effectiveStrengths(
    board: WorkingBoard,
    attacker: WorkingPlayer,
    defender: WorkingPlayer
  ): { attackerSt: number; defenderSt: number } {
    let aSt = attacker.characteristics.strength;
    let dSt = defender.characteristics.strength;

    // Horns gives +1 ST on a Blitz (player moved before blocking).
    if (attacker.hasMoved && this.hasSkill(attacker, 'Horns')) {
      aSt += 1;
    }

    const homeTeam = attacker.team;
    const awayTeam = defender.team;
    const all = board.players;

    // Offensive assists
    for (const p of all) {
      if (p.id === attacker.id || p.team !== homeTeam) continue;
      if (!this.isAdjacent(p.x, p.y, defender.x, defender.y)) continue;
      const markers = all.filter(e => e.team === awayTeam && this.isAdjacent(e.x, e.y, p.x, p.y));
      if (markers.length === 0) {
        aSt += 1;
      } else if (this.hasSkill(p, 'Guard')) {
        // Guard lets you assist while marked, unless an adjacent enemy has Defensive.
        if (!markers.some(e => this.hasSkill(e, 'Defensive'))) aSt += 1;
      }
    }

    // Defensive assists
    for (const p of all) {
      if (p.id === defender.id || p.team !== awayTeam) continue;
      if (!this.isAdjacent(p.x, p.y, defender.x, defender.y)) continue;
      const markers = all.filter(f => f.team === homeTeam && this.isAdjacent(f.x, f.y, p.x, p.y));
      if (markers.length === 0) {
        dSt += 1;
      } else if (this.hasSkill(p, 'Guard')) {
        if (!markers.some(f => this.hasSkill(f, 'Defensive'))) dSt += 1;
      }
    }

    return { attackerSt: aSt, defenderSt: dSt };
  }

  private blockProbabilityForSts(
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    result: 'push' | 'stumble' | 'pow' | 'bothdown',
    aSt: number,
    dSt: number
  ): number {
    let diceCount: number;
    let attackerChooses: boolean;

    if (aSt === dSt) {
      diceCount = 1; attackerChooses = true;
    } else if (aSt > dSt) {
      diceCount = aSt >= dSt * 2 ? 3 : 2; attackerChooses = true;
    } else {
      diceCount = dSt >= aSt * 2 ? 3 : 2; attackerChooses = false;
    }

    // Both Down: attacker wants specifically the Both Down face (P = 1/6 per die).
    if (result === 'bothdown') {
      const pBD = 1 / 6;
      if (diceCount === 1) return pBD;
      if (attackerChooses) return 1 - Math.pow(1 - pBD, diceCount);
      return Math.pow(pBD, diceCount);
    }

    // p1 = probability a single die directly achieves result (no Brawler reroll included).
    const p1 = this.pSingleDieAchieve(attacker, defender, result);

    // Brawler only matters when Both Down is a failure for the desired result.
    const minLevel   = result === 'push' ? 1 : result === 'stumble' ? 2 : 3;
    const hasBlock   = this.hasSkill(attacker, 'Block');
    const hasWrestle = this.hasSkill(attacker, 'Wrestle');
    const levelBD    = hasBlock ? 3 : hasWrestle ? 1 : -1;
    const brawlerActive = this.hasSkill(attacker, 'Brawler') && levelBD < minLevel;

    if (!brawlerActive) {
      if (diceCount === 1)  return p1;
      if (attackerChooses)  return 1 - Math.pow(1 - p1, diceCount);
      return Math.pow(p1, diceCount);
    }

    const pBD    = 1 / 6;
    const pSkull = 1 - p1 - pBD;

    if (attackerChooses) {
      let pFail = 0;
      for (let k = 0; k <= diceCount; k++) {
        const pFailGivenK = k === 0 ? 1 : (1 - p1);
        pFail += this.binomCoeff(diceCount, k)
          * Math.pow(pSkull, diceCount - k)
          * Math.pow(pBD, k)
          * pFailGivenK;
      }
      return Math.min(1, 1 - pFail);
    } else {
      return Math.min(1, Math.pow(p1, diceCount) * (1 + diceCount * pBD));
    }
  }

  /**
   * Probability that one block die directly achieves at least `result` without
   * knocking the attacker down. Does NOT include any Brawler reroll — that is
   * handled at the multi-dice level in blockProbabilityForSts.
   *
   * Die faces:
   *   Attacker Down  : always a turnover
   *   Both Down      : level -1 (normal) / 1 (Wrestle) / 3 (Block)
   *   Def. Stumbles  : level 2 normally; 1 if defender has Dodge
   *   Pow            : level 3
   *   Pushback × 2   : level 1
   */
  private pSingleDieAchieve(
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    result: 'push' | 'stumble' | 'pow'
  ): number {
    const minLevel = result === 'push' ? 1 : result === 'stumble' ? 2 : 3;

    const hasBlock      = this.hasSkill(attacker, 'Block');
    const hasWrestle    = this.hasSkill(attacker, 'Wrestle');
    const hasJuggernaut = this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved;
    const defDodge      = this.hasSkill(defender, 'Dodge');

    const levelBD = hasBlock ? 3 : hasWrestle ? 1 : hasJuggernaut ? 1 : -1;
    const levelDS = defDodge ? 1 : 2;

    let p = 0;
    if (levelBD >= minLevel) p += 1 / 6;
    if (levelDS >= minLevel) p += 1 / 6;
    if (3        >= minLevel) p += 1 / 6;
    if (1        >= minLevel) p += 2 / 6;

    return p;
  }

  /** Binomial coefficient C(n, k). */
  private binomCoeff(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
  }

  /**
   * Block result options shown after choosing Block.
   *
   *  - Push Back (always): any result that moves the defender without knockdown.
   *  - Both Down (when safe): attacker has Block / Wrestle / Juggernaut on Blitz.
   *  - Stumble (when relevant): only offered when defender has no Dodge, or attacker
   *    has Tackle (otherwise Dodge converts Stumble into a Push).
   *  - Pow (always): the strongest single knockdown face.
   *
   * Options are multi-selectable; use blockProbabilityMulti for the combined chance.
   */
  blockOptions(attacker: WorkingPlayer | null, defender: WorkingPlayer | null): ActionOption[] {
    if (!attacker || !defender) {
      return [];
    }

    const options: ActionOption[] = [{ id: 'pushback', label: 'Push Back', kind: 'opponent' }];

    const hasSafeBD =
      this.hasSkill(attacker, 'Block') ||
      this.hasSkill(attacker, 'Wrestle') ||
      (this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved);
    if (hasSafeBD) {
      options.push({ id: 'bothdown', label: 'Both Down', kind: 'opponent' });
    }

    if (!this.hasSkill(defender, 'Dodge') || this.hasSkill(attacker, 'Tackle')) {
      options.push({ id: 'stumble', label: 'Stumble', kind: 'opponent' });
    }

    options.push({ id: 'pow', label: 'Pow', kind: 'opponent' });
    return options;
  }

  /**
   * Combined probability (0..1) of achieving ANY of the selected block results.
   *
   * Each option maps to specific, mutually exclusive die faces:
   *  - pushback : Pushback ×2 + Stumble-when-Dodge + BD-when-Juggernaut
   *  - bothdown : Both Down face (only when safe)
   *  - stumble  : Stumble face when it causes knockdown (!Dodge || Tackle)
   *  - pow      : Pow face
   *
   * Multi-dice and Brawler reroll are handled identically to blockProbability.
   */
  blockProbabilityMulti(
    board: WorkingBoard,
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    results: ActionId[]
  ): number {
    if (results.length === 0) return 0;
    const { attackerSt, defenderSt } = this.effectiveStrengths(board, attacker, defender);

    if (attackerSt < defenderSt && this.hasSkill(attacker, 'Dauntless')) {
      const needed = defenderSt - attacker.characteristics.strength + 1;
      const pDauntless = needed <= 1 ? 1 : needed > 6 ? 0 : (7 - needed) / 6;
      const pSuccess = this.blockProbabilityMultiForSts(attacker, defender, results, defenderSt, defenderSt);
      const pFail    = this.blockProbabilityMultiForSts(attacker, defender, results, attackerSt,  defenderSt);
      return pDauntless * pSuccess + (1 - pDauntless) * pFail;
    }

    return this.blockProbabilityMultiForSts(attacker, defender, results, attackerSt, defenderSt);
  }

  private blockProbabilityMultiForSts(
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    results: ActionId[],
    aSt: number,
    dSt: number
  ): number {
    let diceCount: number;
    let attackerChooses: boolean;

    if (aSt === dSt) {
      diceCount = 1; attackerChooses = true;
    } else if (aSt > dSt) {
      diceCount = aSt >= dSt * 2 ? 3 : 2; attackerChooses = true;
    } else {
      diceCount = dSt >= aSt * 2 ? 3 : 2; attackerChooses = false;
    }

    const selected = new Set(results);
    const hasSafeBD =
      this.hasSkill(attacker, 'Block') ||
      this.hasSkill(attacker, 'Wrestle') ||
      (this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved);

    const pHit = this.pSingleDieHitsAny(attacker, defender, selected);
    // Brawler: reroll BD face when BD is a turnover (no safe-BD skill).
    const brawlerActive = this.hasSkill(attacker, 'Brawler') && !hasSafeBD;

    if (!brawlerActive) {
      if (diceCount === 1) return pHit;
      if (attackerChooses) return 1 - Math.pow(1 - pHit, diceCount);
      return Math.pow(pHit, diceCount);
    }

    // With Brawler: BD face (1/6) is a failure that gets one reroll.
    const pBD    = 1 / 6;
    const pSkull = Math.max(0, 1 - pHit - pBD); // all other failure faces

    if (attackerChooses) {
      let pFail = 0;
      for (let k = 0; k <= diceCount; k++) {
        const pFailGivenK = k === 0 ? 1 : (1 - pHit);
        pFail += this.binomCoeff(diceCount, k)
          * Math.pow(pSkull, diceCount - k)
          * Math.pow(pBD, k)
          * pFailGivenK;
      }
      return Math.min(1, 1 - pFail);
    } else {
      return Math.min(1, Math.pow(pHit, diceCount) * (1 + diceCount * pBD));
    }
  }

  /**
   * Probability that a single block die matches any face in `selected`.
   * Each option corresponds to specific, mutually exclusive die faces:
   *
   *  pushback : Pushback ×2 faces; Stumble face if Dodge converts it to push;
   *             Both Down face if Juggernaut converts it to push (and bothdown not selected).
   *  stumble  : Stumble face when it produces a knockdown (!Dodge || Tackle).
   *  pow      : Pow face.
   *  bothdown : Both Down face when safe (Block / Wrestle / Juggernaut on Blitz).
   */
  private pSingleDieHitsAny(
    attacker: WorkingPlayer,
    defender: WorkingPlayer,
    selected: Set<ActionId>
  ): number {
    const defDodge  = this.hasSkill(defender, 'Dodge');
    const attTackle = this.hasSkill(attacker, 'Tackle');
    const hasBlock  = this.hasSkill(attacker, 'Block');
    const hasWrestle= this.hasSkill(attacker, 'Wrestle');
    const hasJugg   = this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved;
    const hasSafeBD = hasBlock || hasWrestle || hasJugg;

    let p = 0;

    // Pushback × 2 faces
    if (selected.has('pushback')) p += 2 / 6;

    // Stumble face: becomes knockdown if !Dodge || Tackle; otherwise Dodge converts to push
    const stumbleIsKnockdown = !defDodge || attTackle;
    if (stumbleIsKnockdown) {
      if (selected.has('stumble')) p += 1 / 6;
    } else {
      if (selected.has('pushback')) p += 1 / 6; // Dodge converts Stumble → push
    }

    // Pow face (always knockdown)
    if (selected.has('pow')) p += 1 / 6;

    // Both Down face
    if (hasSafeBD) {
      if (selected.has('bothdown')) {
        p += 1 / 6;
      } else if (hasJugg && selected.has('pushback')) {
        // Juggernaut converts BD to push; counts for pushback if bothdown not selected
        p += 1 / 6;
      }
    }

    return p;
  }

  /** The direction a defender is pushed: directly away from the blocker. */
  pushDirection(blocker: WorkingPlayer, defender: WorkingPlayer): PushDirection {
    return {
      dx: Math.sign(defender.x - blocker.x),
      dy: Math.sign(defender.y - blocker.y)
    };
  }

  /**
   * Returns true when at least one of the three push squares for (x, y) in
   * direction `dir` lies outside the board — meaning the pushed player can be
   * sent off the pitch.
   */
  hasPushOutOfBounds(board: WorkingBoard, x: number, y: number, dir: PushDirection): boolean {
    return this.pushSquares(dir, x, y).some(
      (s) => s.x < 0 || s.y < 0 || s.x >= board.rows || s.y >= board.cols
    );
  }

  /**
   * The pushback destination squares for a player at (x, y) in the given push
   * direction. Off-board squares are dropped. If at least one square is empty,
   * only the empty ones are offered; when all are occupied they are all returned
   * so the caller can resolve a chain push.
   */
  pushOptions(board: WorkingBoard, x: number, y: number, dir: PushDirection): PushSquare[] {
    const squares: PushSquare[] = this.pushSquares(dir, x, y)
      .filter((s) => s.x >= 0 && s.y >= 0 && s.x < board.rows && s.y < board.cols)
      .map((s) => ({
        x: s.x,
        y: s.y,
        occupantId: board.players.find((p) => p.x === s.x && p.y === s.y)?.id ?? null
      }));

    const empties = squares.filter((s) => s.occupantId === null);
    return empties.length > 0 ? empties : squares;
  }

  /**
   * Probability (0..1) that moving `mover` to (tx, ty) succeeds. A free move
   * (white circle) is 1.0; a move out of an enemy tackle zone requires a Dodge
   * roll whose chance depends on Agility, tackle-zone modifiers and skills.
   */
  dodgeProbability(board: WorkingBoard, mover: WorkingPlayer, tx: number, ty: number): number {
    // Prone players exert no tackle zone.
    const leavingEnemies = board.players.filter(
      (p) => p.team === 'away' && !p.prone && this.isAdjacent(p.x, p.y, mover.x, mover.y)
    );
    if (leavingEnemies.length === 0) {
      return 1;
    }

    const targetTackleZones = board.players.filter(
      (p) => p.team === 'away' && !p.prone && this.isAdjacent(p.x, p.y, tx, ty)
    ).length;

    const stunty = this.hasSkill(mover, 'Stunty');
    const titchy = this.hasSkill(mover, 'Titchy');
    const twoHeads = this.hasSkill(mover, 'Two Heads');
    const prehensileTail = leavingEnemies.some((e) => this.hasSkill(e, 'Prehensile Tail'));

    // Stunty / Titchy ignore tackle-zone modifiers, unless negated by Prehensile Tail.
    const ignoreTackleZones = (stunty || titchy) && !prehensileTail;

    let modifier = ignoreTackleZones ? 0 : -targetTackleZones;
    if (prehensileTail) modifier -= 1;
    if (leavingEnemies.some((e) => this.hasSkill(e, 'Diving Tackle'))) modifier -= 2;
    if (titchy) modifier += 1;
    if (twoHeads) modifier += 1;

    // Break Tackle lets the player use the better of Agility / Strength as the target.
    let target = mover.characteristics.agility;
    if (this.hasSkill(mover, 'Break Tackle')) {
      target = Math.min(target, mover.characteristics.strength);
    }

    let probability = this.rollSuccess(target - modifier);

    // Dodge skill grants a reroll, unless an adjacent enemy with Tackle prevents it.
    const tacklePrevents = leavingEnemies.some((e) => this.hasSkill(e, 'Tackle'));
    if (this.hasSkill(mover, 'Dodge') && !tacklePrevents) {
      probability = 1 - (1 - probability) * (1 - probability);
    }

    return probability;
  }

  /**
   * Exact BB passing-range bands transcribed from the official ruler table,
   * indexed by [hi][lo] where hi = max(|dx|,|dy|) and lo = min(|dx|,|dy|).
   * The table is symmetric in dx/dy, so only the triangular hi ≥ lo half is stored.
   *
   * Codes: Q = Quick, S = Short, L = Long, B = Long Bomb, X = out of range.
   * Row `hi` holds entries for lo = 0 .. hi.
   */
  private static readonly PASS_BAND_TABLE: readonly string[] = [
    'Q',              // hi=0
    'QQ',             // hi=1
    'QQQ',            // hi=2
    'QQSS',           // hi=3
    'SSSSS',          // hi=4
    'SSSSSL',         // hi=5
    'SSSSLLL',        // hi=6
    'LLLLLLLL',       // hi=7
    'LLLLLLLBB',      // hi=8
    'LLLLLBBBBB',     // hi=9
    'LLLBBBBBBXX',    // hi=10
    'BBBBBBBXXXXX',   // hi=11
    'BBBBBXXXXXXXX',  // hi=12
    'BBXXXXXXXXXXXX'  // hi=13
  ];

  /** Resolve the passing-range band for an offset of (dx, dy) squares. */
  private passBand(dx: number, dy: number): 'quick' | 'short' | 'long' | 'bomb' | 'out' {
    const hi = Math.max(dx, dy);
    const lo = Math.min(dx, dy);
    if (hi > 13 || hi < 0) return 'out';

    switch (PuzzleEngineService.PASS_BAND_TABLE[hi][lo]) {
      case 'Q': return 'quick';
      case 'S': return 'short';
      case 'L': return 'long';
      case 'B': return 'bomb';
      default:  return 'out';
    }
  }

  /**
   * Probability (0..1) that a pass from `passer` to `receiver` completes without
   * causing a turnover. Models the throw (Passing test) and the catch; interceptions
   * are not modelled.
   *
   * Throw modifiers:
   *  - Distance band (exact BB ruler lookup, see PASS_BAND_TABLE):
   *      Quick Pass +0, Short Pass −1, Long Pass −2, Long Bomb −3.
   *    Out-of-range targets cannot be thrown to → probability 0.
   *  - −1 per enemy Tackle Zone on passer (ignored with Nerves of Steel)
   *  - −1 per enemy with Disturbing Presence within 3 squares of passer
   *  - Cannoneer: +1 on Long Pass or Long Bomb
   *  - Pass skill: free reroll on a failed throw
   *
   * Catch modifiers:
   *  - −1 per enemy Tackle Zone on receiver
   *  - −1 per enemy with Disturbing Presence within 3 squares of receiver
   *  - Extra Arms: +1; Diving Catch: +1 (when targeted directly)
   *  - Catch / Monstrous Mouth: free reroll on a failed catch
   */
  passProbability(board: WorkingBoard, passer: WorkingPlayer, receiver: WorkingPlayer): number {
    const dx = Math.abs(receiver.x - passer.x);
    const dy = Math.abs(receiver.y - passer.y);
    const band = this.passBand(dx, dy);
    if (band === 'out') {
      return 0; // target is out of throwing range
    }
    const distMod    = band === 'quick' ? 0 : band === 'short' ? -1 : band === 'long' ? -2 : -3;
    const isLongPlus = band === 'long' || band === 'bomb';

    // --- Throw ---
    const tzOnPasser = board.players.filter(
      (p) => p.team !== passer.team && !p.prone && this.isAdjacent(p.x, p.y, passer.x, passer.y)
    ).length;
    const dpOnPasser = board.players.filter(
      (p) => p.team !== passer.team
        && this.hasSkill(p, 'Disturbing Presence')
        && Math.max(Math.abs(p.x - passer.x), Math.abs(p.y - passer.y)) <= 3
    ).length;

    let throwMod = distMod;
    if (!this.hasSkill(passer, 'Nerves of Steel')) throwMod -= tzOnPasser;
    if (isLongPlus && this.hasSkill(passer, 'Cannoneer'))  throwMod += 1;
    throwMod -= dpOnPasser;

    let throwProb = this.rollSuccess(passer.characteristics.passing - throwMod);
    if (this.hasSkill(passer, 'Pass')) {
      throwProb = 1 - (1 - throwProb) * (1 - throwProb);
    }

    // --- Catch ---
    const tzOnReceiver = board.players.filter(
      (p) => p.team !== receiver.team && !p.prone && this.isAdjacent(p.x, p.y, receiver.x, receiver.y)
    ).length;
    const dpOnReceiver = board.players.filter(
      (p) => p.team !== receiver.team
        && this.hasSkill(p, 'Disturbing Presence')
        && Math.max(Math.abs(p.x - receiver.x), Math.abs(p.y - receiver.y)) <= 3
    ).length;

    let catchMod = -tzOnReceiver - dpOnReceiver;
    if (this.hasSkill(receiver, 'Extra Arms'))   catchMod += 1;
    if (this.hasSkill(receiver, 'Diving Catch')) catchMod += 1;

    let catchProb = this.rollSuccess(receiver.characteristics.agility - catchMod);
    if (this.hasSkill(receiver, 'Catch') || this.hasSkill(receiver, 'Monstrous Mouth')) {
      catchProb = 1 - (1 - catchProb) * (1 - catchProb);
    }

    return throwProb * catchProb;
  }

  /**
   * Probability (0..1) that a single Rush square succeeds.
   *
   * Base roll: 2+ (5/6).
   * Sure Feet grants one free reroll per activation (tracked via sureFeetUsed).
   */
  rushProbability(board: WorkingBoard, rusher: WorkingPlayer): number {
    let probability = this.rollSuccess(2);

    // Sure Feet grants a reroll if it hasn't been used yet this activation.
    if (this.hasSkill(rusher, 'Sure Feet') && !rusher.sureFeetUsed) {
      probability = 1 - (1 - probability) * (1 - probability);
    }

    return probability;
  }

  /**
   * Probability (0..1) that a hand-off catch succeeds.
   *
   * The receiver makes an Agility test (Catch roll) modified by:
   *  - -1 per enemy Tackle Zone marking the receiver (unless Nerves of Steel)
   *  - +1 if the receiver has Extra Arms
   *
   * Catch skill: grants a free reroll on a failed Catch roll.
   */
  handoffProbability(board: WorkingBoard, receiver: WorkingPlayer): number {
    const enemyTackleZones = board.players.filter(
      (p) => p.team !== receiver.team && this.isAdjacent(p.x, p.y, receiver.x, receiver.y)
    ).length;

    const nervesOfSteel = this.hasSkill(receiver, 'Nerves of Steel');
    const extraArms     = this.hasSkill(receiver, 'Extra Arms');
    const hasCatch      = this.hasSkill(receiver, 'Catch');

    let modifier = 0;
    if (!nervesOfSteel) {
      modifier -= enemyTackleZones;
    }
    if (extraArms) {
      modifier += 1;
    }

    const target = receiver.characteristics.agility;
    let probability = this.rollSuccess(target - modifier);

    // Catch grants a free reroll on failure.
    if (hasCatch) {
      probability = 1 - (1 - probability) * (1 - probability);
    }

    return probability;
  }

  /** Chance a single d6 meets `needed` (natural 1 always fails, natural 6 always succeeds). */
  private rollSuccess(needed: number): number {
    let successes = 0;
    for (let roll = 1; roll <= 6; roll++) {
      if (roll === 1) continue; // always a failure
      if (roll === 6 || roll >= needed) successes++; // 6 always succeeds
    }
    return successes / 6;
  }

  private pushSquares(dir: PushDirection, x: number, y: number): { x: number; y: number }[] {
    const { dx, dy } = dir;
    let rel: [number, number][];

    if (dx !== 0 && dy !== 0) {
      rel = [[dx, dy], [dx, 0], [0, dy]]; // diagonal block
    } else if (dx === 0) {
      rel = [[-1, dy], [0, dy], [1, dy]]; // vertical block
    } else {
      rel = [[dx, -1], [dx, 0], [dx, 1]]; // horizontal block
    }

    return rel.map(([rx, ry]) => ({ x: x + rx, y: y + ry }));
  }

  private isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1;
  }

  private hasSkill(player: WorkingPlayer, skill: string): boolean {
    const target = this.normalizeSkill(skill);
    return player.skills.some((s) => this.normalizeSkill(s) === target);
  }

  private normalizeSkill(skill: string): string {
    return skill.toLowerCase().replace(/[^a-z]/g, '');
  }
}
