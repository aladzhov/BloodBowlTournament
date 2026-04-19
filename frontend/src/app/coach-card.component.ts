import { Component, EventEmitter, Input, Output } from '@angular/core';

import { RankingEntry } from './app-data.model';
import { CoachInterview, getCoachInterview } from './coach-interviews.data';
import { standingsEntries } from './standings.data';

interface RankedCoachEntry extends RankingEntry {
  rank: number;
}

@Component({
  selector: 'app-coach-card',
  standalone: false,
  templateUrl: './coach-card.component.html',
  styleUrl: './coach-card.component.css'
})
export class CoachCardComponent {
  readonly coaches: RankedCoachEntry[] = standingsEntries
    .filter((entry) => entry.country === 'bg')
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

  activeCoach = '';

  @Output() readonly selectedCoachChange = new EventEmitter<string>();

  @Input() set selectedCoach(coach: string | null) {
    if (coach && this.coaches.some((entry) => entry.coach === coach)) {
      this.activeCoach = coach;
    }
  }

  selectCoach(coach: string): void {
    this.activeCoach = coach;
    this.selectedCoachChange.emit(coach);
  }

  isActiveCoach(coach: string): boolean {
    return this.activeCoach === coach;
  }

  get activeCoachEntry(): RankedCoachEntry | null {
    return this.coaches.find(({ coach }) => coach === this.activeCoach) ?? null;
  }

  get activeInterview(): CoachInterview | null {
    if (!this.activeCoach) {
      return null;
    }

    return getCoachInterview(this.activeCoach);
  }
}

