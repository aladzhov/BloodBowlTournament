import { DOCUMENT } from '@angular/common';
import { Component, HostListener, Inject, OnInit } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { findCoachBySlug, getCoachCardPath, rankedBulgarianCoachEntries } from './coach-card.data';
import { PuzzleSessionService } from './puzzle-session.service';

type TabId = 'main' | 'previous-seasons' | 'bulgarian-fumbbl' | 'coach-card' | 'puzzles';

interface TabDefinition {
  id: TabId;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly siteUrl = 'https://www.bgbb.eu';
  private readonly seoSiteName = 'Blood Bowl Bulgaria';
  private readonly defaultCoach = rankedBulgarianCoachEntries[0]?.coach ?? null;
  title = 'Bulgarian Blood Bowl Cup';
  season = '2026';
  private readonly defaultDescription = 'Blood Bowl Bulgaria: follow the Bulgarian Blood Bowl Cup 2026 with season standings, tournament dates, prizes, rules, and Bulgarian Fumbbl team rosters.';

  readonly tabs: TabDefinition[] = [
    { id: 'main', label: 'Cup' },
    { id: 'previous-seasons', label: 'Previous Seasons', disabled: true },
    { id: 'coach-card', label: 'Coach Cards' },
    { id: 'puzzles', label: 'Puzzles' },
    // { id: 'bulgarian-fumbbl', label: 'Bulgarian Fumbbl' }
  ];

  activeTab: TabId = 'main';
  selectedCoachForInterview: string | null = null;

  constructor(
    private readonly titleService: Title,
    private readonly metaService: Meta,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly puzzleSessionService: PuzzleSessionService
  ) {}

  ngOnInit(): void {
    this.syncStateFromPath(this.currentPath(), true);
  }

  @HostListener('window:popstate')
  onPopState(): void {
    this.syncStateFromPath(this.currentPath(), false);
  }

  selectTab(tabId: TabId): void {
    const tab = this.tabs.find(({ id }) => id === tabId);
    if (!tab || tab.disabled) {
      return;
    }

    if (tabId === 'coach-card') {
      const coach = this.selectedCoachForInterview ?? this.defaultCoach;

      if (coach) {
        this.navigateToCoach(coach);
      }

      return;
    }

    if (tabId === 'puzzles') {
      this.navigateToPuzzles();
      return;
    }

    this.activeTab = tabId;
    this.selectedCoachForInterview = null;
    this.updateUrl('/', false);
    this.updateSeo();
  }

  openCoachInterview(coach: string): void {
    this.navigateToCoach(coach);
  }

  setSelectedCoach(coach: string): void {
    if (!coach) {
      return;
    }

    this.navigateToCoach(coach);
  }

  private updateSeo(): void {
    const metadata = this.getSeoMetadata(this.activeTab);
    const pageUrl = this.getAbsoluteUrl(typeof window !== 'undefined' ? window.location.pathname : '/');
    const imageUrl = this.getAbsoluteUrl('/bbbg-banner.png');

    this.titleService.setTitle(metadata.title);
    this.metaService.updateTag({ name: 'description', content: metadata.description });
    this.metaService.updateTag({ name: 'keywords', content: 'Blood Bowl Bulgaria, Bulgarian Blood Bowl, Blood Bowl tournaments Bulgaria, Blood Bowl Cup Bulgaria, Bulgarian Fumbbl' });
    this.metaService.updateTag({ property: 'og:title', content: metadata.title });
    this.metaService.updateTag({ property: 'og:description', content: metadata.description });
    this.metaService.updateTag({ property: 'og:url', content: pageUrl });
    this.metaService.updateTag({ property: 'og:image', content: imageUrl });
    this.metaService.updateTag({ property: 'og:site_name', content: this.seoSiteName });

    this.updateCanonicalLink(pageUrl);
    this.updateStructuredData(pageUrl, imageUrl);
  }

  private getAbsoluteUrl(path: string): string {
    return new URL(path, `${this.siteUrl}/`).toString();
  }

  private getSeoMetadata(tabId: TabId): { title: string; description: string } {
    switch (tabId) {
      case 'bulgarian-fumbbl':
        return {
          title: `${this.seoSiteName} | Bulgarian Fumbbl Teams and Rosters ${this.season}`,
          description: 'Blood Bowl Bulgaria custom teams: explore Bulgarian Fumbbl rosters, player positions, and team identity for Dobroto and Zloto.'
        };
      case 'coach-card':
        return {
          title: this.selectedCoachForInterview
            ? `${this.seoSiteName} | Coach Card | ${this.selectedCoachForInterview}`
            : `${this.seoSiteName} | Coach Cards`,
          description: this.selectedCoachForInterview
            ? `Blood Bowl Bulgaria coach card for ${this.selectedCoachForInterview}: browse interview Q&A highlights and current season standing details.`
            : 'Blood Bowl Bulgaria coach cards: browse current Bulgarian coaches and short interview Q&A highlights.'
        };
      case 'previous-seasons':
        return {
          title: `${this.seoSiteName} | Previous Seasons and Results`,
          description: 'Blood Bowl Bulgaria archive: browse previous Bulgarian Blood Bowl Cup seasons and results.'
        };
      case 'puzzles':
        return {
          title: `${this.seoSiteName} | Puzzles`,
          description: 'Blood Bowl Bulgaria puzzles: test your Blood Bowl knowledge.'
        };
      case 'main':
      default:
        return {
          title: `${this.seoSiteName} ${this.season} | Tournaments, Standings and Community`,
          description: this.defaultDescription
        };
    }
  }

  private updateCanonicalLink(url: string): void {
    let canonicalLink = this.document.querySelector('link[rel="canonical"]');

    if (!canonicalLink) {
      canonicalLink = this.document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonicalLink);
    }

    canonicalLink.setAttribute('href', url);
  }

  private updateStructuredData(url: string, imageUrl: string): void {
    const existingScript = this.document.getElementById('structured-data');
    const script = existingScript ?? this.document.createElement('script');
    script.id = 'structured-data';
    script.setAttribute('type', 'application/ld+json');
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: this.seoSiteName,
          url,
          description: this.defaultDescription,
          inLanguage: 'en'
        },
        {
          '@type': 'Organization',
          name: this.seoSiteName,
          url,
          logo: this.getAbsoluteUrl('/favicon.png'),
          image: imageUrl,
          sameAs: ['https://www.facebook.com/groups/1092384540884398']
        }
      ]
    });

    if (!existingScript) {
      this.document.head.appendChild(script);
    }
  }

  private navigateToCoach(coach: string): void {
    this.selectedCoachForInterview = coach;
    this.activeTab = 'coach-card';
    this.updateUrl(getCoachCardPath(coach), false);
    this.updateSeo();
    this.document.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private syncStateFromPath(pathname: string, replaceInvalidPath: boolean): void {
    const coachSlug = this.extractCoachSlug(pathname);

    if (coachSlug !== null) {
      const matchedCoach = findCoachBySlug(coachSlug);
      const fallbackCoach = matchedCoach ?? this.defaultCoach;

      if (fallbackCoach) {
        this.selectedCoachForInterview = fallbackCoach;
        this.activeTab = 'coach-card';

        if (replaceInvalidPath) {
          this.updateUrl(getCoachCardPath(fallbackCoach), true);
        }

        this.updateSeo();
        return;
      }
    }

    const puzzleDate = this.extractPuzzleDate(pathname);
    if (puzzleDate !== null || pathname === '/puzzles' || pathname === '/puzzles/') {
      if (puzzleDate) {
        this.puzzleSessionService.setLastViewedKey(puzzleDate);
      }
      this.selectedCoachForInterview = null;
      this.activeTab = 'puzzles';
      this.updateSeo();
      return;
    }

    this.selectedCoachForInterview = null;
    this.activeTab = 'main';

    if (replaceInvalidPath && pathname !== '/') {
      this.updateUrl('/', true);
    }

    this.updateSeo();
  }

  private extractCoachSlug(pathname: string): string | null {
    const match = pathname.match(/^\/coach\/([^/]+)\/?$/);
    return match?.[1] ?? null;
  }

  private extractPuzzleDate(pathname: string): string | null {
    const match = pathname.match(/^\/puzzles\/(\d{4}-\d{2}-\d{2})\/?$/);
    return match?.[1] ?? null;
  }

  private navigateToPuzzles(date?: string): void {
    this.selectedCoachForInterview = null;
    this.activeTab = 'puzzles';
    const path = date ? `/puzzles/${date}` : '/puzzles';
    this.updateUrl(path, false);
    this.updateSeo();
  }

  onPuzzleDateChange(date: string): void {
    this.updateUrl(`/puzzles/${date}`, false);
  }

  private currentPath(): string {
    return this.document.defaultView?.location.pathname ?? '/';
  }

  private updateUrl(path: string, replace: boolean): void {
    const browserWindow = this.document.defaultView;
    if (!browserWindow || browserWindow.location.pathname === path) {
      return;
    }

    const historyMethod = replace ? 'replaceState' : 'pushState';
    browserWindow.history[historyMethod](null, '', path);
  }
}
