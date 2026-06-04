
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
  activated: boolean;
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
  // return [...source];
  const todayKey = toDateKey(referenceDate);
  return [...source]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((puzzle) => puzzle.date <= todayKey);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

