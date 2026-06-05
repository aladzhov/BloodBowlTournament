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
    activated: false,
    movementLeft: 6,
    rushLeft: 2,
    hasMoved: false,
    sureFeetUsed: false,
    prone: false,
    hasBlocked: false,
    frenzyUsed: false,
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
    chanceLog: []
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

  it('offers no actions towards an already-activated team-mate', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const used = player({ id: 'home-1', x: 3, y: 2, activated: true });

    const options = engine.actionOptions(
      board([selected, used], { x: 1, y: 1 }),
      selected,
      used
    );
    expect(options).toEqual([]);
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

    it('honours the natural-6 golden rule on hard dodges', () => {
      // AG 6+, no modifiers → only a natural 6 → 1/6.
      const mover = player({ id: 'home-0', x: 1, y: 1, characteristics: ag(6) });
      const enemy = player({ id: 'away-0', team: 'away', x: 2, y: 1 });
      expect(near(engine.dodgeProbability(board([mover, enemy]), mover, 0, 1), 1 / 6)).toBe(true);
    });
  });

  describe('blockOptions', () => {
    it('still offers Stumble even when the defender has Dodge (it resolves as a push)', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('inserts Stumble between Push Back and Pow when the defender has no Dodge', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: [] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('offers Stumble when the attacker has Tackle even if the defender has Dodge', () => {
      const attacker = player({ id: 'home-0', skills: ['Tackle'] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['pushback', 'stumble', 'pow']);
    });

    it('returns nothing without both attacker and defender', () => {
      expect(engine.blockOptions(null, null)).toEqual([]);
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
  });
});

