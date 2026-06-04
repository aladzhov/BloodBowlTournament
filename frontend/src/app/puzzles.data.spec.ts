import { getSortedPuzzles, getVisiblePuzzles } from './puzzles.data';

describe('getVisiblePuzzles', () => {
  it('excludes puzzles dated in the future relative to the reference date', () => {
    const allSorted = getSortedPuzzles();
    expect(allSorted.length).toBeGreaterThan(0);

    // Use the earliest puzzle date as the reference: later puzzles are "future".
    const reference = new Date(allSorted[0].date);
    const visible = getVisiblePuzzles(reference);

    expect(visible.every((puzzle) => new Date(puzzle.date) <= reference)).toBe(true);
    expect(visible.length).toBeLessThan(allSorted.length);
  });

  it('includes a puzzle dated exactly on the reference day', () => {
    const allSorted = getSortedPuzzles();
    const firstDate = allSorted[0].date;
    const visible = getVisiblePuzzles(new Date(firstDate));

    expect(visible.some((puzzle) => puzzle.date === firstDate)).toBe(true);
  });

  it('returns all puzzles when the reference date is in the far future', () => {
    const allSorted = getSortedPuzzles();
    const visible = getVisiblePuzzles(new Date('2999-12-31'));

    expect(visible.length).toBe(allSorted.length);
  });
});

