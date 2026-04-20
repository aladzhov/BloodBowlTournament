import { RankingEntry } from './app-data.model';
import { standingsEntries } from './standings.data';

export interface RankedCoachEntry extends RankingEntry {
  rank: number;
}

function compareCoachEntries(left: RankingEntry, right: RankingEntry): number {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.touchdowns !== left.touchdowns) {
    return right.touchdowns - left.touchdowns;
  }

  return right.casualties - left.casualties;
}

export const rankedBulgarianCoachEntries: RankedCoachEntry[] = standingsEntries
  .filter((entry) => entry.country === 'bg')
  .sort(compareCoachEntries)
  .map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));

export const bulgarianCoachNames = rankedBulgarianCoachEntries.map(({ coach }) => coach);

export function slugifyCoachName(coach: string): string {
  return coach
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function getCoachCardPath(coach: string): string {
  return `/coach/${slugifyCoachName(coach)}`;
}

export function findCoachBySlug(slug: string): string | null {
  const normalizedSlug = slugifyCoachName(safeDecodeURIComponent(slug));

  return bulgarianCoachNames.find((coach) => slugifyCoachName(coach) === normalizedSlug) ?? null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

