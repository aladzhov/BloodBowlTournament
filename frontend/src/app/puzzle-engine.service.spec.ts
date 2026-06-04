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
    hasMoved: false,
    ...overrides
  };
}

function board(players: WorkingPlayer[], ball = { x: 9, y: 9 }): WorkingBoard {
  return {
    rows: 4,
    cols: 7,
    targetScore: 10,
    ball,
    players,
    selectedPlayerId: players.find((p) => p.team === 'home')?.id ?? null,
    lastMovedPlayerId: null,
    solved: false,
    passUsed: false,
    successChance: 1
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
    const friend = player({ id: 'home-1', x: 4, y: 2 });
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
    const friend = player({ id: 'home-1', x: 4, y: 2, activated: false });

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
    const used = player({ id: 'home-1', x: 4, y: 2, activated: true });

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

  it('returns Block / Jump over for an opposition target', () => {
    const selected = player({ id: 'home-0', x: 1, y: 1 });
    const opponent = player({ id: 'away-0', team: 'away', x: 2, y: 1 });

    const options = engine.actionOptions(board([selected, opponent]), selected, opponent);
    expect(options.map((o) => o.id)).toEqual(['block', 'jump']);
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
      const blocker = player({ id: 'home-0', x: 1, y: 2 });
      const defender = player({ id: 'away-0', team: 'away', x: 1, y: 3 }); // bottom row of a 4-row board
      const state = board([blocker, defender]);

      const dir = engine.pushDirection(blocker, defender);
      // Pushback would be row y=4, which is off the 4-row board → nothing offered.
      expect(engine.pushOptions(state, defender.x, defender.y, dir).length).toBe(0);
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
    it('offers Push+ and Pow without Stumble+ when the defender has Dodge', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['push', 'pow']);
    });

    it('inserts Stumble+ between Push+ and Pow when the defender has no Dodge', () => {
      const attacker = player({ id: 'home-0', skills: [] });
      const defender = player({ id: 'away-0', team: 'away', skills: [] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['push', 'stumble', 'pow']);
    });

    it('offers Stumble+ when the attacker has Tackle even if the defender has Dodge', () => {
      const attacker = player({ id: 'home-0', skills: ['Tackle'] });
      const defender = player({ id: 'away-0', team: 'away', skills: ['Dodge'] });

      const options = engine.blockOptions(attacker, defender);
      expect(options.map((o) => o.id)).toEqual(['push', 'stumble', 'pow']);
    });

    it('returns nothing without both attacker and defender', () => {
      expect(engine.blockOptions(null, null)).toEqual([]);
    });
  });
});

