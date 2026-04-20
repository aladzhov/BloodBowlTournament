import { Component, EventEmitter, Input, Output } from '@angular/core';

import { RankedCoachEntry, rankedBulgarianCoachEntries } from './coach-card.data';
import {CoachInterview, getCoachInterview, hasCoachInterview} from './coach-interviews.data';

@Component({
  selector: 'app-coach-card',
  standalone: false,
  templateUrl: './coach-card.component.html',
  styleUrl: './coach-card.component.css'
})
export class CoachCardComponent {
  readonly coaches = rankedBulgarianCoachEntries;

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

  protected readonly hasCoachInterview = hasCoachInterview;
}

