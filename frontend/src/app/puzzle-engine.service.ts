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
  | 'vomit'
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
    // Prone players — and Titchy players, for dodging purposes — exert no tackle zone.
    const selectedInTackleZone =
      !!selected &&
      board.players.some(
        (p) => p.team === 'away' && !p.prone && !this.hasSkill(p, 'Titchy')
          && this.isAdjacent(p.x, p.y, selected.x, selected.y)
      );

    const cells: BoardCell[] = [];

    // A prone player must spend 3 movement standing up before its first step, so
    // its effective move budget is reduced accordingly (and it cannot move at all
    // when it lacks the 3 points needed to stand).
    const standUpCost = selected?.prone ? 3 : 0;
    const canStand = !!selected && (!selected.prone || selected.movementLeft >= standUpCost);
    const moveBudget = selected ? selected.movementLeft - standUpCost : 0;

    for (let x = 0; x < board.rows; x++) {
      for (let y = 0; y < board.cols; y++) {
        const player = board.players.find((p) => p.x === x && p.y === y) ?? null;
        const occupied = player !== null;
        const adjacent = !!selected && this.isAdjacent(x, y, selected.x, selected.y);

        const canMove   = !!selected && canStand && !occupied && adjacent && moveBudget > 0;
        const canRush   = !!selected && canStand && !occupied && adjacent
                          && moveBudget <= 0 && selected.rushLeft > 0;
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
        if (!selected) return { type: 'none' };
        const adjacent = this.isAdjacent(selected.x, selected.y, player.x, player.y);
        return adjacent ? { type: 'menu', target: player } : { type: 'none' };
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
      // A player who has already blocked this turn cannot block again (unless Frenzy).
      // A player who has already moved can only block if the team's Blitz is still
      // free OR already owned by this player (e.g. a Frenzy/Blitz continuation).
      // The acting player must be standing (a prone player must stand up first).
      const canFrenzyBlock = this.hasSkill(selected, 'Frenzy')
        && !selected.frenzyUsed
        && selected.hasBlocked;
      const blitzAvailable = board.blitzPlayerId === null || board.blitzPlayerId === selected.id;
      if (!selected.prone && !target.prone && (!selected.hasBlocked || canFrenzyBlock) && (!selected.hasMoved || blitzAvailable)) {
        options.push({ id: 'block', label: 'Block', kind: 'opponent' });
      }
      // Projectile Vomit: an alternative to a Block (also usable as a Blitz with movement).
      // Same activation gating as a Block, but it is not a Block so Frenzy/Wrestle etc.
      // do not interact with it; the player simply may not have already blocked/vomited.
      if (!selected.prone && !target.prone && this.hasSkill(selected, 'Projectile Vomit')
          && !selected.hasBlocked && (!selected.hasMoved || blitzAvailable)) {
        options.push({ id: 'vomit', label: 'Vomit', kind: 'opponent' });
      }
      // Jump Over: only over a Prone (or Stunned) player — or any player with the
      // Leap skill — and only when a valid landing exists and the cost is affordable.
      // A prone jumper must stand up first.
      if (!selected.prone && (target.prone || this.hasSkill(selected, 'Leap')) && this.canJumpOver(board, selected, target)) {
        options.push({ id: 'jump', label: 'Jump over', kind: 'opponent' });
      }
      return options;
    }

    return this.friendlyOptions(board, selected, target);
  }

  /**
   * Options for a friendly target:
   *  - Activate player: take control of a not-yet-activated team-mate.
   *  - Pass / Hand Off: when the active player holds the ball — the receiver may
   *    already have been activated (it does not need its own activation to catch).
   *  - Throw team-mate: when adjacent and the Throw Team-Mate / Right Stuff
   *    skill pair is present.
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

    // "My Ball": the carrier refuses to give the ball away — no Pass or Hand Off.
    const selfishCarrier = this.hasSkill(selected, 'My Ball');

    // A prone player must stand up before passing/handing off/throwing/jumping.
    const standing = !selected.prone;

    // A Pass / Hand Off may target an already-activated team-mate (the receiver
    // does not need their own activation to catch the ball).
    if (carriesBall && standing && !board.passUsed
        && !selected.hasBlocked
        && !selfishCarrier
        && selected.characteristics.passing > 0
        && target.characteristics.passing > 0) {
      options.push({ id: 'pass', label: 'Pass', kind: 'primary' });
    }

    // Hand off is available to an adjacent team-mate, once per puzzle.
    if (carriesBall && standing && adjacent && !board.handoffUsed
        && !selected.hasBlocked && !selfishCarrier && target.characteristics.passing > 0) {
      options.push({ id: 'handoff', label: 'Hand off', kind: 'primary' });
    }

    if (
      standing &&
      adjacent &&
      this.hasSkill(selected, 'Throw Team-Mate') &&
      this.hasSkill(target, 'Right Stuff')
    ) {
      options.push({ id: 'throw', label: 'Throw team-mate', kind: 'primary' });
    }

    // Jump Over: a prone team-mate can be jumped over, same rules as an opponent
    // (a valid landing must exist and the 2-square cost must be affordable).
    if (standing && target.prone && this.canJumpOver(board, selected, target)) {
      options.push({ id: 'jump', label: 'Jump over', kind: 'primary' });
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

    // Offensive assists: an attacker's team-mate adds +1 ST if it is adjacent to
    // the DEFENDER (the block target) and is not itself marked by a standing
    // opponent — ignoring the defender being blocked, who never prevents assists.
    for (const p of all) {
      if (p.id === attacker.id || p.team !== homeTeam || p.prone || p.eyeGouged) continue;
      if (!this.isAdjacent(p.x, p.y, defender.x, defender.y)) continue;
      const markers = all.filter(
        e => e.team === awayTeam && e.id !== defender.id && !e.prone && this.isAdjacent(e.x, e.y, p.x, p.y)
      );
      if (markers.length === 0) {
        aSt += 1;
      } else if (this.hasSkill(p, 'Guard')) {
        // Guard lets you assist while marked, unless an adjacent enemy has Defensive.
        if (!markers.some(e => this.hasSkill(e, 'Defensive'))) aSt += 1;
      }
    }

    // Defensive assists: a defender's team-mate adds +1 ST if it is adjacent to
    // the ATTACKER (the player making the block) and is not itself marked by a
    // standing opponent — ignoring the attacker, who never prevents assists.
    for (const p of all) {
      if (p.id === defender.id || p.team !== awayTeam || p.prone || p.eyeGouged) continue;
      if (!this.isAdjacent(p.x, p.y, attacker.x, attacker.y)) continue;
      const markers = all.filter(
        f => f.team === homeTeam && f.id !== attacker.id && !f.prone && this.isAdjacent(f.x, f.y, p.x, p.y)
      );
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
      diceCount = aSt > dSt * 2 ? 3 : 2; attackerChooses = true;
    } else {
      diceCount = dSt > aSt * 2 ? 3 : 2; attackerChooses = false;
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
    const brawlerActive = this.hasSkill(attacker, 'Brawler') && !attacker.hasMoved && levelBD < minLevel;

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
   *   Def. Stumbles  : level 2 normally; 1 if defender has Dodge and attacker no Tackle
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
    // Dodge only lowers the Stumble face to a push when the attacker has no Tackle.
    const defDodge      = this.hasSkill(defender, 'Dodge') && !this.hasSkill(attacker, 'Tackle');

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
   *    Extra Wrestle gating:
   *      · A Wrestle attacker is Placed Prone alongside the defender on a Both Down,
   *        so it is NOT offered while the attacker is the ball carrier.
   *      · A Wrestle defender drags the attacker down on a Both Down, so it is only
   *        offered against such a defender when the attacker also has Wrestle.
   *  - Stumble (always): the Defender Stumbles face. It knocks the defender down,
   *    unless the defender has Dodge and the attacker has no Tackle — in which case
   *    Dodge converts it into a plain push (handled by the probability/resolution).
   *  - Pow (always): the strongest single knockdown face.
   *
   * Options are multi-selectable; use blockProbabilityMulti for the combined chance.
   */
  blockOptions(
    board: WorkingBoard,
    attacker: WorkingPlayer | null,
    defender: WorkingPlayer | null
  ): ActionOption[] {
    if (!attacker || !defender) {
      return [];
    }

    const options: ActionOption[] = [{ id: 'pushback', label: 'Push Back', kind: 'opponent' }];

    const attackerWrestle = this.hasSkill(attacker, 'Wrestle');
    const defenderWrestle = this.hasSkill(defender, 'Wrestle');
    const attackerCarriesBall = board.ball.x === attacker.x && board.ball.y === attacker.y;

    let hasSafeBD =
      this.hasSkill(attacker, 'Block') ||
      attackerWrestle ||
      (this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved);

    // A Wrestle attacker goes Prone too on a Both Down — never offer it while they
    // are carrying the ball (they would be knocked down with the ball).
    if (attackerWrestle && attackerCarriesBall) {
      hasSafeBD = false;
    }

    // A Wrestle defender pulls the attacker down on a Both Down (negating Block);
    // only offer Both Down against them when the attacker also has Wrestle.
    if (defenderWrestle && !attackerWrestle) {
      hasSafeBD = false;
    }

    if (hasSafeBD) {
      options.push({ id: 'bothdown', label: 'Both Down', kind: 'opponent' });
    }

    // Stumble is always offered. When Dodge negates it (and the attacker has no
    // Tackle) it resolves as a push rather than a knockdown.
    options.push({ id: 'stumble', label: 'Stumble', kind: 'opponent' });

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
      diceCount = aSt > dSt * 2 ? 3 : 2; attackerChooses = true;
    } else {
      diceCount = dSt > aSt * 2 ? 3 : 2; attackerChooses = false;
    }

    const selected = new Set(results);
    const hasSafeBD =
      this.hasSkill(attacker, 'Block') ||
      this.hasSkill(attacker, 'Wrestle') ||
      (this.hasSkill(attacker, 'Juggernaut') && attacker.hasMoved);

    const pHit = this.pSingleDieHitsAny(attacker, defender, selected);
    // Brawler: reroll BD face when BD is a turnover (no safe-BD skill). Brawler may
    // only be used on a stationary Block, never as part of a Blitz (player moved).
    const brawlerActive = this.hasSkill(attacker, 'Brawler') && !attacker.hasMoved && !hasSafeBD;

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

    // Stumble face: a knockdown when !Dodge || Tackle; otherwise Dodge converts it
    // to a push. Either way it counts only when the user explicitly selected
    // Stumble — not selecting it is a deliberate choice that costs the 1/6 face.
    if (selected.has('stumble')) {
      p += 1 / 6;
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
   * Returns true when the pushed player at (x, y) in direction `dir` can be
   * sent off the pitch — i.e. at least one push square is outside the board AND
   * there are no empty in-bounds squares available.
   *
   * Out-of-bounds is only a legal choice when every in-bounds push square is
   * already occupied (all vacant squares happen to be off the pitch).  Whenever
   * at least one in-bounds square is free the attacker must push there instead.
   */
  hasPushOutOfBounds(board: WorkingBoard, x: number, y: number, dir: PushDirection): boolean {
    const all = this.pushSquares(dir, x, y);

    const hasOOB = all.some(
      (s) => s.x < 0 || s.y < 0 || s.x >= board.rows || s.y >= board.cols
    );
    if (!hasOOB) return false;

    // OOB is only offered when there are no empty in-bounds squares to push into.
    const emptyInBounds = all.filter(
      (s) =>
        s.x >= 0 && s.y >= 0 && s.x < board.rows && s.y < board.cols &&
        !board.players.some((p) => p.x === s.x && p.y === s.y)
    );
    return emptyInBounds.length === 0;
  }

  /**
   * The pushback destination squares for a player at (x, y) in the given push
   * direction. Off-board squares are dropped. If at least one square is empty,
   * only the empty ones are offered; when all are occupied they are all returned
   * so the caller can resolve a chain push.
   *
   * Squares occupied by an away-team player with Stand Firm are excluded —
   * they refuse to be pushed, so neither they nor the incoming player can go there.
   * (Home-team Stand Firm players remain in the list; the component prompts the user.)
   */
  pushOptions(board: WorkingBoard, x: number, y: number, dir: PushDirection): PushSquare[] {
    const squares: PushSquare[] = this.pushSquares(dir, x, y)
      .filter((s) => s.x >= 0 && s.y >= 0 && s.x < board.rows && s.y < board.cols)
      .map((s) => ({
        x: s.x,
        y: s.y,
        occupantId: board.players.find((p) => p.x === s.x && p.y === s.y)?.id ?? null
      }))
      // Away-team Stand Firm players refuse to be pushed — treat their square as a wall.
      .filter((s) => {
        if (s.occupantId === null) return true;
        const occ = board.players.find((p) => p.id === s.occupantId);
        return !(occ?.team === 'away' && this.hasSkill(occ, 'Stand Firm'));
      });

    const empties = squares.filter((s) => s.occupantId === null);
    return empties.length > 0 ? empties : squares;
  }

  /**
   * The Sidestep destination a blocked player chooses, from their `goTo` priority
   * list. A player with Sidestep picks (it is NOT the attacker's choice) any empty
   * adjacent square to be pushed into. Because only the user performs blocks in the
   * puzzles, the away player's preference is predetermined by `goTo`: the first
   * listed square that is on-board, adjacent to the player and currently empty.
   * Returns null when Sidestep cannot redirect the push (no valid `goTo` square),
   * in which case the normal pushback rules apply.
   */
  sidestepSquare(board: WorkingBoard, player: WorkingPlayer): PushSquare | null {
    const goTo = player.goTo;
    if (!goTo || goTo.length === 0) return null;

    for (const pos of goTo) {
      if (pos.x < 0 || pos.y < 0 || pos.x >= board.rows || pos.y >= board.cols) continue;
      if (!this.isAdjacent(pos.x, pos.y, player.x, player.y)) continue;
      if (board.players.some((p) => p.x === pos.x && p.y === pos.y)) continue;
      return { x: pos.x, y: pos.y, occupantId: null };
    }
    return null;
  }

  /**
   * Grab: every unoccupied, on-board square adjacent (8 directions) to (x, y).
   * A blocker with Grab may push the target into ANY of these — not just the
   * three squares directly away. Returns an empty list when the target is
   * fully boxed in (Grab then cannot be used).
   */
  grabSquares(board: WorkingBoard, x: number, y: number): PushSquare[] {
    const result: PushSquare[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= board.rows || sy >= board.cols) continue;
        if (board.players.some((p) => p.x === sx && p.y === sy)) continue;
        result.push({ x: sx, y: sy, occupantId: null });
      }
    }
    return result;
  }

  /**
   * The three on-board squares directly away from the blocker (with occupant info,
   * NOT reduced to empties). Used so a Grab blocker can still choose a normal push
   * — including an occupied square that triggers a chain push. Away-team Stand Firm
   * squares are excluded (they refuse to be pushed).
   */
  pushChainSquares(board: WorkingBoard, x: number, y: number, dir: PushDirection): PushSquare[] {
    return this.pushSquares(dir, x, y)
      .filter((s) => s.x >= 0 && s.y >= 0 && s.x < board.rows && s.y < board.cols)
      .map((s) => ({
        x: s.x,
        y: s.y,
        occupantId: board.players.find((p) => p.x === s.x && p.y === s.y)?.id ?? null
      }))
      .filter((s) => {
        if (s.occupantId === null) return true;
        const occ = board.players.find((p) => p.id === s.occupantId);
        return !(occ?.team === 'away' && this.hasSkill(occ, 'Stand Firm'));
      });
  }

  /**
   * Landing squares for a Jump Over: the three squares directly beyond the prone
   * player, on the opposite side from the jumper (same geometry as a push). Only
   * empty, on-board squares are valid landing spots.
   */
  jumpLandingSquares(board: WorkingBoard, jumper: WorkingPlayer, prone: WorkingPlayer): PushSquare[] {
    const dir = this.pushDirection(jumper, prone);
    return this.pushSquares(dir, prone.x, prone.y)
      .filter((s) => s.x >= 0 && s.y >= 0 && s.x < board.rows && s.y < board.cols)
      .filter((s) => !board.players.some((p) => p.x === s.x && p.y === s.y))
      .map((s) => ({ x: s.x, y: s.y, occupantId: null }));
  }

  /**
   * Whether `jumper` can Jump Over `prone`: the prone player must be adjacent,
   * at least one empty landing square exists beyond it, and the jumper can pay
   * the 2-square cost from remaining movement and/or Rush.
   */
  canJumpOver(board: WorkingBoard, jumper: WorkingPlayer, prone: WorkingPlayer): boolean {
    if (!this.isAdjacent(jumper.x, jumper.y, prone.x, prone.y)) return false;
    if (jumper.movementLeft + jumper.rushLeft < 2) return false;
    return this.jumpLandingSquares(board, jumper, prone).length > 0;
  }

  /**
   * Probability (0..1) that a Jump Over landing at (lx, ly) succeeds.
   *
   * The jump requires an Agility test with a negative modifier equal to the
   * HIGHER number of enemy Tackle Zones on the square jumped FROM or the square
   * landed IN — the two penalties do not stack. Prone players exert no tackle
   * zone (including the player being jumped over).
   */
  jumpProbability(board: WorkingBoard, jumper: WorkingPlayer, lx: number, ly: number): number {
    const tzFrom = board.players.filter(
      (p) => p.team !== jumper.team && !p.prone && this.isAdjacent(p.x, p.y, jumper.x, jumper.y)
    ).length;
    const tzLand = board.players.filter(
      (p) => p.team !== jumper.team && !p.prone && this.isAdjacent(p.x, p.y, lx, ly)
    ).length;

    const modifier = -Math.max(tzFrom, tzLand);
    return this.rollSuccess(jumper.characteristics.agility - modifier);
  }

  /**
   * Probability (0..1) that a Projectile Vomit attack breaks the target's armour.
   *
   * The attacker rolls 2D6 and must beat (strictly exceed) the target's Armour
   * Value. On success the target is knocked Prone. Tackle zones and assists do
   * not affect Vomit — it is a flat 2D6-vs-AV roll.
   */
  vomitProbability(target: WorkingPlayer): number {
    return this.twoD6Above(target.characteristics.armor);
  }

  /** Probability that the sum of 2D6 is strictly greater than `value`. */
  private twoD6Above(value: number): number {
    let favourable = 0;
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        if (a + b > value) favourable++;
      }
    }
    return favourable / 36;
  }

  /**
   * Probability (0..1) that `mover` successfully picks up the ball from (tx, ty).
   *
   * Rules:
   *  - Base roll: 2+ on D6 (Agility test, natural 1 always fails, 6 always succeeds).
   *  - −1 per enemy Tackle Zone on the ball square (standing enemies adjacent to it).
   *  - Extra Arms: +1 modifier.
   *  - Sure Hands: free reroll on a failed attempt.
   *  - Diving Catch does NOT apply to pickups (catch-only skill).
   */
  pickupProbability(board: WorkingBoard, mover: WorkingPlayer, tx: number, ty: number): number {
    const tzOnSquare = board.players.filter(
      (p) => p.team !== mover.team && !p.prone && this.isAdjacent(p.x, p.y, tx, ty)
    ).length;

    let modifier = -tzOnSquare;
    if (this.hasSkill(mover, 'Extra Arms')) modifier += 1;

    let probability = this.rollSuccess(mover.characteristics.agility - modifier);

    if (this.hasSkill(mover, 'Sure Hands')) {
      probability = 1 - (1 - probability) * (1 - probability);
    }

    return probability;
  }

  /**
   * Probability (0..1) that moving `mover` to (tx, ty) succeeds. A free move
   * (white circle) is 1.0; a move out of an enemy tackle zone requires a Dodge
   * roll whose chance depends on Agility, tackle-zone modifiers and skills.
   */
  dodgeProbability(board: WorkingBoard, mover: WorkingPlayer, tx: number, ty: number): number {
    // Every adjacent, non-prone enemy. Prone players exert no tackle zone.
    const adjacentEnemies = board.players.filter(
      (p) => p.team === 'away' && !p.prone && this.isAdjacent(p.x, p.y, mover.x, mover.y)
    );

    // Titchy enemies exert no tackle zone for dodging: they neither force a Dodge
    // nor add the -1 Marking modifier (their tackle zone still counts elsewhere —
    // assists, passing, pickups). Titchy does NOT, however, switch off their other
    // dodge-affecting skills (Diving Tackle, Prehensile Tail, Tackle), which are
    // evaluated against every adjacent enemy below.
    const tackleZoneEnemies = adjacentEnemies.filter((p) => !this.hasSkill(p, 'Titchy'));
    const prehensileTail = adjacentEnemies.some((e) => this.hasSkill(e, 'Prehensile Tail'));
    const divingTackle   = adjacentEnemies.some((e) => this.hasSkill(e, 'Diving Tackle'));
    const tacklePrevents = adjacentEnemies.some((e) => this.hasSkill(e, 'Tackle'));

    // A Dodge happens when leaving a real tackle zone, or when an adjacent enemy
    // brings a skill that triggers on the Dodge (Diving Tackle / Prehensile Tail)
    // even though Titchy may have removed their tackle zone.
    if (tackleZoneEnemies.length === 0 && !prehensileTail && !divingTackle) {
      return 1;
    }

    // Tackle zones marking the DESTINATION square impose a -1 each. A Titchy enemy
    // exerts no tackle zone for dodging, so it is excluded from this count too.
    const targetTackleZones = board.players.filter(
      (p) => p.team === 'away' && !p.prone && !this.hasSkill(p, 'Titchy')
        && this.isAdjacent(p.x, p.y, tx, ty)
    ).length;

    const stunty = this.hasSkill(mover, 'Stunty');
    const titchy = this.hasSkill(mover, 'Titchy');
    const twoHeads = this.hasSkill(mover, 'Two Heads');

    // Only Stunty lets the dodging player ignore the -1 per enemy tackle zone.
    // Titchy (on the mover) does NOT — it merely grants a flat +1 (applied below).
    // Enemy Dodge-affecting skills (Prehensile Tail, Diving Tackle) STILL apply on
    // top — even for Stunty.
    const ignoreTackleZones = stunty;

    let modifier = ignoreTackleZones ? 0 : -targetTackleZones;
    if (prehensileTail) modifier -= 1;
    if (divingTackle) modifier -= 2;
    // Titchy: +1 to the player's own Agility test when attempting to Dodge.
    if (titchy) modifier += 1;
    if (twoHeads) modifier += 1;

    // Break Tackle: once per turn, a Dodge gains a flat positive modifier scaled by
    // the player's Strength — +1 at ST≤3, +2 at ST4, +3 at ST≥5.
    if (this.hasSkill(mover, 'Break Tackle')) {
      const st = mover.characteristics.strength;
      modifier += st >= 5 ? 3 : st === 4 ? 2 : 1;
    }

    const target = mover.characteristics.agility;

    let probability = this.rollSuccess(target - modifier);

    // Dodge skill grants a reroll, unless an adjacent enemy with Tackle prevents it.
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
   * causing a turnover. Models the throw (Passing test) and the catch
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

    // -- Intercept --
    let interceptFailProb = 1;
    const interceptors = board.players
      .filter(interceptor =>
        interceptor.team === 'away' && !interceptor.prone
      && this.canIntercept(receiver, passer, interceptor));
    if (interceptors.length > 0) {
      const interceptor = interceptors.reduce((bestAgility, player) =>
        player.characteristics.agility < bestAgility.characteristics.agility ? player : bestAgility);
      interceptFailProb = 1 - this.rollSuccess(interceptor.characteristics.agility + 3)
    }

    return throwProb * catchProb * interceptFailProb;
  }

  canIntercept(receiver: WorkingPlayer, passer: WorkingPlayer, interceptor: WorkingPlayer, threshold = 0.85): boolean {
    const dx = receiver.x - passer.x;
    const dy = receiver.y - passer.y;
    const lineLengthSq = dx * dx + dy * dy;

    if (lineLengthSq === 0) return false; // Thrown and landing in the same square

    // Calculate projection factor t
    let t = ((interceptor.x - passer.x) * dx + (interceptor.y - passer.y) * dy) / lineLengthSq;

    // Must be between the thrower and the destination
    if (t <= 0 || t >= 1) {
      return false;
    }

    // Find the closest point on the line segment
    const closestX = passer.x + t * dx;
    const closestY = passer.y + t * dy;

    // Calculate distance from interceptor center to the line
    const distDx = interceptor.x - closestX;
    const distDy = interceptor.y - closestY;
    const distance = Math.sqrt(distDx * distDx + distDy * distDy);

    // If within the ruler's width threshold, it's an eligible intercept square
    return distance <= threshold;
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
