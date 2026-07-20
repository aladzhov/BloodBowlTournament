import { Tournament } from './app-data.model';

export const allTournaments: Tournament[] = [
  {
    name: 'Surva Bowl 2026',
    location: 'The Other Castle, Sofia',
    dates: '18 January 2026',
    format: 'EuroBowl 2026 v2',
    url: 'https://tourplay.net/en/blood-bowl/surva-bowl-2026/classifications',
    tracked: true
  },
  {
    name: 'Mootland Grand Half-Bowl 2026',
    location: 'Mox Games, Sofia',
    dates: '04 April 2026',
    format: 'EuroBowl 2026 v3',
    url: 'https://tourplay.net/en/blood-bowl/mootland-grand-half-bowl-2026/classifications',
    tracked: true
  },
  {
    name: 'THE WYRM-UP',
    location: 'The Other Castle, Sofia',
    dates: '31 May 2026',
    format: 'EuroBowl 2026',
    url: 'https://tourplay.net/en/blood-bowl/the-wyrm-up/classifications',
    tracked: true
  },
  {
    name: 'Scorchers Cup',
    location: 'The Other Castle, Sofia',
    dates: '19 July 2026',
    format: 'EuroBowl 2026',
    url: 'https://tourplay.net/en/blood-bowl/scorchers-cup/classifications',
    sponsors: [{
      logo: "charlie-vector-logo.png",
      url: "https://www.charlievictorproducts.com/collections/all"
    },
      {
        logo: "the-other-castle.png",
        url: "https://castle.bg/"
      }],
    tracked: true
  },
  {
    name: 'Melon Field Bowl 7',
    location: 'TBD, Sofia',
    dates: 'TBD November 2026',
    format: 'EuroBowl 2026',
    url: ''
  }
];

