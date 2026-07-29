import { PuzzleEngineService } from './puzzle-engine.service';
import { WorkingBoard, WorkingPlayer } from './puzzle-session.service';

function player(overrides: Partial<WorkingPlayer> = {}): WorkingPlayer {
  return {
    id: 'home-0',
    team: 'home',
    name: 'Player',
    x: 1,
    y: 1,
    characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
    skills: [],
    extraSkills: [],
    activated: false,
    movementLeft: 6,
    rushLeft: 2,
    hasMoved: false,
    sureFeetUsed: false,
    prone: false,
    hasBlocked: false,
    frenzyUsed: false,
    eyeGouged: false,
    ...overrides
  };
}

function board(players: WorkingPlayer[], ball = { x: 9, y: 9 }): WorkingBoard {
  return {
    rows: 4,
    cols: 7,
    targetScore: 10,
    puzzleType: 'score',
    ball,
    players,
    selectedPlayerId: players.find((p) => p.team === 'home')?.id ?? null,
    lastMovedPlayerId: null,
    solved: false,
    passUsed: false,
    handoffUsed: false,
    blitzPlayerId: null,
    successChance: 1,
    chanceLog: [],
    incorrectSolution: false,
    hints: [],
    hintsRevealed: 0,
    query: null,
    queryAnswer: null
  };
}

describe('PuzzleEngineService', () => {
  let engine: PuzzleEngineService;

  beforeEach(() => {
    engine = new PuzzleEngineService();
  });

  it('marks adjacent empty squares as move targets for the selected player', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const cells = engine.buildCells(board([selected]));

    const target = cells.find((c) => c.x === 2 && c.y === 1)!;
    expect(target.isMoveTarget).toBe(true);
    expect(target.requiresDodge).toBe(false);
  });

  it('requires a dodge on all moves when the selected player is in a tackle zone', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
    const cells = engine.buildCells(board([selected, opponent]));

    const moveTargets = cells.filter((c) => c.isMoveTarget);
    expect(moveTargets.length).toBeGreaterThan(0);
    expect(moveTargets.every((c) => c.requiresDodge)).toBe(true);
  });

  it('opens a friendly menu when clicking another home player while one is selected', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const friend = player({ id: 'home-1', x: 3, y: 2 });
    const state = board([selected, friend]);
    const cells = engine.buildCells(state);
    const friendCell = cells.find((c) => c.player?.id === 'home-1')!;

    expect(engine.resolveCellClick(state, friendCell, selected)).toEqual({
      type: 'menu',
      target: friend
    });
  });

  it('opens a menu when clicking an adjacent enemy player while one is selected', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
    const state = board([selected, enemy]);
    const cells = engine.buildCells(state);
    const enemyCell = cells.find((c) => c.player?.id === 'away-0')!;

    expect(engine.resolveCellClick(state, enemyCell, selected)).toEqual({
      type: 'menu',
      target: enemy
    });
  });

  it('does not open a menu when clicking a non-adjacent enemy player', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const enemy = player({ id: 'away-0', team: 'away', x: 3, y: 3 });
    const state = board([selected, enemy]);
    const cells = engine.buildCells(state);
    const enemyCell = cells.find((c) => c.player?.id === 'away-0')!;

    expect(engine.resolveCellClick(state, enemyCell, selected)).toEqual({
      type: 'none'
    });
  });

  it('offers Activate player for a deactivated team-mate, plus Pass when carrying the ball', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const friend = player({ id: 'home-1', x: 3, y: 2, activated: false });

    const withoutBall = engine.actionOptions(board([selected, friend]), selected, friend);
    expect(withoutBall.map((o) => o.id)).toEqual(['activate']);

    const withBall = engine.actionOptions(
      board([selected, friend], { x: 1, y: 1 }),
      selected,
      friend
    );
    expect(withBall.map((o) => o.id)).toEqual(['activate', 'pass']);
  });

  it('does not offer Activate for an already-activated team-mate (but Pass still works)', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const used = player({ id: 'home-1', x: 3, y: 2, activated: true });

    const options = engine.actionOptions(
      board([selected, used], { x: 1, y: 1 }),
      selected,
      used
    );
    // Carrier holds the ball: Pass is offered to the activated (non-adjacent) team-mate,
    // but it can no longer be activated/taken over.
    expect(options.map((o) => o.id)).toEqual(['pass']);
  });

  it('offers Throw team-mate to a deactivated team-mate when adjacent with the right skills', () => {
    const thrower = player({ id: 'home-0', x: 1, y: 1, skills: ['Throw Team-Mate'] });
    const passenger = player({
      id: 'home-1',
      x: 2,
      y: 1,
      activated: false,
      skills: ['Right Stuff']
    });

    const options = engine.actionOptions(board([thrower, passenger]), thrower, passenger);
    expect(options.map((o) => o.id)).toContain('throw');

    // Not adjacent → no throw option.
    const far = player({ id: 'home-1', x: 5, y: 3, activated: false, skills: ['Right Stuff'] });
    const farOptions = engine.actionOptions(board([thrower, far]), thrower, far);
    expect(farOptions.map((o) => o.id)).not.toContain('throw');
  });

  it('hides Pass once a pass has already been used', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const friend = player({ id: 'home-1', x: 4, y: 2, activated: false });
    const state = board([selected, friend], { x: 1, y: 1 });
    state.passUsed = true;

    const options = engine.actionOptions(state, selected, friend);
    expect(options.map((o) => o.id)).toEqual(['activate']);
  });

  it('offers Hand off to an adjacent team-mate while carrying the ball', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const adjacentMate = player({ id: 'home-1', x: 2, y: 1, activated: false });
    const options = engine.actionOptions(
      board([selected, adjacentMate], { x: 1, y: 1 }),
      selected,
      adjacentMate
    );
    expect(options.map((o) => o.id)).toEqual(['activate', 'pass', 'handoff']);
  });

  it('hides Pass and Hand off when the carrier has "My Ball"', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1, skills: ['My Ball'] });
    const adjacentMate = player({ id: 'home-1', x: 2, y: 1, activated: false });
    const options = engine.actionOptions(
      board([selected, adjacentMate], { x: 1, y: 1 }),
      selected,
      adjacentMate
    );
    expect(options.map((o) => o.id)).toEqual(['activate']);
  });

  it('keeps Hand off available even after a pass has been used', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const adjacentMate = player({ id: 'home-1', x: 2, y: 1, activated: false });
    const state = board([selected, adjacentMate], { x: 1, y: 1 });
    state.passUsed = true;

    const options = engine.actionOptions(state, selected, adjacentMate);
    expect(options.map((o) => o.id)).toEqual(['activate', 'handoff']);
  });

  it('does not offer Hand off to a non-adjacent team-mate', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const farMate = player({ id: 'home-1', x: 5, y: 3, activated: false });
    const options = engine.actionOptions(
      board([selected, farMate], { x: 1, y: 1 }),
      selected,
      farMate
    );
    expect(options.map((o) => o.id)).not.toContain('handoff');
  });

  it('returns Block for a standing opposition target, Block + Jump over for a prone one', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });

    const standing = engine.actionOptions(board([selected, opponent]), selected, opponent);
    expect(standing.map((o) => o.id)).toEqual(['block']);

    const prone = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
    const proneOptions = engine.actionOptions(board([selected, prone]), selected, prone);
    expect(proneOptions.map((o) => o.id)).toEqual(['jump']);
  });

  describe('Blitz — one per team turn', () => {
    it('offers Block to a player who has not moved yet, even when the Blitz is taken', () => {
      // A standing block (no prior movement) is NOT a Blitz — always allowed.
      const selected = player({ id: 'home-0', x: 1, y: 1, hasMoved: false });
      const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      const state = board([selected, opponent]);
      state.blitzPlayerId = 'home-9'; // another player owns the Blitz

      const options = engine.actionOptions(state, selected, opponent);
      expect(options.map((o) => o.id)).toContain('block');
    });

    it('offers Block to a player who has moved when the Blitz is still free', () => {
      const selected = player({ id: 'home-0', x: 1, y: 1, hasMoved: true });
      const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      const state = board([selected, opponent]);
      state.blitzPlayerId = null;

      const options = engine.actionOptions(state, selected, opponent);
      expect(options.map((o) => o.id)).toContain('block');
    });

    it('offers Block to a moved player who already owns the Blitz', () => {
      // The Blitz owner may keep blocking (e.g. mid Frenzy/Blitz continuation).
      const selected = player({ id: 'home-0', x: 1, y: 1, hasMoved: true });
      const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      const state = board([selected, opponent]);
      state.blitzPlayerId = 'home-0';

      const options = engine.actionOptions(state, selected, opponent);
      expect(options.map((o) => o.id)).toContain('block');
    });

    it('does NOT offer Block to a moved player when another player owns the Blitz', () => {
      // A second player moved then tries to block after the blitz slot was consumed — forbidden.
      const selected = player({ id: 'home-0', x: 1, y: 1, hasMoved: true });
      const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      const state = board([selected, opponent]);
      state.blitzPlayerId = 'home-9';

      const options = engine.actionOptions(state, selected, opponent);
      expect(options.map((o) => o.id)).not.toContain('block');
    });
  });

  describe('push', () => {
    it('pushes a diagonal block to the three far squares', () => {
      const blocker = player({ id: 'home-0', x: 1, y: 1 });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 2 });
      const state = board([blocker, defender]);

      const dir = engine.pushDirection(blocker, defender);
      expect(dir).toEqual({ dx: 1, dy: 1 });

      const squares = engine
        .pushOptions(state, defender.x, defender.y, dir)
        .map((s) => `${s.x},${s.y}`)
        .sort();
      expect(squares).toEqual(['2,3', '3,2', '3,3'].sort());
    });

    it('pushes an orthogonal block to the straight square plus two flanks', () => {
      const blocker = player({ id: 'home-0', x: 1, y: 1 });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 2 });
      const state = board([blocker, defender]);

      const dir = engine.pushDirection(blocker, defender);
      expect(dir).toEqual({ dx: 0, dy: 1 });

      const squares = engine
        .pushOptions(state, defender.x, defender.y, dir)
        .map((s) => `${s.x},${s.y}`)
        .sort();
      expect(squares).toEqual(['0,3', '1,3', '2,3'].sort());
    });

    it('offers only empty squares when at least one is free', () => {
      const blocker = player({ id: 'home-0', x: 1, y: 1 });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 2 });
      const filler = player({ id: 'home-1', x: 3, y: 3 });
      const state = board([blocker, defender, filler]);

      const dir = engine.pushDirection(blocker, defender);
      const options = engine.pushOptions(state, defender.x, defender.y, dir);
      expect(options.every((o) => o.occupantId === null)).toBe(true);
      expect(options.map((s) => `${s.x},${s.y}`).sort()).toEqual(['2,3', '3,2'].sort());
    });

    it('returns all occupied squares for a chain push when none are free', () => {
      const blocker = player({ id: 'home-0', x: 1, y: 1 });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 2 });
      const a = player({ id: 'home-1', x: 3, y: 3 });
      const b = player({ id: 'home-2', x: 3, y: 2 });
      const c = player({ id: 'home-3', x: 2, y: 3 });
      const state = board([blocker, defender, a, b, c]);

      const dir = engine.pushDirection(blocker, defender);
      const options = engine.pushOptions(state, defender.x, defender.y, dir);
      expect(options.length).toBe(3);
      expect(options.every((o) => o.occupantId !== null)).toBe(true);
    });

    it('drops off-board pushback squares', () => {
      const blocker  = player({ id: 'home-0', x: 1, y: 5 });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 6 }); // last column of a 7-col board
      const state = board([blocker, defender]);

      const dir = engine.pushDirection(blocker, defender);
      // Pushback would be column y=7, which is off the 7-col board → nothing offered.
      expect(engine.pushOptions(state, defender.x, defender.y, dir).length).toBe(0);
    });

    describe('hasPushOutOfBounds', () => {
      // Board is 4 rows × 7 cols (y: 0..6).
      // All three scenarios use a vertical push (dx=0, dy=+1) from the second-to-last
      // column so that one push square lands at y=7 (OOB) while two land at y=6 (in-bounds).

      it('does NOT offer OOB when empty in-bounds push squares exist', () => {
        // Blocker (0,4) → Defender (0,5), direction dy=+1.
        // Push squares: (-1,6)[OOB], (0,6)[empty], (1,6)[empty].
        // Two vacant in-bounds options → OOB must NOT be offered.
        const blocker  = player({ id: 'home-0', x: 0, y: 4 });
        const defender = player({ id: 'away-0', team: 'away', x: 0, y: 5 });
        const state    = board([blocker, defender]);
        const dir      = engine.pushDirection(blocker, defender);

        expect(engine.hasPushOutOfBounds(state, defender.x, defender.y, dir)).toBe(false);
      });

      it('offers OOB when all in-bounds push squares are occupied', () => {
        // Same geometry but the two in-bounds squares are now filled.
        // Push squares: (-1,6)[OOB], (0,6)[occupied], (1,6)[occupied].
        // No empty in-bounds option → OOB must be offered.
        const blocker  = player({ id: 'home-0', x: 0, y: 4 });
        const defender = player({ id: 'away-0', team: 'away', x: 0, y: 5 });
        const fillA    = player({ id: 'home-1', x: 0, y: 6 });
        const fillB    = player({ id: 'home-2', x: 1, y: 6 });
        const state    = board([blocker, defender, fillA, fillB]);
        const dir      = engine.pushDirection(blocker, defender);

        expect(engine.hasPushOutOfBounds(state, defender.x, defender.y, dir)).toBe(true);
      });

      it('offers OOB when every push square is off the pitch', () => {
        // Defender at (0,6) — the very last column. All push squares land at y=7 (OOB).
        const blocker  = player({ id: 'home-0', x: 0, y: 5 });
        const defender = player({ id: 'away-0', team: 'away', x: 0, y: 6 });
        const state    = board([blocker, defender]);
        const dir      = engine.pushDirection(blocker, defender);

        expect(engine.hasPushOutOfBounds(state, defender.x, defender.y, dir)).toBe(true);
      });
    });

    it('chain push: squares are computed from the intermediate player, not the original blocker', () => {
      // Setup: blocker (1,0) pushes defender (0,1) diagonally — direction (-1,+1).
      // The defender is pushed to (0,2) which is occupied by a second away player.
      // The chain push direction must now be (0,1)→(0,2) = (0,+1), NOT the original (-1,+1).
      //
      //  Original direction (-1,+1) from (0,2) gives push squares:
      //    rel [[-1,1],[-1,0],[0,1]] → (-1,3)[OOB], (-1,2)[OOB], (0,3) ← only one valid square
      //
      //  Correct direction (0,+1) from (0,2) gives push squares:
      //    rel [[-1,1],[0,1],[1,1]] → (-1,3)[OOB], (0,3), (1,3) ← two valid squares

      const blocker  = player({ id: 'home-0',  x: 1, y: 0 });
      const defender = player({ id: 'away-0', team: 'away', x: 0, y: 1 });
      const chainTarget = player({ id: 'away-1', team: 'away', x: 0, y: 2 });
      const state = board([blocker, defender, chainTarget]);

      // Verify the original diagonal push direction.
      const originalDir = engine.pushDirection(blocker, defender);
      expect(originalDir).toEqual({ dx: -1, dy: 1 });

      // With the original direction applied to (0,2): only (0,3) is on the pitch.
      const wrongSquares = engine
        .pushOptions(state, 0, 2, originalDir)
        .map((s) => `${s.x},${s.y}`).sort();
      expect(wrongSquares).toEqual(['0,3']);

      // The chain push direction is recalculated from the defender's position (0,1)
      // to the chosen push square (0,2): direction (0,+1).
      const chainDir = engine.pushDirection(defender, chainTarget);
      expect(chainDir).toEqual({ dx: 0, dy: 1 });

      // With the correct chain direction from (0,2): both (0,3) and (1,3) are valid.
      const correctSquares = engine
        .pushOptions(state, 0, 2, chainDir)
        .map((s) => `${s.x},${s.y}`).sort();
      expect(correctSquares).toEqual(['0,3', '1,3'].sort());
    });
  });

  describe('grabSquares', () => {
    it('offers every unoccupied adjacent square of the target', () => {
      // Target at (2,2) on a 4×7 board: all 8 neighbours are on-board and empty.
      const blocker = player({ id: 'home-0', x: 0, y: 5 }); // not adjacent to (2,2)
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 2 });
      const state = board([blocker, defender]);

      const squares = engine.grabSquares(state, 2, 2).map((s) => `${s.x},${s.y}`).sort();
      expect(squares).toEqual(
        ['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3'].sort()
      );
    });

    it('excludes occupied and off-board squares', () => {
      // Target at (0,0) corner: only (0,1), (1,0), (1,1) are on-board; occupy (1,1).
      const defender = player({ id: 'away-0', team: 'away', x: 0, y: 0 });
      const blocker = player({ id: 'home-0', x: 1, y: 1 });
      const state = board([blocker, defender]);

      const squares = engine.grabSquares(state, 0, 0).map((s) => `${s.x},${s.y}`).sort();
      expect(squares).toEqual(['0,1', '1,0'].sort());
    });

    it('returns empty when the target is fully boxed in', () => {
      // Target at (0,0); occupy its only 3 on-board neighbours.
      const defender = player({ id: 'away-0', team: 'away', x: 0, y: 0 });
      const m1 = player({ id: 'home-1', x: 0, y: 1 });
      const m2 = player({ id: 'home-2', x: 1, y: 0 });
      const m3 = player({ id: 'home-3', x: 1, y: 1 });
      const state = board([defender, m1, m2, m3]);

      expect(engine.grabSquares(state, 0, 0)).toEqual([]);
    });
  });

  describe('sidestepSquare', () => {
    it('returns the first on-board, adjacent, empty goTo square by priority', () => {
      // Defender at (2,2) with two goTo squares; the first is occupied so the
      // second (empty, adjacent) is chosen.
      const defender = player({
        id: 'away-0', team: 'away', x: 2, y: 2,
        skills: ['Sidestep'],
        goTo: [{ x: 3, y: 2 }, { x: 1, y: 2 }]
      });
      const blocker = player({ id: 'home-0', x: 3, y: 2 }); // occupies first goTo
      const state = board([blocker, defender]);

      expect(engine.sidestepSquare(state, defender)).toEqual({ x: 1, y: 2, occupantId: null });
    });

    it('skips off-board and non-adjacent goTo squares', () => {
      const defender = player({
        id: 'away-0', team: 'away', x: 0, y: 0,
        skills: ['Sidestep'],
        // (-1,0) off-board, (2,2) not adjacent, (1,1) adjacent & empty.
        goTo: [{ x: -1, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 }]
      });
      const state = board([defender]);

      expect(engine.sidestepSquare(state, defender)).toEqual({ x: 1, y: 1, occupantId: null });
    });

    it('returns null when no goTo square is available (all occupied/invalid)', () => {
      const defender = player({
        id: 'away-0', team: 'away', x: 1, y: 1,
        skills: ['Sidestep'],
        goTo: [{ x: 2, y: 1 }]
      });
      const blocker = player({ id: 'home-0', x: 2, y: 1 }); // occupies the only goTo
      const state = board([blocker, defender]);

      expect(engine.sidestepSquare(state, defender)).toBeNull();
    });

    it('returns null when the player has no goTo list', () => {
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 1, skills: ['Sidestep'] });
      const state = board([defender]);

      expect(engine.sidestepSquare(state, defender)).toBeNull();
    });
  });

  describe('dodgeProbability', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const ag = (agility: number) => ({ movement: 6, strength: 3, agility, passing: 4, armor: 8 });

    it('is 1 for a free move not leaving an enemy tackle zone', () => {
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const farEnemy = player({ id: 'away-0', team: 'away', x: 5, y: 3 });
      expect(engine.dodgeProbability(board([mover, farEnemy]), mover, 2, 1)).toBe(1);
    });

    it('is a flat AG roll when leaving a tackle zone into open space', () => {
      // AG 3+ flat: succeed on 3,4,5,6 → 4/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 4 / 6)).toBe(true);
    });

    it('applies -1 per tackle zone covering the target square', () => {
      // AG 3+ with -1 → need 4+: 4,5,6 → 3/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      // Target (2,2) is adjacent to the enemy at (2,1) → one tackle zone.
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 3 / 6)).toBe(true);
    });

    it('rerolls with the Dodge skill', () => {
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Dodge'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      const p = 4 / 6;
      expect(
        near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 1 - (1 - p) * (1 - p))
      ).toBe(true);
    });

    it('does not reroll when an adjacent enemy has Tackle', () => {
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Dodge'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Tackle'] });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 4 / 6)).toBe(true);
    });

    it('ignores tackle-zone modifiers with Stunty', () => {
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Stunty'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      // Target (2,2) is in the enemy tackle zone, but Stunty ignores it → flat 4/6.
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 4 / 6)).toBe(true);
    });

    it('Stunty ignores tackle-zone modifiers even when an enemy has Prehensile Tail', () => {
      // Two enemies cover the destination (2,2): the Prehensile-Tail holder at (2,1)
      // and another at (1,3) → 2 tackle zones. Stunty ignores the per-TZ modifiers,
      // but the Prehensile Tail -1 still applies → AG 3+ with -1 → 4+ → 3/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Stunty'], characteristics: ag(3) });
      const tailer = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Prehensile Tail'] });
      const extra  = player({ id: 'away-1', team: 'away', x: 1, y: 3 });
      expect(near(engine.dodgeProbability(board([mover, tailer, extra]), mover, 2, 2), 3 / 6)).toBe(true);
    });

    it('Stunty still suffers a Diving Tackle penalty', () => {
      // Stunty ignores tackle zones, but the Diving Tackle -2 still applies →
      // AG 3+ with -2 → 5+ → 2/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Stunty'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Diving Tackle'] });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 2 / 6)).toBe(true);
    });

    it('still performs the Agility test for a Stunty dodge (not auto-success)', () => {
      // Stunty removes tackle-zone penalties but the roll still happens: AG 4+ → 3/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Stunty'], characteristics: ag(4) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 3 / 6)).toBe(true);
    });

    it('honours the natural-6 golden rule on hard dodges', () => {
      // AG 6+, no modifiers → only a natural 6 → 1/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(6) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 1 / 6)).toBe(true);
    });

    it('Titchy adds +1 to its own dodge but still suffers enemy tackle zones', () => {
      // AG 3+ dodging into a tackle zone: -1 for the marking enemy, +1 from Titchy
      // → net 0 → flat 3+ → 4/6 (unlike Stunty it does NOT ignore the tackle zone).
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Titchy'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 4 / 6)).toBe(true);
    });

    it('Titchy +1 helps when dodging into open space out of a tackle zone', () => {
      // Leaving the enemy tackle zone into open ground: no destination tackle zone,
      // +1 from Titchy → AG 3+ becomes effectively 2+ → 5/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Titchy'], characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 5 / 6)).toBe(true);
    });

    it('a Titchy enemy exerts no tackle zone, so leaving only it needs no dodge', () => {
      // The mover is adjacent only to a Titchy enemy → no Dodge required → 1.0.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const titchyEnemy = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Titchy'] });
      expect(engine.dodgeProbability(board([mover, titchyEnemy]), mover, 2, 2)).toBe(1);
    });

    it('a Titchy marker on the destination adds no -1 when dodging away from a real enemy', () => {
      // A normal enemy at (0,1) forces the Dodge; the destination (2,2) is marked
      // only by a Titchy enemy at (2,3), which adds no -1 → flat AG 3+ → 4/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const leaving = player({ id: 'away-0', team: 'away', x: 0, y: 1 });
      const titchyMark = player({ id: 'away-1', team: 'away', x: 2, y: 3, skills: ['Titchy'] });
      expect(
        near(engine.dodgeProbability(board([mover, leaving, titchyMark]), mover, 2, 2), 4 / 6)
      ).toBe(true);
    });

    it('counts a normal destination marker but ignores a Titchy one', () => {
      // Dodge forced by the enemy at (0,1). Destination (2,2) is marked by a normal
      // enemy at (1,3) (-1) and a Titchy enemy at (2,3) (ignored) → AG 3+ -1 → 3/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const leaving = player({ id: 'away-0', team: 'away', x: 0, y: 1 });
      const normalMark = player({ id: 'away-1', team: 'away', x: 1, y: 3 });
      const titchyMark = player({ id: 'away-2', team: 'away', x: 2, y: 3, skills: ['Titchy'] });
      expect(
        near(engine.dodgeProbability(board([mover, leaving, normalMark, titchyMark]), mover, 2, 2), 3 / 6)
      ).toBe(true);
    });

    it('Titchy does not deactivate an adjacent enemy\'s Diving Tackle', () => {
      // The lone adjacent enemy is Titchy + Diving Tackle. Titchy removes its tackle
      // zone (no -1 Marking) but Diving Tackle still applies its -2 and forces the
      // Dodge → AG 3+ with -2 → 5+ → 2/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Titchy', 'Diving Tackle'] });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 2 / 6)).toBe(true);
    });

    it('Titchy does not deactivate an adjacent enemy\'s Prehensile Tail', () => {
      // Lone enemy is Titchy + Prehensile Tail: no -1 Marking (Titchy) but the
      // Prehensile Tail -1 still applies and forces the Dodge → AG 3+ -1 → 3/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Titchy', 'Prehensile Tail'] });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 2, 2), 3 / 6)).toBe(true);
    });

    it('Titchy does not deactivate an adjacent enemy\'s Tackle (still no Dodge reroll)', () => {
      // A normal enemy at (0,1) forces the Dodge; a Titchy + Tackle enemy at (2,1)
      // adds no -1 (Titchy) but still denies the Dodge reroll. Dodging into (2,2),
      // which only the Titchy enemy marks (ignored) → flat AG 3+, no reroll → 4/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, skills: ['Dodge'], characteristics: ag(3) });
      const leaving = player({ id: 'away-0', team: 'away', x: 0, y: 1 });
      const titchyTackler = player({ id: 'away-1', team: 'away', x: 2, y: 1, skills: ['Titchy', 'Tackle'] });
      expect(
        near(engine.dodgeProbability(board([mover, leaving, titchyTackler]), mover, 2, 2), 4 / 6)
      ).toBe(true);
    });
  });

  describe('blockOptions', () => {
    it('still offers Stumble even when the defender has Dodge (it resolves as a push)', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('inserts Stumble between Push Back and Pow when the defender has no Dodge', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: [] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('offers Stumble when the attacker has Tackle even if the defender has Dodge', () => {
      const attacker = player({ id: 'home-0', skills: ['Tackle'] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('offers Both Down when a Wrestle attacker is not carrying the ball', () => {
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Wrestle'] });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: [] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).toContain('bothdown');
    });

    it('withholds Both Down from a Wrestle attacker who carries the ball', () => {
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Wrestle'] });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: [] });
      // Ball sits on the attacker's square → attacker is the carrier.
      const state = board([attacker, defender], { x: 1, y: 1 });

      const options = engine.blockOptions(state, attacker, defender);
      expect(options.map((o) => o.id)).not.toContain('bothdown');
    });

    it('still offers Both Down to a Block ball carrier (Block keeps them standing)', () => {
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: [] });
      const state = board([attacker, defender], { x: 1, y: 1 });

      const options = engine.blockOptions(state, attacker, defender);
      expect(options.map((o) => o.id)).toContain('bothdown');
    });

    it('withholds Both Down against a Wrestle defender unless the attacker also has Wrestle', () => {
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Wrestle'] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).not.toContain('bothdown');
    });

    it('offers Both Down against a Wrestle defender when the attacker has Wrestle too', () => {
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Wrestle'] });
      const defender = player({ id: 'away-0', team: 'away', x: 2, y: 1, skills: ['Wrestle'] });

      const options = engine.blockOptions(board([attacker, defender]), attacker, defender);
      expect(options.map((o) => o.id)).toContain('bothdown');
    });

    it('returns nothing without both attacker and defender', () => {
      expect(engine.blockOptions(board([]), null, null)).toEqual([]);
    });
  });

  describe('Jump Over', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const ag = (agility: number) => ({ movement: 6, strength: 3, agility, passing: 4, armor: 8 });

    it('lists the three empty landing squares directly beyond the prone player', () => {
      // Jumper (1,1), prone (2,1) → direction (1,0); landings at (3,0),(3,1),(3,2).
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const squares = engine
        .jumpLandingSquares(board([jumper, prone]), jumper, prone)
        .map((s) => `${s.x},${s.y}`)
        .sort();
      expect(squares).toEqual(['3,0', '3,1', '3,2'].sort());
    });

    it('excludes occupied and off-board landing squares', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const blocker = player({ id: 'home-1', x: 3, y: 1 }); // occupies one landing square
      const squares = engine
        .jumpLandingSquares(board([jumper, prone, blocker]), jumper, prone)
        .map((s) => `${s.x},${s.y}`)
        .sort();
      expect(squares).toEqual(['3,0', '3,2'].sort());
    });

    it('is a flat Agility test (no tackle zones) — AG 3+ → 4/6', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      expect(near(engine.jumpProbability(board([jumper, prone]), jumper, 3, 1), 4 / 6)).toBe(true);
    });

    it('applies -1 for a single tackle zone on the landing square', () => {
      // Standing enemy at (3,2) covers landing (3,1) → AG 3+ with -1 → need 4+ → 3/6.
      const jumper = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const marker = player({ id: 'away-1', team: 'away', x: 3, y: 2 });
      expect(near(engine.jumpProbability(board([jumper, prone, marker]), jumper, 3, 1), 3 / 6)).toBe(true);
    });

    it('uses the HIGHER of the from/landing tackle zones — penalties do not stack', () => {
      // From (1,1) marked by two standing enemies (0,0),(0,2) → tzFrom = 2.
      // Landing (3,1) marked by one standing enemy (3,2) → tzLand = 1.
      // Modifier = -max(2,1) = -2 → AG 3+ need 5+ → 2/6  (not -3 → 1/6).
      const jumper = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const f1 = player({ id: 'away-1', team: 'away', x: 0, y: 0 });
      const f2 = player({ id: 'away-2', team: 'away', x: 0, y: 2 });
      const land = player({ id: 'away-3', team: 'away', x: 3, y: 2 });
      expect(near(engine.jumpProbability(board([jumper, prone, f1, f2, land]), jumper, 3, 1), 2 / 6)).toBe(true);
    });

    it('ignores prone enemies when counting tackle zones', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(3) });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const proneMarker = player({ id: 'away-1', team: 'away', x: 3, y: 2, prone: true });
      // Prone marker exerts no tackle zone → flat AG 3+ → 4/6.
      expect(near(engine.jumpProbability(board([jumper, prone, proneMarker]), jumper, 3, 1), 4 / 6)).toBe(true);
    });

    it('canJumpOver is false when no empty landing square exists', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const b1 = player({ id: 'home-1', x: 3, y: 0 });
      const b2 = player({ id: 'home-2', x: 3, y: 1 });
      const b3 = player({ id: 'home-3', x: 3, y: 2 });
      expect(engine.canJumpOver(board([jumper, prone, b1, b2, b3]), jumper, prone)).toBe(false);
    });

    it('canJumpOver is false when the 2-square cost cannot be paid', () => {
      // No movement and only 1 Rush left → cannot afford the 2-square jump.
      const jumper = player({ id: 'home-0', x: 1, y: 1, movementLeft: 0, rushLeft: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      expect(engine.canJumpOver(board([jumper, prone]), jumper, prone)).toBe(false);
    });

    it('canJumpOver is false when the prone player is not adjacent', () => {
      // Prone player two squares away (not adjacent) → Jump Over unavailable.
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 3, y: 1, prone: true });
      expect(engine.canJumpOver(board([jumper, prone]), jumper, prone)).toBe(false);
    });

    it('only offers Jump (not Block) against a prone target when a landing exists', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const prone  = player({ id: 'away-0', team: 'away', x: 2, y: 1, prone: true });
      const options = engine.actionOptions(board([jumper, prone]), jumper, prone);
      expect(options.map((o) => o.id)).toEqual(['jump']);
    });

    it('offers Jump over a prone team-mate', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      // Activated so "Activate player" is not offered → only the jump option remains.
      const mate = player({ id: 'home-1', team: 'home', x: 2, y: 1, prone: true, activated: true });
      const options = engine.actionOptions(board([jumper, mate]), jumper, mate);
      expect(options.map((o) => o.id)).toEqual(['jump']);
    });

    it('does not offer Jump over a standing team-mate', () => {
      const jumper = player({ id: 'home-0', x: 1, y: 1 });
      const mate = player({ id: 'home-1', team: 'home', x: 2, y: 1, activated: true });
      const options = engine.actionOptions(board([jumper, mate]), jumper, mate);
      expect(options.map((o) => o.id)).not.toContain('jump');
    });
  });

  describe('blockProbabilityMulti — Dodge converts Stumble to push', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

    it('counts the Stumble face as a push when the defender has Dodge and attacker has no Tackle', () => {
      // 1 die (equal ST). Selecting only Stumble: the converted Stumble face → push, 1/6.
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });
      const state = board([attacker, defender]);

      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['stumble']), 1 / 6)).toBe(true);
    });

    it('does not double-count when both Push Back and Stumble are selected (still 3/6)', () => {
      // Push Back (2 faces) + the Dodge-converted Stumble face = 3/6, not 4/6.
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });
      const state = board([attacker, defender]);

      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['pushback', 'stumble']), 3 / 6)).toBe(true);
    });

    it('does NOT count the Stumble face when only Push Back is selected (Stumble is a real choice)', () => {
      // The user chose Push Back but NOT Stumble: they miss the 1/6 Dodge-converted
      // Stumble face. Push Back alone = 2 faces → 2/6.
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });
      const state = board([attacker, defender]);

      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['pushback']), 2 / 6)).toBe(true);
    });

    it('Push + Pow (no Stumble) vs Dodge gives 3/6, not 4/6', () => {
      // Selecting Push Back (2 faces) + Pow (1 face), deliberately skipping Stumble
      // → the Stumble face is forfeit → 3/6 total.
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });
      const state = board([attacker, defender]);

      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['pushback', 'pow']), 3 / 6)).toBe(true);
    });

    it('treats Stumble as a knockdown (2/6 with Push Back) when the attacker has Tackle', () => {
      // Tackle negates Dodge: Push Back (2 faces) only → 2/6 for a push outcome;
      // selecting Stumble adds the knockdown Stumble face → 3/6.
      const attacker = player({ id: 'home-0', skills: ['Tackle'] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });
      const state = board([attacker, defender]);

      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['pushback']), 2 / 6)).toBe(true);
      expect(near(engine.blockProbabilityMulti(state, attacker, defender, ['pushback', 'stumble']), 3 / 6)).toBe(true);
    });
  });

  describe('assists (effectiveStrengths via blockProbability)', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    // Attacker has Block so Both Down is a safe push face → a clean 1-die push is 5/6.
    const ONE_DIE_PUSH = 5 / 6;            // single die, attacker chooses
    const TWO_DICE_DEF  = (5 / 6) * (5 / 6); // two dice, DEFENDER chooses → both must push
    const TWO_DICE_ATT  = 1 - (1 / 6) * (1 / 6); // two dice, attacker chooses

    it('does NOT grant a defensive assist from a team-mate adjacent only to the defender', () => {
      // Reproduces the reported bug: blocker (2,6) blocks the ball carrier (1,5).
      // The would-be assister (2,4) is adjacent to the DEFENDER but not the ATTACKER,
      // so it must NOT assist → equal ST → 1 die → 5/6 push.
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const bystander = player({ id: 'away-1', team: 'away', x: 2, y: 4, skills: [] });
      const state = board([attacker, defender, bystander]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), ONE_DIE_PUSH)).toBe(true);
    });

    it('grants a defensive assist from a team-mate adjacent to the attacker', () => {
      // Same blocker/defender, but the assister at (2,5) is adjacent to the ATTACKER
      // (2,6) → defender ST 4 vs 3 → 2 dice, defender chooses → (5/6)².
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const assister = player({ id: 'away-1', team: 'away', x: 2, y: 5, skills: [] });
      const state = board([attacker, defender, assister]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), TWO_DICE_DEF)).toBe(true);
    });

    it('does not let the blocker itself cancel a defensive assist', () => {
      // The assister (2,5) is adjacent to the attacker (2,6); the attacker is the only
      // home player adjacent to it, and the blocker must be ignored when marking → assist stands.
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const assister = player({ id: 'away-1', team: 'away', x: 2, y: 5, skills: [] });
      const state = board([attacker, defender, assister]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), TWO_DICE_DEF)).toBe(true);
    });

    it('grants an offensive assist from a team-mate adjacent to the defender (target ignored)', () => {
      // Attacker (2,6) blocks defender (1,5); team-mate at (0,5) is adjacent to the
      // defender and only "marked" by the defender (the block target, which is ignored)
      // → attacker ST 4 vs 3 → 2 dice, attacker chooses.
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const helper   = player({ id: 'home-1', x: 0, y: 5, skills: [] });
      const state = board([attacker, defender, helper]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), TWO_DICE_ATT)).toBe(true);
    });

    it('ignores a prone team-mate as an assister', () => {
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const proneAssister = player({ id: 'away-1', team: 'away', x: 2, y: 5, skills: [], prone: true });
      const state = board([attacker, defender, proneAssister]);

      // Prone assister exerts no assist → equal ST → 1 die → 5/6.
      expect(near(engine.blockProbability(state, attacker, defender, 'push'), ONE_DIE_PUSH)).toBe(true);
    });

    it('a Defensive defender does NOT block a plain assist that needs no Guard', () => {
      // Attacker (2,6) blocks a Defensive defender (1,5); helper (0,5) is adjacent only
      // to the defender itself, with no other marker. The base assist rule already
      // ignores the block target's own tackle zone, and Defensive only negates Guard's
      // bypass ability — it never blocks an assist that doesn't need Guard at all.
      // → attacker ST 4 vs 3 → 2 dice, attacker chooses.
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: ['Defensive'] });
      const helper   = player({ id: 'home-1', x: 0, y: 5, skills: [] });
      const state = board([attacker, defender, helper]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), TWO_DICE_ATT)).toBe(true);
    });

    it('a Defensive defender cancels a Guard-based assist that would otherwise bypass a marker', () => {
      // Reproduces the reported bug: helper has Guard, and is adjacent to a Defensive
      // defender plus another (non-Defensive) marker. Guard would normally let it
      // assist despite being marked, but the defender's Defensive negates Guard's
      // bypass ability → equal ST → 1 die → 5/6 push (not 2 dice).
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: ['Defensive'] });
      const helper   = player({ id: 'home-1', x: 0, y: 5, skills: ['Guard'] });
      const otherMarker = player({ id: 'away-1', team: 'away', x: 0, y: 6, skills: [] });
      const state = board([attacker, defender, helper, otherMarker]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), ONE_DIE_PUSH)).toBe(true);
    });

    it('a Defensive marker (not the block target) still cancels a Guard assist as before', () => {
      // Helper has Guard and is adjacent to the defender (assist target) plus a
      // separate Defensive marker → assist still cancelled (pre-existing behaviour).
      const attacker = player({ id: 'home-0', x: 2, y: 6, skills: ['Block'] });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 5, skills: [] });
      const helper   = player({ id: 'home-1', x: 0, y: 5, skills: ['Guard'] });
      const defensiveMarker = player({ id: 'away-1', team: 'away', x: 0, y: 6, skills: ['Defensive'] });
      const state = board([attacker, defender, helper, defensiveMarker]);

      expect(near(engine.blockProbability(state, attacker, defender, 'push'), ONE_DIE_PUSH)).toBe(true);
    });
  });

  describe('vomitProbability — Projectile Vomit (2D6 > AV)', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

    it('AV 8: needs 9+ on 2D6 → 10/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 } });
      expect(near(engine.vomitProbability(target), 10 / 36)).toBe(true);
    });

    it('AV 7: needs 8+ on 2D6 → 15/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 7 } });
      expect(near(engine.vomitProbability(target), 15 / 36)).toBe(true);
    });

    it('AV 10: needs 11+ on 2D6 → 3/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 10 } });
      expect(near(engine.vomitProbability(target), 3 / 36)).toBe(true);
    });
  });

  describe('hitAndRunSquares — Hit and Run free move (unmarked, empty, adjacent)', () => {
    it('offers empty adjacent squares that are not adjacent to a standing opponent', () => {
      // Attacker at (2,2); a standing opponent at (0,2) marks (1,1), (1,2), (1,3).
      const attacker = player({ id: 'home-0', x: 2, y: 2, skills: ['Hit and Run'] });
      const opponent = player({ id: 'away-0', team: 'away', x: 0, y: 2 });
      const state = board([attacker, opponent]);

      const squares = engine.hitAndRunSquares(state, attacker).map((s) => `${s.x},${s.y}`).sort();
      // (1,1),(1,2),(1,3) are marked by the opponent at (0,2); (2,1),(2,3),(3,1),(3,2),(3,3) remain.
      expect(squares).toEqual(['2,1', '2,3', '3,1', '3,2', '3,3'].sort());
    });

    it('excludes occupied and off-board squares', () => {
      // Attacker in the corner (0,0): only (0,1),(1,0),(1,1) are on-board; (1,1) is occupied.
      const attacker = player({ id: 'home-0', x: 0, y: 0, skills: ['Hit and Run'] });
      const blocker = player({ id: 'home-1', x: 1, y: 1 });
      const state = board([attacker, blocker]);

      const squares = engine.hitAndRunSquares(state, attacker).map((s) => `${s.x},${s.y}`).sort();
      expect(squares).toEqual(['0,1', '1,0'].sort());
    });

    it('ignores prone opponents when deciding whether a square is Marked', () => {
      // A prone opponent exerts no tackle zone, so it never marks an adjacent square.
      const attacker = player({ id: 'home-0', x: 2, y: 2, skills: ['Hit and Run'] });
      const prone = player({ id: 'away-0', team: 'away', x: 0, y: 2, prone: true });
      const state = board([attacker, prone]);

      const squares = engine.hitAndRunSquares(state, attacker).map((s) => `${s.x},${s.y}`).sort();
      expect(squares).toEqual(['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3'].sort());
    });

    it('returns [] when every adjacent square would leave the player Marked', () => {
      // Attacker at (1,1) boxed by opponents so all empty neighbours stay in a tackle zone.
      const attacker = player({ id: 'home-0', x: 1, y: 1, skills: ['Hit and Run'] });
      const o1 = player({ id: 'away-0', team: 'away', x: 0, y: 0 });
      const o2 = player({ id: 'away-1', team: 'away', x: 2, y: 2 });
      const o3 = player({ id: 'away-2', team: 'away', x: 0, y: 2 });
      const o4 = player({ id: 'away-3', team: 'away', x: 2, y: 0 });
      const state = board([attacker, o1, o2, o3, o4]);

      expect(engine.hitAndRunSquares(state, attacker)).toEqual([]);
    });
  });

  describe('stabProbability — Stab (2D6 > AV, no block dice)', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

    it('AV 8: needs 9+ on 2D6 → 10/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 } });
      expect(near(engine.stabProbability(target), 10 / 36)).toBe(true);
    });

    it('AV 7: needs 8+ on 2D6 → 15/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 7 } });
      expect(near(engine.stabProbability(target), 15 / 36)).toBe(true);
    });

    it('AV 9: needs 10+ on 2D6 → 6/36', () => {
      const target = player({ characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 9 } });
      expect(near(engine.stabProbability(target), 6 / 36)).toBe(true);
    });

    it('offers a Stab option against an adjacent standing opponent (Block/Dodge ignored)', () => {
      const attacker = player({ id: 'home-0', x: 2, y: 2, skills: ['Stab'] });
      const target = player({ id: 'away-0', team: 'away', x: 2, y: 3, skills: ['Block', 'Dodge'] });
      const state = board([attacker, target]);

      const ids = engine.actionOptions(state, attacker, target).map((o) => o.id);
      expect(ids).toContain('stab');
    });

    it('does not offer Stab once the attacker has already blocked', () => {
      const attacker = player({ id: 'home-0', x: 2, y: 2, skills: ['Stab'], hasBlocked: true });
      const target = player({ id: 'away-0', team: 'away', x: 2, y: 3 });
      const state = board([attacker, target]);

      const ids = engine.actionOptions(state, attacker, target).map((o) => o.id);
      expect(ids).not.toContain('stab');
    });
  });

  describe('Pass / Hand Off to an already-activated team-mate', () => {
    it('offers Pass and Hand Off when the receiver is already activated', () => {
      // Carrier holds the ball at (1,1); an adjacent team-mate is already activated.
      const carrier = player({ id: 'home-0', x: 1, y: 1 });
      const receiver = player({ id: 'home-1', x: 1, y: 2, activated: true });
      const state = board([carrier, receiver], { x: 1, y: 1 });

      const ids = engine.actionOptions(state, carrier, receiver).map((o) => o.id);
      expect(ids).toContain('pass');
      expect(ids).toContain('handoff');
      // An activated team-mate can no longer be activated/taken over.
      expect(ids).not.toContain('activate');
    });
  });
});

