import { environment } from '../environments/environment';

export interface PuzzlePosition {
  x: number;
  y: number;
}

export interface PuzzleCharacteristics {
  movement: number;
  strength: number;
  agility: number;
  passing: number;
  armor: number;
}

export type PuzzleTeam = 'home' | 'away';

export type PuzzleType = 'score' | 'sack' | 'surf' | 'query'

export interface PuzzlePlayer {
  team: PuzzleTeam;
  name: string;
  position: PuzzlePosition;
  characteristics: PuzzleCharacteristics;
  skills: string[];
  extraSkills?: string[];
  activated?: boolean;
  prone?: boolean;
  /** Set on the player holding the ball at the start of the puzzle. */
  ball?: boolean;
  goTo?: PuzzlePosition[];
  /**
   * Whether a Both Down result against this player may be part of a correct
   * solution. When explicitly `false`, choosing Both Down against this player is
   * allowed to continue, but the puzzle is flagged as an incorrect solution
   * (even if the resulting success chance matches the target). Defaults to allowed.
   */
  bothDown?: boolean;
}

export interface PuzzleField {
  rows: number;
  cols: number;
}

export interface PuzzleBall {
  position: PuzzlePosition;
}

/**
 * The question posed by a `query` puzzle. The board is read-only for these
 * puzzles — the solver inspects the position and answers, either by typing a
 * freeform answer or by picking one of the predefined `options`.
 */
export interface PuzzleQuery {
  /** The question shown to the solver. */
  question: string;
  /**
   * Predefined answers. When present the solver picks exactly one of them
   * (radio buttons); when absent the solver types a freeform answer.
   */
  options?: string[];
  /**
   * Accepted answer(s). Matching is case-insensitive and ignores surrounding
   * and repeated whitespace. For option-based queries each accepted answer
   * should match one of the `options`.
   */
  answer: string | string[];
  /**
   * Optional explanation revealed once the query has been answered. Provide an
   * array to render it as separate lines/paragraphs.
   */
  explanation?: string | string[];
}

export interface PuzzleData {
  field: PuzzleField;
  /**
   * Position of a loose ball lying on the pitch. Only needed when no player
   * carries the ball — a player flagged with `ball: true` takes precedence.
   * When neither is present the puzzle has no ball on the pitch.
   */
  ball?: PuzzleBall;
  players: PuzzlePlayer[];
  /**
   * Best achievable success chance as a percentage. Not meaningful for `query`
   * puzzles, where it defaults to 100.
   */
  targetScore?: number;
  /** Required for `query` puzzles; ignored by every other puzzle type. */
  query?: PuzzleQuery;
  /** Optional ordered hints, revealed one at a time when the solver asks. */
  hints?: string[];
}

export interface Puzzle {
  date: string; // ISO date string, e.g. "2026-06-01"
  title: string;
  author: string;
  /** Defaults to 'score' when absent from the JSON file. */
  type?: PuzzleType;
  data: PuzzleData;
}

export const puzzles: Puzzle[] = [

];

export function getSortedPuzzles(): Puzzle[] {
  return [...puzzles].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/** Sorted puzzles excluding any whose date is in the future relative to today. */
export function getVisiblePuzzles(referenceDate: Date = new Date(), source: Puzzle[] = puzzles): Puzzle[] {
  const sorted = [...source].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  // Dev builds may show future-dated puzzles; production always hides them.
  if (environment.showFuturePuzzles) {
    return sorted;
  }
  const todayKey = toDateKey(referenceDate);
  return sorted.filter((puzzle) => puzzle.date <= todayKey);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

