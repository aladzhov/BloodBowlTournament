import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Characteristics {
  movement: number;
  strength: number;
  agility: number;
  passing: number;
  armor: number;
}

export interface HeroRace {
  key: string;
  race: string;
  nick: string;
  spp: number;
  reroll: number;
  characteristics: Characteristics;
  skills: string[];
  chosen: boolean;
}

export interface Teammate {
  name: string;
  short: string;
  assist: number;
}

interface Chapter {
  heroes: HeroRace[];
  teammates: Teammate[];
  pages: Map<number, string>;
}

export type PageNode =
  | { kind: 'text'; text: string; strong: boolean; italic: boolean; underline: boolean }
  | { kind: 'link'; target: number }
  | { kind: 'reset' };

/**
 * Holds all Superstar gamebook state so that progress survives tab switches
 * (the tab component is destroyed/recreated by the parent @switch).
 */
@Injectable({ providedIn: 'root' })
export class GamebookService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  private readonly rawContent = signal<string | null>(null);
  readonly loading = signal(true);
  private readonly hasError = signal(false);

  private readonly parsed = computed<Chapter>(() =>
    this.parseChapter(this.rawContent() ?? '')
  );

  readonly heroes = computed(() => this.parsed().heroes);
  readonly teammates = computed(() => this.parsed().teammates);
  private readonly pages = computed(() => this.parsed().pages);
  private readonly raceKeys = computed(() => this.heroes().map((h) => h.key));

  readonly loadError = computed(() =>
    this.hasError() ? 'Could not load chapter-1.txt' : null
  );

  readonly selectedRace = signal<string | null>(null);
  readonly nick = signal('');
  readonly extraSkill = signal<string | null>(null);
  readonly started = signal(false);
  readonly currentPage = signal<number | null>(null);
  readonly assists = signal<Record<string, number>>({});
  readonly spp = signal(0);
  readonly reroll = signal(0);
  readonly revealed = signal<string[]>([]);
  readonly showDebug = signal(false);

  /** Points needed to earn a new skill. */
  readonly sppPerSkill = 3;

  private readonly allExtraSkills = [
    'Block',
    'Dodge',
    'Guard',
    'Leader',
    'Sprint',
    'Sure Feet',
    'Strip Ball',
    'Sure Hands',
    'Sidestep'
  ];

  readonly selectedHero = computed(
    () => this.heroes().find((h) => h.key === this.selectedRace()) ?? null
  );

  /** Extra skills the player can pick — those not already in the hero's kit. */
  readonly availableExtraSkills = computed(() => {
    const owned = new Set(this.selectedHero()?.skills ?? []);
    return this.allExtraSkills.filter((s) => !owned.has(s));
  });

  private readonly visited = new Set<number>();
  private seeded = false;

  /** Teammates revealed so far via `<short appear>`, in the order they appeared. */
  readonly revealedTeammates = computed<Teammate[]>(() => {
    const mates = this.teammates();
    return this.revealed()
      .map((short) => mates.find((m) => m.short === short))
      .filter((m): m is Teammate => m !== undefined);
  });

  readonly currentNodes = computed<PageNode[]>(() => {
    const page = this.currentPage();
    const pages = this.pages();
    if (page === null || !pages.has(page)) {
      return [];
    }
    let text = pages.get(page) ?? '';
    text = this.resolveConditions(text, this.assists());
    text = this.resolveSwitches(text, this.selectedRace() ?? '', this.raceKeys());
    text = text.split('<nick>').join(this.nick());
    text = text.replace(/<[^<>]+?\s[+-]\d+>/g, '');
    text = text.replace(/<[^<>]+?\s+appear>/g, '');
    return this.tokenize(text);
  });

  constructor() {
    this.http
      .get('/gamebook/chapter-1.txt', { responseType: 'text' })
      .subscribe({
        next: (text) => {
          this.rawContent.set(text);
          this.loading.set(false);
        },
        error: () => {
          this.hasError.set(true);
          this.loading.set(false);
        }
      });

    effect(() => {
      const heroes = this.heroes();
      if (this.seeded || heroes.length === 0) {
        return;
      }
      const chosen = heroes.find((h) => h.chosen) ?? heroes[0];
      this.selectedRace.set(chosen.key);
      this.nick.set(chosen.nick);
      this.seeded = true;
    });
  }

  selectRace(hero: HeroRace): void {
    this.selectedRace.set(hero.key);
    // Only replace the nickname if the user hasn't customised it (i.e. it is
    // still empty or equal to one of the characters' default nicks).
    const current = this.nick().trim();
    const isDefault =
      current.length === 0 || this.heroes().some((h) => h.nick === current);
    if (isDefault) {
      this.nick.set(hero.nick);
    }
    if (this.extraSkill() && !this.availableExtraSkills().includes(this.extraSkill()!)) {
      this.extraSkill.set(null);
    }
  }

  canStart(): boolean {
    return (
      !this.loading() &&
      !this.loadError() &&
      !!this.selectedRace() &&
      this.nick().trim().length > 0
    );
  }

  start(): void {
    if (!this.canStart()) {
      return;
    }
    const initial: Record<string, number> = {};
    for (const mate of this.teammates()) {
      initial[mate.short] = mate.assist;
    }
    this.assists.set(initial);
    this.spp.set(this.selectedHero()?.spp ?? 0);
    this.reroll.set(this.selectedHero()?.reroll ?? 0);
    this.revealed.set([]);
    this.visited.clear();
    this.started.set(true);
    this.goTo(1);
  }

  restart(): void {
    this.started.set(false);
    this.currentPage.set(null);
    this.revealed.set([]);
    this.visited.clear();
  }

  goTo(page: number): void {
    if (this.pages().has(page)) {
      this.applyState(page);
    }
    this.currentPage.set(page);
    this.scrollToTop();
  }

  private scrollToTop(): void {
    const view = this.document.defaultView;
    view?.scrollTo({ top: 0, behavior: 'smooth' });
    // The page text lives in its own scrollable container, so reset it too.
    view?.setTimeout(() => {
      this.document.querySelector('.gb-page-body')?.scrollTo({ top: 0 });
    });
  }

  pageExists(page: number | null): boolean {
    return page !== null && this.pages().has(page);
  }

  /** Spends a reroll, reducing the count by one (never below zero). */
  useReroll(): void {
    this.reroll.set(Math.max(0, this.reroll() - 1));
  }

  /** Assist progress for a teammate as a 0–100% value that fills at 4 assists. */
  assistFill(short: string): number {
    const value = this.assists()[short] ?? 0;
    return (Math.min(Math.max(value, 0), 4) / 4) * 100;
  }

  private applyState(page: number): void {
    if (this.visited.has(page)) {
      return;
    }
    this.visited.add(page);

    const raw = this.pages().get(page) ?? '';
    const next = { ...this.assists() };
    let sppDelta = 0;
    let rerollDelta = 0;
    const stateRe = /<([^<>]+?)\s([+-]\d+)>/g;
    let match: RegExpExecArray | null;
    while ((match = stateRe.exec(raw)) !== null) {
      const key = match[1].trim();
      const delta = parseInt(match[2], 10);
      if (key === 'spp') {
        sppDelta += delta;
      } else if (key === 'reroll') {
        rerollDelta += delta;
      } else if (key in next) {
        next[key] += delta;
      }
    }
    if (sppDelta !== 0) {
      this.spp.set(this.spp() + sppDelta);
    }
    if (rerollDelta !== 0) {
      this.reroll.set(Math.max(0, this.reroll() + rerollDelta));
    }
    this.assists.set(next);

    const appearRe = /<([^<>]+?)\s+appear>/g;
    const revealed = [...this.revealed()];
    let appear: RegExpExecArray | null;
    while ((appear = appearRe.exec(raw)) !== null) {
      const short = appear[1].trim();
      if (short in next && !revealed.includes(short)) {
        revealed.push(short);
      }
    }
    if (revealed.length !== this.revealed().length) {
      this.revealed.set(revealed);
    }
  }

  private parseChapter(text: string): Chapter {
    const firstPage = text.indexOf('<<');
    const header = firstPage >= 0 ? text.slice(0, firstPage) : text;
    const body = firstPage >= 0 ? text.slice(firstPage) : '';
    return {
      heroes: this.parseHeroes(header),
      teammates: this.parseTeammates(header),
      pages: this.parsePages(body)
    };
  }

  private parseHeroes(header: string): HeroRace[] {
    const heroDecl = /hero:\s*\{/.exec(header);
    if (!heroDecl) {
      return [];
    }
    const heroInner = this.extractBalanced(header, heroDecl.index + heroDecl[0].length - 1);
    if (heroInner === null) {
      return [];
    }

    const heroes: HeroRace[] = [];
    const keyRe = /(\w+):\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = keyRe.exec(heroInner)) !== null) {
      const open = match.index + match[0].length - 1;
      const inner = this.extractBalanced(heroInner, open);
      if (inner === null) {
        continue;
      }
      // Skip past this race block so its nested objects (e.g. characteristics)
      // aren't picked up as separate heroes.
      keyRe.lastIndex = open + inner.length + 2;
      if (!/nick:/.test(inner)) {
        continue;
      }
      const race = /race:\s*"([^"]*)"/.exec(inner)?.[1] ?? match[1];
      const nick = /nick:\s*"([^"]*)"/.exec(inner)?.[1] ?? race;
      const spp = parseInt(/spp:\s*(-?\d+)/.exec(inner)?.[1] ?? '0', 10);
      const reroll = parseInt(/reroll:\s*(-?\d+)/.exec(inner)?.[1] ?? '0', 10);
      const skillsRaw = /skills:\s*\[([^\]]*)\]/.exec(inner)?.[1] ?? '';
      const skills = skillsRaw
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter((s) => s.length > 0);
      const chosen = /chosen:\s*true/.test(inner);
      const characteristics = this.parseCharacteristics(inner);
      heroes.push({ key: race, race, nick, spp, reroll, characteristics, skills, chosen });
    }
    return heroes;
  }

  private parseCharacteristics(inner: string): Characteristics {
    const block = /characteristics:\s*\{([^}]*)\}/.exec(inner)?.[1] ?? '';
    const read = (name: string): number =>
      parseInt(new RegExp(`"${name}"\\s*:\\s*(-?\\d+)`).exec(block)?.[1] ?? '0', 10);
    return {
      movement: read('movement'),
      strength: read('strength'),
      agility: read('agility'),
      passing: read('passing'),
      armor: read('armor')
    };
  }

  /**
   * Returns the content between the brace at `openIndex` and its matching
   * closing brace, accounting for nested braces. Returns null if unbalanced.
   */
  private extractBalanced(text: string, openIndex: number): string | null {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(openIndex + 1, i);
        }
      }
    }
    return null;
  }

  private parseTeammates(header: string): Teammate[] {
    const teammatesStart = header.indexOf('teammates:');
    const block = teammatesStart >= 0 ? header.slice(teammatesStart) : '';
    const teammates: Teammate[] = [];
    const mateRe = /name:\s*"([^"]*)"\s*,\s*short:\s*"([^"]*)"\s*,\s*assist:\s*(-?\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = mateRe.exec(block)) !== null) {
      teammates.push({
        name: match[1],
        short: match[2],
        assist: parseInt(match[3], 10)
      });
    }
    return teammates;
  }

  private parsePages(body: string): Map<number, string> {
    const pages = new Map<number, string>();
    const parts = body.split(/<<(\d+)>>/);
    for (let i = 1; i < parts.length; i += 2) {
      const number = parseInt(parts[i], 10);
      const content = (parts[i + 1] ?? '').trim();
      pages.set(number, content);
    }
    return pages;
  }

  /**
   * Resolves `<if short>true text<else>false text` blocks. The true branch is
   * shown when the team-mate with the given short name currently has more than
   * three assists; otherwise the else branch is shown. The else branch runs to
   * the end of its line.
   */
  private resolveConditions(text: string, assists: Record<string, number>): string {
    return text.replace(
      /<if\s+([^\s>]+)>([\s\S]*?)<else>([^\n]*)/g,
      (_full, short: string, truthy: string, falsy: string) => {
        const value = assists[short] ?? 0;
        const chosen = (value > 3 ? truthy : falsy).trim();
        return chosen ? `<u>${chosen}</u>` : '';
      }
    );
  }

  private resolveSwitches(text: string, race: string, keys: string[]): string {
    if (keys.length === 0) {
      return text;
    }
    const branchRe = new RegExp(
      `<(${keys.join('|')})>([\\s\\S]*?)(?=<(?:${keys.join('|')})>|$)`,
      'g'
    );
    return text.replace(/\s*<switch>([\s\S]*?)<\/switch>\s*/g, (_full, inner: string) => {
      const branches: Record<string, string> = {};
      let m: RegExpExecArray | null;
      while ((m = branchRe.exec(inner)) !== null) {
        branches[m[1]] = m[2].trim();
      }
      const chosen = branches[race] ?? '';
      return chosen ? ` <u>${chosen}</u> ` : ' ';
    });
  }

  private tokenize(text: string): PageNode[] {
    const parts = text.split(/(<\/?[biu]>|<\d+>|<reset>)/);
    const nodes: PageNode[] = [];
    let bold = 0;
    let italic = 0;
    let underline = 0;
    for (const part of parts) {
      if (!part) {
        continue;
      }
      switch (part) {
        case '<b>':
          bold++;
          continue;
        case '</b>':
          bold = Math.max(0, bold - 1);
          continue;
        case '<i>':
          italic++;
          continue;
        case '</i>':
          italic = Math.max(0, italic - 1);
          continue;
        case '<u>':
          underline++;
          continue;
        case '</u>':
          underline = Math.max(0, underline - 1);
          continue;
        case '<reset>':
          nodes.push({ kind: 'reset' });
          continue;
      }
      const link = /^<(\d+)>$/.exec(part);
      if (link) {
        nodes.push({ kind: 'link', target: parseInt(link[1], 10) });
      } else {
        nodes.push({
          kind: 'text',
          text: part,
          strong: bold > 0,
          italic: italic > 0,
          underline: underline > 0
        });
      }
    }
    return nodes;
  }
}
