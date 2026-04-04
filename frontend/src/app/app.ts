import {Component} from '@angular/core';
import {RankingEntry, Tournament} from './app-data.model';
import {standingsEntries} from './standings.data';
import {allTournaments} from './tournaments.data';

interface FeatureCard {
  title: string;
  description: string;
  details?: string[];
}

interface RankedEntry extends RankingEntry {
  rank: number;
}

interface DatedArchiveTournament extends Tournament {
  sortDate: Date;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App {
  title = 'Bulgarian Blood Bowl Cup';
  season = '2026';

  readonly featureCards: FeatureCard[] = [
    {
      title: 'The Cup',
      description: 'Every tournament held in Bulgaria contributes toward the annual cup standings and the race for the crown.'
    },
    {
      title: 'The Points',
      description: 'The top 10 players of each tournament earn points depending on their rank',
      details: [
        'The tournament winner get one bonus point',
        'In a tie, Touchdowns take priority, followed by Casualties.'
      ]
    },
    {
      title: 'The Prizes',
      description: 'TBD :)'
    }
  ];

  readonly standingsEntries = standingsEntries;

  get standings(): RankedEntry[] {
    return [...this.standingsEntries]
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points;
        }

        if (right.touchdowns !== left.touchdowns) {
          return right.touchdowns - left.touchdowns;
        }

        return right.casualties - left.casualties;
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }

  readonly allTournaments = allTournaments;

  get upcomingTournaments(): Tournament[] {
    const today = this.startOfDay(new Date());

    return this.allTournaments
      .map((tournament) => this.withSortDate(tournament))
      .filter((tournament) => tournament.sortDate >= today)
      .sort((left, right) => left.sortDate.getTime() - right.sortDate.getTime())
      .map(({ sortDate: _, ...tournament }) => tournament);
  }

  get pastTournaments(): Tournament[] {
    const today = this.startOfDay(new Date());

    return this.allTournaments
      .map((tournament) => this.withSortDate(tournament))
      .filter((tournament) => tournament.sortDate < today)
      .sort((left, right) => right.sortDate.getTime() - left.sortDate.getTime())
      .map(({ sortDate: _, ...tournament }) => tournament);
  }

  get latestTrackedPastTournament(): Tournament | null {
    const today = this.startOfDay(new Date());

    return this.allTournaments
      .map((tournament) => this.withSortDate(tournament))
      .filter((tournament) => tournament.tracked && tournament.sortDate < today)
      .sort((left, right) => right.sortDate.getTime() - left.sortDate.getTime())
      .map(({ sortDate: _, ...tournament }) => tournament)[0] ?? null;
  }

  private withSortDate(tournament: Tournament): DatedArchiveTournament {
    return {
      ...tournament,
      sortDate: this.parseArchiveTournamentDate(tournament.dates)
    };
  }

  private parseArchiveTournamentDate(value: string): Date {
    const directDate = this.tryCreateDate(value);
    if (directDate) {
      return directDate;
    }

    const monthYearMatch = value.match(/(?:TBD\s+)?([A-Za-z]+)\s+(\d{4})/i);
    if (monthYearMatch) {
      const monthIndex = this.monthIndex(monthYearMatch[1]);
      const year = Number(monthYearMatch[2]);

      if (monthIndex >= 0) {
        return new Date(year, monthIndex, 1);
      }
    }

    return new Date(0);
  }

  private tryCreateDate(value: string): Date | null {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : this.startOfDay(parsed);
  }

  private monthIndex(month: string): number {
    return [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december'
    ].indexOf(month.toLowerCase());
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
