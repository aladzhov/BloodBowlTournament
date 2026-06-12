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

export type PuzzleType = 'score' | 'sack' | 'surf'

export interface PuzzlePlayer {
  team: PuzzleTeam;
  name: string;
  position: PuzzlePosition;
  characteristics: PuzzleCharacteristics;
  skills: string[];
  extraSkills?: string[];
  activated?: boolean;
  prone?: boolean;
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

export interface PuzzleData {
  field: PuzzleField;
  ball: PuzzleBall;
  players: PuzzlePlayer[];
  targetScore: number;
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

