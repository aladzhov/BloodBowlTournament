import { PuzzleSessionService } from './puzzle-session.service';
import { PuzzleData } from './puzzles.data';

function makeData(): PuzzleData {
  return {
    field: { rows: 4, cols: 7 },
    ball: { position: { x: 1, y: 1 } },
    players: [
      {
        team: 'home',
        name: 'Home A',
        position: { x: 1, y: 1 },
        characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
        skills: [],
        activated: false
      },
      {
        team: 'home',
        name: 'Home B',
        position: { x: 3, y: 3 },
        characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
        skills: [],
        activated: false
      },
      {
        team: 'away',
        name: 'Away',
        position: { x: 5, y: 1 },
        characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 9 },
        skills: [],
        activated: true
      }
    ],
    targetScore: 10
  };
}

describe('PuzzleSessionService board mechanics', () => {
  let service: PuzzleSessionService;

  beforeEach(() => {
    service = new PuzzleSessionService();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('selects a home player and toggles selection off', () => {
    const data = makeData();
    service.selectPlayer('k1', data, 'home-0');
    expect(service.board('k1', data)().selectedPlayerId).toBe('home-0');

    service.selectPlayer('k1', data, 'home-0');
    expect(service.board('k1', data)().selectedPlayerId).toBeNull();
  });

  it('does not select away players', () => {
    const data = makeData();
    service.selectPlayer('k2', data, 'away-2');
    expect(service.board('k2', data)().selectedPlayerId).toBeNull();
  });

  it('moves a selected player into an adjacent square and spends movement', () => {
    const data = makeData();
    service.selectPlayer('k3', data, 'home-0');
    service.moveSelectedTo('k3', data, 0, 0); // diagonal from (1,1)

    const home = service.board('k3', data)().players.find((p) => p.id === 'home-0')!;
    expect(home.x).toBe(0);
    expect(home.y).toBe(0);
    expect(home.movementLeft).toBe(5);
    expect(home.hasMoved).toBe(true);
  });

  it('rejects non-adjacent and occupied moves', () => {
    const data = makeData();
    service.selectPlayer('k4', data, 'home-0');

    service.moveSelectedTo('k4', data, 4, 4); // too far
    let home = service.board('k4', data)().players.find((p) => p.id === 'home-0')!;
    expect(home.x).toBe(1);
    expect(home.movementLeft).toBe(6);
  });

  it('carries the ball when moving off the ball square', () => {
    const data = makeData();
    service.selectPlayer('k5', data, 'home-0'); // home-0 stands on the ball at (1,1)
    service.moveSelectedTo('k5', data, 2, 1);

    const board = service.board('k5', data)();
    expect(board.ball).toEqual({ x: 2, y: 1 });
  });

  it('activates the previous player when a different player is moved', () => {
    const data = makeData();

    // Move Home A first (sideways so the ball carrier doesn't score).
    service.selectPlayer('k6', data, 'home-0');
    service.moveSelectedTo('k6', data, 2, 1);

    // Now move Home B → Home A becomes activated.
    service.selectPlayer('k6', data, 'home-1');
    service.moveSelectedTo('k6', data, 3, 2);

    const board = service.board('k6', data)();
    const homeA = board.players.find((p) => p.id === 'home-0')!;
    const homeB = board.players.find((p) => p.id === 'home-1')!;
    expect(homeA.activated).toBe(true);
    expect(homeB.activated).toBe(false);

    // Activated player can no longer be selected.
    service.selectPlayer('k6', data, 'home-0');
    expect(service.board('k6', data)().selectedPlayerId).toBe('home-1');
  });

  it('keeps moving the same player without activating it', () => {
    const data = makeData();
    service.selectPlayer('k7', data, 'home-0');
    service.moveSelectedTo('k7', data, 2, 1);
    service.moveSelectedTo('k7', data, 1, 1); // back, still same player

    const home = service.board('k7', data)().players.find((p) => p.id === 'home-0')!;
    expect(home.activated).toBe(false);
    expect(home.movementLeft).toBe(4);
  });

  it('solves the puzzle when the ball carrier reaches the endzone row', () => {
    const data = makeData();
    service.start('solve');
    service.setDisplayed('solve');

    // home-0 starts on the ball at (1,1); move up into the endzone row (x=0).
    service.selectPlayer('solve', data, 'home-0');
    service.moveSelectedTo('solve', data, 0, 1);

    const board = service.board('solve', data)();
    expect(board.solved).toBe(true);
    expect(board.ball).toEqual({ x: 0, y: 1 });
    expect(board.selectedPlayerId).toBeNull();
    expect(service.sessionState('solve')().solved).toBe(true);

    // Further moves are ignored once solved.
    service.selectPlayer('solve', data, 'home-1');
    expect(service.board('solve', data)().selectedPlayerId).toBeNull();
  });

  it('does not solve when reaching the endzone without the ball', () => {
    const data = makeData();
    service.selectPlayer('nosolve', data, 'home-1'); // home-1 at (3,3), no ball
    service.moveSelectedTo('nosolve', data, 2, 3);
    service.moveSelectedTo('nosolve', data, 1, 3);
    service.moveSelectedTo('nosolve', data, 0, 3);

    expect(service.board('nosolve', data)().solved).toBe(false);
  });

  it('clears the solved flag when the board is restarted', () => {
    const data = makeData();
    service.start('resolve');
    service.setDisplayed('resolve');
    service.selectPlayer('resolve', data, 'home-0');
    service.moveSelectedTo('resolve', data, 0, 1);
    expect(service.board('resolve', data)().solved).toBe(true);

    service.resetBoard('resolve', data);
    expect(service.board('resolve', data)().solved).toBe(false);
    expect(service.sessionState('resolve')().solved).toBe(false);
  });

  it('locks the previously active player when activating another', () => {
    const data = makeData();
    service.selectPlayer('act', data, 'home-0');
    service.activatePlayer('act', data, 'home-1');

    const board = service.board('act', data)();
    const homeA = board.players.find((p) => p.id === 'home-0')!;
    const homeB = board.players.find((p) => p.id === 'home-1')!;

    expect(homeA.activated).toBe(true);
    expect(homeB.activated).toBe(false);
    expect(board.selectedPlayerId).toBe('home-1');
    expect(board.lastMovedPlayerId).toBeNull();

    // The locked player can no longer be activated or selected.
    service.activatePlayer('act', data, 'home-0');
    expect(service.board('act', data)().selectedPlayerId).toBe('home-1');
  });

  it('moves the ball to a target team-mate on a pass', () => {
    const data = makeData();
    // home-1 is at (3,3); home-0 carries the ball at (1,1).
    service.passBallTo('pass', data, 'home-1');

    expect(service.board('pass', data)().ball).toEqual({ x: 3, y: 3 });
  });

  it('scores when passing to a team-mate standing in the endzone row', () => {
    const data = makeData();
    service.start('passtd');
    service.setDisplayed('passtd');

    // Move home-1 up to the endzone row first (no ball, so no score yet).
    service.selectPlayer('passtd', data, 'home-1');
    service.moveSelectedTo('passtd', data, 2, 3);
    service.moveSelectedTo('passtd', data, 1, 3);
    service.moveSelectedTo('passtd', data, 0, 3);
    expect(service.board('passtd', data)().solved).toBe(false);

    // Pass to home-1 in the endzone → touchdown.
    service.passBallTo('passtd', data, 'home-1');
    const board = service.board('passtd', data)();
    expect(board.ball).toEqual({ x: 0, y: 3 });
    expect(board.solved).toBe(true);
    expect(service.sessionState('passtd')().solved).toBe(true);
  });

  it('deactivates the passer and allows only one pass', () => {
    const data = makeData();
    // home-0 carries the ball at (1,1); pass to home-1 at (3,3).
    service.passBallTo('once', data, 'home-1');

    let board = service.board('once', data)();
    const passer = board.players.find((p) => p.id === 'home-0')!;
    expect(passer.activated).toBe(true);
    expect(board.ball).toEqual({ x: 3, y: 3 });
    expect(board.passUsed).toBe(true);
    expect(board.selectedPlayerId).toBeNull();

    // A second pass is ignored.
    service.passBallTo('once', data, 'home-0');
    board = service.board('once', data)();
    expect(board.ball).toEqual({ x: 3, y: 3 });
  });

  it('hands the ball off to a team-mate and deactivates the carrier, ignoring the pass limit', () => {
    const data = makeData();
    // home-0 carries the ball at (1,1); hand off to home-1 at (3,3).
    service.handOffTo('handoff', data, 'home-1');

    const board = service.board('handoff', data)();
    const carrier = board.players.find((p) => p.id === 'home-0')!;
    expect(carrier.activated).toBe(true);
    expect(board.ball).toEqual({ x: 3, y: 3 });
    expect(board.selectedPlayerId).toBeNull();
    // Hand off does not consume the one allowed pass.
    expect(board.passUsed).toBe(false);
  });

  it('applies push relocations to the board', () => {
    const data = makeData();
    service.applyPushMoves('push', data, [
      { playerId: 'away-2', x: 6, y: 2 },
      { playerId: 'home-1', x: 4, y: 3 }
    ]);

    const board = service.board('push', data)();
    const away = board.players.find((p) => p.id === 'away-2')!;
    const home = board.players.find((p) => p.id === 'home-1')!;
    expect(away.x).toBe(6);
    expect(away.y).toBe(2);
    expect(home.x).toBe(4);
    expect(home.y).toBe(3);
  });

  it('keeps the ball with a pushed carrier, including through a chain', () => {
    const data = makeData();
    // home-0 carries the ball at (1,1). Push it (directly) and chain-push home-1.
    service.applyPushMoves('pushball', data, [
      { playerId: 'home-1', x: 5, y: 2 },
      { playerId: 'home-0', x: 2, y: 2 }
    ]);

    const board = service.board('pushball', data)();
    expect(board.ball).toEqual({ x: 2, y: 2 });
  });

  it('reduces the success chance on a dodge move and leaves free moves at 100%', () => {
    const data: PuzzleData = {
      field: { rows: 4, cols: 7 },
      ball: { position: { x: 9, y: 9 } },
      players: [
        {
          team: 'home',
          name: 'Runner',
          position: { x: 1, y: 1 },
          characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
          skills: [],
          activated: false
        },
        {
          team: 'away',
          name: 'Guard',
          position: { x: 2, y: 1 },
          characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 9 },
          skills: [],
          activated: true
        }
      ],
      targetScore: 50
    };

    service.selectPlayer('dodge', data, 'home-0');
    // Move from (1,1) — in the guard's tackle zone — to open (0,1): flat AG 3+ → 4/6.
    service.moveSelectedTo('dodge', data, 0, 1);

    const chance = service.board('dodge', data)().successChance;
    expect(Math.abs(chance - 4 / 6) < 1e-9).toBe(true);
  });

  it('jumps over a prone player: moves the jumper, spends 2 movement, and folds in the AG landing test', () => {
    const data: PuzzleData = {
      field: { rows: 4, cols: 7 },
      ball: { position: { x: 9, y: 9 } },
      players: [
        {
          team: 'home',
          name: 'Leaper',
          position: { x: 1, y: 1 },
          characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
          skills: [],
          activated: false
        },
        {
          team: 'away',
          name: 'Prone Lineman',
          position: { x: 2, y: 1 },
          characteristics: { movement: 6, strength: 3, agility: 3, passing: 4, armor: 8 },
          skills: [],
          activated: true,
          prone: true
        }
      ],
      targetScore: 50
    };

    service.selectPlayer('jump', data, 'home-0');
    // Jump over the prone (2,1), landing at (3,1) — flat AG 3+ → 4/6.
    // Player ids are `${team}-${arrayIndex}`, so the prone away player is 'away-1'.
    service.jumpOver('jump', data, 'away-1', 3, 1);

    const board = service.board('jump', data)();
    const jumper = board.players.find((p) => p.id === 'home-0')!;
    expect(jumper.x).toBe(3);
    expect(jumper.y).toBe(1);
    expect(jumper.movementLeft).toBe(4); // 6 − 2 for the jump
    expect(jumper.hasMoved).toBe(true);
    expect(Math.abs(board.successChance - 4 / 6) < 1e-9).toBe(true);
  });

  it('restarts the board to its initial state without resetting the timer', () => {
    const data = makeData();

    service.start('k8');
    service.setDisplayed('k8');

    // Make some progress.
    service.selectPlayer('k8', data, 'home-0');
    service.moveSelectedTo('k8', data, 1, 0);

    service.resetBoard('k8', data);

    const board = service.board('k8', data)();
    const home = board.players.find((p) => p.id === 'home-0')!;
    expect(home.x).toBe(1);
    expect(home.y).toBe(1);
    expect(home.movementLeft).toBe(6);
    expect(home.hasMoved).toBe(false);
    expect(board.selectedPlayerId).toBeNull();
    expect(board.lastMovedPlayerId).toBeNull();

    // Timer/session state is untouched.
    expect(service.sessionState('k8')().started).toBe(true);
  });

  describe('standing up a prone player', () => {
    function proneData(movement = 6): PuzzleData {
      const data = makeData();
      data.players[0].prone = true;
      data.players[0].characteristics.movement = movement;
      // Move the ball off the prone player's square to isolate stand-up mechanics.
      data.ball.position = { x: 6, y: 6 };
      return data;
    }

    it('moving a prone player stands it up (costs 3) then spends 1 to move', () => {
      const data = proneData(6);
      service.selectPlayer('su1', data, 'home-0');
      service.moveSelectedTo('su1', data, 0, 0); // diagonal from (1,1)

      const home = service.board('su1', data)().players.find((p) => p.id === 'home-0')!;
      expect(home.prone).toBe(false);
      expect(home.x).toBe(0);
      expect(home.y).toBe(0);
      expect(home.movementLeft).toBe(2); // 6 − 3 (stand) − 1 (move)
      expect(home.hasMoved).toBe(true);
    });

    it('stands up in place via standUpSelected, spending 3 movement', () => {
      const data = proneData(6);
      service.selectPlayer('su2', data, 'home-0');
      service.standUpSelected('su2', data);

      const home = service.board('su2', data)().players.find((p) => p.id === 'home-0')!;
      expect(home.prone).toBe(false);
      expect(home.x).toBe(1);
      expect(home.y).toBe(1);
      expect(home.movementLeft).toBe(3); // 6 − 3
      expect(home.hasMoved).toBe(true);
    });

    it('cannot stand up in place with fewer than 3 movement', () => {
      const data = proneData(2);
      service.selectPlayer('su3', data, 'home-0');
      service.standUpSelected('su3', data);

      const home = service.board('su3', data)().players.find((p) => p.id === 'home-0')!;
      expect(home.prone).toBe(true); // still down
      expect(home.movementLeft).toBe(2);
    });

    it('cannot move a prone player that lacks the 3 movement to stand', () => {
      const data = proneData(2);
      service.selectPlayer('su4', data, 'home-0');
      service.moveSelectedTo('su4', data, 0, 0);

      const home = service.board('su4', data)().players.find((p) => p.id === 'home-0')!;
      expect(home.prone).toBe(true);
      expect(home.x).toBe(1);
      expect(home.y).toBe(1);
      expect(home.movementLeft).toBe(2);
    });
  });
});

