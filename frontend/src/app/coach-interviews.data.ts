export interface CoachInterviewQuestion {
  question: string;
  answer: string;
}

export interface CoachInterview {
  intro: string;
  questions: CoachInterviewQuestion[];
}

export const coachInterviews: Record<string, CoachInterview> = {
  'Emil Tzanev': {
    intro: `Short interview slot for Emil Tzanev.`,
    questions: [
      {
        question: 'How would you describe your Blood Bowl style in one sentence?',
        answer: 'rorarimbo will add a short answer soon.'
      },
      {
        question: 'What keeps you coming back to tournaments in Bulgaria?',
        answer: 'Interview answer coming soon.'
      },
      {
        question: 'What is your goal for the rest of the season?',
        answer: 'Interview answer coming soon.'
      }
    ]
  },
  'mozz': {
    intro: `Short interview slot for mozz.`,
    questions: [
      {
        question: 'How would you describe your Blood Bowl style in one sentence?',
        answer: 'rorarimbo will add a short answer soon.'
      },
      {
        question: 'What keeps you coming back to tournaments in Bulgaria?',
        answer: 'Interview answer coming soon.'
      },
      {
        question: 'What is your goal for the rest of the season?',
        answer: 'Interview answer coming soon.'
      }
    ]
  }
};

export function getCoachInterview(coach: string): CoachInterview {
  return coachInterviews[coach];
}

