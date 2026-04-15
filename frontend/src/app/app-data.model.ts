export interface RankingEntry {
  country: string;
  coach: string;
  points: number;
  touchdowns: number;
  casualties: number;
}

export interface Tournament {
  name: string;
  location: string;
  dates: string;
  format: string;
  url: string;
  sponsors?: string[];
  tracked?: boolean;
}

