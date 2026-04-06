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
  st: string;
  ag: string;
  pa: string;
  ma: string;
  av: string;
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
          ma: '8',
          st: '5',
          ag: '4+',
          pa: '5+',
          av: '10+',
          skills: 'Breath Fire, Claws, Mighty Blow +1, Unchanelled Fury',
          primary: 'GSM',
          secondary: '—',
          cost: '150,000'
        },
        {
          quantity: '0-1',
          position: 'Zmey',
          race: 'Big Guy, Human',
          imageLabel: 'Z',
          ma: '5',
          st: '3',
          ag: '2+',
          pa: '4+',
          av: '10+',
          skills: 'Block, Dauntless, Frenzy, Leap',
          primary: 'GAS',
          secondary: '—',
          cost: '120,000'
        },
        {
          quantity: '0-3',
          position: 'Kuker',
          race: 'Blitzer, Human',
          imageLabel: 'K',
          ma: '5',
          st: '3',
          ag: '4+',
          pa: '4+',
          av: '9+',
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
          ma: '7',
          st: '2',
          ag: '2+',
          pa: '-',
          av: '8+',
          skills: 'Dodge, My Ball, Sidestep, Taunt, Trickster',
          primary: 'A',
          secondary: 'G',
          cost: '80,000'
        },
        {
          quantity: '0-12',
          position: 'Shepherd',
          race: 'Lineman, Human',
          imageLabel: 'Sh',
          ma: '5',
          st: '3',
          ag: '3+',
          pa: '4+',
          av: '9+',
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
        'Apothecary: No',
        'Leagues: Chaos Clash'
      ],
      roster: [
        {
          quantity: '0-1',
          position: 'Lamia',
          race: 'Big Guy, Dragon',
          imageLabel: 'L',
          ma: '3',
          st: '6',
          ag: '5+',
          pa: '5+',
          av: '10+',
          skills: 'Claws, Loner 3+, Mighty Blow +1, Multiple Block, Prehensile Tail, Regeneration, Thick Skull',
          primary: 'SM',
          secondary: '—',
          cost: '150,000'
        },
        {
          quantity: '0-2',
          position: 'Hala',
          race: 'Blitzer, Elemental',
          imageLabel: 'H',
          ma: '6',
          st: '4',
          ag: '3+',
          pa: '-',
          av: '9+',
          skills: 'Brawler, Disturbing Presence, Foul Appearance, Frenzy, No Hands',
          primary: 'GSM',
          secondary: 'A',
          cost: '110,000'
        },
        {
          quantity: '0-4',
          position: 'Talasum',
          race: 'Blocker, Spirit, Undead',
          imageLabel: 'T',
          ma: '5',
          st: '3',
          ag: '3+',
          pa: '-',
          av: '9+',
          skills: 'No Hands, Regeneration, Shadowing, Tackle',
          primary: 'GD',
          secondary: 'A',
          cost: '80,000'
        },
        {
          quantity: '0-16',
          position: 'Karakondjul',
          race: 'Lineman, Beastman',
          imageLabel: 'K',
          ma: '6',
          st: '2',
          ag: '2+',
          pa: '3+',
          av: '8+',
          skills: 'Dodge, Fumblerooski, Stunty',
          primary: 'D',
          secondary: 'AP',
          cost: '50,000'
        }
      ]
    }
  ];
}

