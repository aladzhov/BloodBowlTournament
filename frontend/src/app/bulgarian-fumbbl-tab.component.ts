import { Component } from '@angular/core';

interface FumbblTeam {
  name: string;
  logo: string;
  details: string[];
  roster: FumbblPlayer[];
}

interface FumbblPlayer {
  quantity: string;
  position: string;
  race: string;
  imageLabel: string;
  st: number;
  ag: number;
  pa: number;
  ma: number;
  av: number;
  skills: string;
  primary: string;
  secondary: string;
  cost: string;
}

@Component({
  selector: 'app-bulgarian-fumbbl-tab',
  standalone: false,
  templateUrl: './bulgarian-fumbbl-tab.component.html',
  styleUrl: './bulgarian-fumbbl-tab.component.css'
})
export class BulgarianFumbblTabComponent {
  readonly fumbblUrl = 'https://fumbbl.com/';

  readonly teams: FumbblTeam[] = [
    {
      name: 'Dobroto',
      logo: '/logo-dobroto.jpeg',
      details: [
        'Re-rolls: 70,000 gp.',
        'Apothecary: Yes',
        'Leagues: Old World Classic'
      ],
      roster: [
        {
          quantity: '0-1',
          position: 'Zmey',
          race: 'Big Guy, Dragon',
          imageLabel: 'Z',
          st: 5,
          ag: 4,
          pa: 5,
          ma: 8,
          av: 10,
          skills: 'Unchanelled Fury, Breath Fire, Mighty Blow, Claws',
          primary: 'GSM',
          secondary: '—',
          cost: '150,000'
        },
        {
          quantity: '0-1',
          position: 'Zmey',
          race: 'Big Guy, Human',
          imageLabel: 'Z',
          st: 3,
          ag: 2,
          pa: 4,
          ma: 5,
          av: 10,
          skills: 'Dauntless, Frenzy, Block, Leap',
          primary: 'GAS',
          secondary: '—',
          cost: '120,000'
        },
        {
          quantity: '0-3',
          position: 'Kuker',
          race: 'Blitzer, Human',
          imageLabel: 'K',
          st: 3,
          ag: 4,
          pa: 4,
          ma: 5,
          av: 9,
          skills: 'Arm Bar, Block, Tackle',
          primary: 'GS',
          secondary: 'A',
          cost: '90,000'
        },
        {
          quantity: '0-2',
          position: 'Samodiva',
          race: 'Runner, Human',
          imageLabel: 'S',
          st: 2,
          ag: 2,
          pa: 5,
          ma: 7,
          av: 8,
          skills: 'Dodge, Sidestep, Taunt',
          primary: 'AP',
          secondary: 'G',
          cost: '80,000'
        },
        {
          quantity: '0-12',
          position: 'Shepherd',
          race: 'Lineman, Human',
          imageLabel: 'Sh',
          st: 3,
          ag: 3,
          pa: 4,
          ma: 5,
          av: 9,
          skills: 'Jump Up',
          primary: 'GA',
          secondary: 'S',
          cost: '60,000'
        }
      ]
    },
    {
      name: 'Zloto',
      logo: '/logo-zloto.png',
      details: [
        'Re-rolls: 70,000 gp.',
        'Apothecary: Yes',
        'Leagues: Chaos Clash'
      ],
      roster: [
        {
          quantity: '0-1',
          position: 'Lamia',
          race: 'Big Guy, Dragon',
          imageLabel: 'L',
          st: 6,
          ag: 5,
          pa: 5,
          ma: 3,
          av: 10,
          skills: 'Loner 3+, Mighty Blow, Claws, Multiple Block, Prehensile Tail, Regeneration',
          primary: 'SM',
          secondary: '—',
          cost: '150,000'
        },
        {
          quantity: '0-2',
          position: 'Hala',
          race: 'Blitzer, Elemental',
          imageLabel: 'H',
          st: 4,
          ag: 3,
          pa: 0,
          ma: 6,
          av: 9,
          skills: 'Disturbing Presence, Frenzy, Brawler, No Hands',
          primary: 'GSM',
          secondary: 'A',
          cost: '110,000'
        },
        {
          quantity: '0-4',
          position: 'Talasum',
          race: 'Blocker, Spirit, Undead',
          imageLabel: 'T',
          st: 3,
          ag: 3,
          pa: 4,
          ma: 5,
          av: 9,
          skills: 'Shadowing, Tackle, No Hands, Regeneration',
          primary: 'GD',
          secondary: 'A',
          cost: '80,000'
        },
        {
          quantity: '0-12',
          position: 'Karakondjul',
          race: 'Lineman, Beastman',
          imageLabel: 'K',
          st: 3,
          ag: 2,
          pa: 3,
          ma: 6,
          av: 9,
          skills: 'Give and Go, Pile Driver, Eye Gouge',
          primary: 'D',
          secondary: 'AP',
          cost: '50,000'
        }
      ]
    }
  ];
}

