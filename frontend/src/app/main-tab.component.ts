import { Component, HostListener } from '@angular/core';
import { RankingEntry, Tournament } from './app-data.model';
import { standingsEntries } from './standings.data';
import { allTournaments } from './tournaments.data';

interface FeatureCard {
  title: string;
  description: string;
  details?: string[];
  imageSrc?: string;
  imageAlt?: string;
  href?: string;
}

interface RankedEntry extends RankingEntry {
  rank: number;
}

interface DatedArchiveTournament extends Tournament {
  sortDate: Date;
}

@Component({
  selector: 'app-main-tab',
  standalone: false,
  templateUrl: './main-tab.component.html',
  styleUrl: './main-tab.component.css'
})
export class MainTabComponent {
  readonly featureCards: FeatureCard[] = [
    {
      title: 'The Cup',
      description: 'Battle for Bulgaria! Every tournament, every match counts. Every win brings the Crown closer!'
    },
    {
      title: 'The Points',
      description: 'Top 10 finishers bag the points',
      details: [
        'Tournament winners get one bonus',
        'Tie-breaks: Touchdowns and then broken bones'
      ]
    },
    {
      title: 'The Prize',
      description: 'One Champion, one Prize, one Legendary Ball:',
      imageSrc: '/tomy-prize.jpg',
      imageAlt: 'Blood Bowl plush'
    }
  ];

  readonly title = 'Bulgarian Blood Bowl Cup';
  readonly season = '2026';

  readonly standingsEntries = standingsEntries;
  readonly allTournaments = allTournaments;

  selectedFeatureImage: Pick<FeatureCard, 'title' | 'imageSrc' | 'imageAlt'> | null = null;

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

  getFlagEmoji(countryCode: string): string {
    const normalized = countryCode.trim().toUpperCase();

    if (!/^[A-Z]{2}$/.test(normalized)) {
      return '🏳️';
    }

    return String.fromCodePoint(
      ...[...normalized].map((char) => 127397 + char.charCodeAt(0))
    );
  }

  openFeatureImage(feature: FeatureCard): void {
    if (!feature.imageSrc) {
      return;
    }

    this.selectedFeatureImage = {
      title: feature.title,
      imageSrc: feature.imageSrc,
      imageAlt: feature.imageAlt
    };
  }

  closeFeatureImage(): void {
    this.selectedFeatureImage = null;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.selectedFeatureImage) {
      this.closeFeatureImage();
    }
  }

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

