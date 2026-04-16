import { Component } from '@angular/core';

type TeamViewTab = 'roster' | 'concept';

interface FumbblTeam {
  name: string;
  logo: string;
  details: string[];
  roster: FumbblPlayer[];
  stl: string;
  conceptImages: FumbblConceptImage[];
}

interface FumbblConceptImage {
  src: string;
  alt: string;
  title: string;
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
  motivation: string;
  song: string;
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
      stl: "",
      conceptImages: [
        {
          src: '/dobroto/kuker.png',
          alt: 'Dobroto 3D concept of a Kuker',
          title: 'Kuker Concept'
        },
        {
          src: '/dobroto/kuker2.png',
          alt: 'Dobroto alternate 3D concept of a Kuker',
          title: 'Kuker Alternate Concept'
        },
        {
          src: '/dobroto/shepherd.png',
          alt: 'Dobroto 3D concept of a Shepherd',
          title: 'Shepherd Concept'
        },
        {
          src: '/dobroto/yabalka.png',
          alt: 'Dobroto 3D concept of Zlatna Yabalka',
          title: 'Zlatna Yabalka Concept'
        }
      ],
      roster: [
        {
          quantity: '0-1',
          position: 'Zmey',
          race: 'Big Guy, Dragon',
          imageLabel: 'Zm',
          ma: '8',
          st: '5',
          ag: '4+',
          pa: '5+',
          av: '10+',
          skills: 'Breath Fire, Claws, Mighty Blow +1, Unchanelled Fury',
          primary: 'GSM',
          secondary: '—',
          cost: '150,000',
          motivation: "The zmey (dragon form) is colossal winged serpent with human-like intelligence. A guardian who protect the harvest. The idea in the team is to pick one of the Zmeys",
          song: "Очи му са като звезди, крила му са позлатени.",
        },
        {
          quantity: '0-1',
          position: 'Zmey',
          race: 'Big Guy, Human',
          imageLabel: 'Zm',
          ma: '5',
          st: '3',
          ag: '2+',
          pa: '4+',
          av: '10+',
          skills: 'Block, Dauntless, Frenzy, Leap',
          primary: 'GAS',
          secondary: '—',
          cost: '120,000',
          motivation: "The zmey (human form) is a powerful warrior hiding his wings and scales beneath a cloak. He walks among people to experience the world he protects. The idea in the team is to pick one of the Zmeys",
          song: "Че змей е Стоян, мале мо, змей е и змейски ще си остане.",
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
          cost: '90,000',
          motivation: "A masked ritualist draped in heavy furs and massive copper bells. They seek spiritual purification frightening away the darkness with noise and dance",
          song: "Хлопайте, хлопки, звънете, звънци, да бягат надалеч злите духци!"
        },
        {
          quantity: '0-1',
          position: 'Zlatna Yabalka',
          race: 'Runner, Human',
          imageLabel: 'ZY',
          ma: '6',
          st: '2',
          ag: '3+',
          pa: '3+',
          av: '8+',
          skills: 'Fend, Leader, Pick-me-up, Sure Hands',
          primary: 'GP',
          secondary: 'A',
          cost: '90,000',
          motivation: "The zlatna yabalka (golden apple) is a symbol of life, health, and cosmic order",
          song: "Велике, моме цървена,\nта що си толко хубава"
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
          cost: '60,000',
          motivation: "The symbol of the common man’s resilience. Armed only with a wooden flute and a pole (krivachka), he is the bridge between the mundane and the magical, often outsmarting ancient beings through folk wisdom and patience",
          song: "Излезли са три сюрии,\nтри сюрии с три овчаре"
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
      stl: "",
      conceptImages: [
        {
          src: '/zloto/lamya.png',
          alt: 'Zloto 3D concept of a Lamya',
          title: 'Lamya Concept'
        },
        {
          src: '/zloto/hala.png',
          alt: 'Zloto 3D concept of a Hala',
          title: 'Hala Concept'
        },
        {
          src: '/zloto/samodiva1.png',
          alt: 'Zloto 3D concept of a Samodiva',
          title: 'Samodiva Concept I'
        },
        {
          src: '/zloto/samodiva2.png',
          alt: 'Zloto alternate 3D concept of a Samodiva',
          title: 'Samodiva Concept II'
        }
      ],
      roster: [
        {
          quantity: '0-1',
          position: 'Lamya',
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
          cost: '150,000',
          motivation: "A multi-headed reptilian horror with a cavernous maw. Unlike the noble Zmey, the Lamya is pure malice. She \"locks\" the communal wells and rivers, demanding human sacrifices just to allow the water to flow.",
          song: ""
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
          cost: '110,000',
          motivation: "A monstrous, shapeless spirit of the vortex. She is the literal incarnation of the devouring storm. Her only motivation is consumption—she swallows the sun and moon during eclipses and destroys everything in her path just to feed her bottomless hunger",
          song: ""
        },
        {
          quantity: '0-4',
          position: 'Talasam',
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
          cost: '80,000',
          motivation: "A shadowy spirit bound to a specific place or treasure. He is a restless guardian born from blood or gold. While usually content to stay hidden, he can turn lethal if his territory is encroached upon, dragging victims into the shadows to join his eternal watch",
          song: ""
        },
        {
          quantity: '0-2',
          position: 'Samodiva',
          race: 'Runner, Spirit',
          imageLabel: 'S',
          ma: '7',
          st: '2',
          ag: '2+',
          pa: '-',
          av: '8+',
          skills: 'Dodge, My Ball, Sidestep, Taunt, Trickster',
          primary: 'A',
          secondary: 'G',
          cost: '80,000',
          motivation: "A forest nymph of breathtaking beauty, protector of the 'untouched'. Samodivas are notoriously fickle and vengeful. They are known to sometimes lure travelers into \"death-dances\"",
          song: "Самодиви в бяла премена, чудни, прекрасни, песен подемат"
        },
        {
          quantity: '0-16',
          position: 'Karakondzhul',
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
          cost: '50,000',
          motivation: "A part man, part beast, often with horse-like hooves. He is motivated by pure, chaotic mischief",
          song: ""
        }
      ]
    }
  ];

  readonly teamTabs: Array<{ id: TeamViewTab; label: string }> = [
    { id: 'roster', label: 'Roster' },
    { id: 'concept', label: '3D Concept' }
  ];

  readonly activeTeamTabs = this.teams.reduce<Record<string, TeamViewTab>>((tabs, team) => {
    tabs[team.name] = 'roster';
    return tabs;
  }, {});

  selectTeamTab(teamName: string, tabId: TeamViewTab): void {
    this.activeTeamTabs[teamName] = tabId;
  }

  isTeamTabActive(teamName: string, tabId: TeamViewTab): boolean {
    return this.activeTeamTabs[teamName] === tabId;
  }
}

