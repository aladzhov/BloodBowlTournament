import { getVisiblePuzzles } from './puzzles.data';
import type { Puzzle } from './puzzles.data';

const mockPuzzles: Puzzle[] = [
  { date: '2026-06-01', title: 'A', author: 'x', data: { field: { rows: 4, cols: 7 }, ball: { position: { x: 0, y: 0 } }, players: [], targetScore: 100 } },
  { date: '2026-06-05', title: 'B', author: 'x', data: { field: { rows: 4, cols: 7 }, ball: { position: { x: 0, y: 0 } }, players: [], targetScore: 100 } },
  { date: '2026-06-10', title: 'C', author: 'x', data: { field: { rows: 4, cols: 7 }, ball: { position: { x: 0, y: 0 } }, players: [], targetScore: 100 } },
];

describe('getVisiblePuzzles', () => {
  it('excludes puzzles dated in the future relative to the reference date', () => {
    const reference = new Date('2026-06-05');
    const visible = getVisiblePuzzles(reference, mockPuzzles);

    expect(visible.every((p) => p.date <= '2026-06-05')).toBe(true);
    expect(visible.length).toBeLessThan(mockPuzzles.length);
  });

  it('includes a puzzle dated exactly on the reference day', () => {
    const visible = getVisiblePuzzles(new Date('2026-06-05'), mockPuzzles);

    expect(visible.some((p) => p.date === '2026-06-05')).toBe(true);
  });

  it('returns all puzzles when the reference date is in the far future', () => {
    const visible = getVisiblePuzzles(new Date('2999-12-31'), mockPuzzles);

    expect(visible.length).toBe(mockPuzzles.length);
  });
});

