import { DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

type TabId = 'main' | 'previous-seasons' | 'bulgarian-fumbbl' | 'coach-card';

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
  title = 'Bulgarian Blood Bowl Cup';
  season = '2026';
  private readonly defaultDescription = 'Blood Bowl Bulgaria: follow the Bulgarian Blood Bowl Cup 2026 with season standings, tournament dates, prizes, rules, and Bulgarian Fumbbl team rosters.';

  readonly tabs: TabDefinition[] = [
    { id: 'main', label: 'Cup' },
    { id: 'previous-seasons', label: 'Previous Seasons', disabled: true },
    // { id: 'coach-card', label: 'Coach Cards' },
    // { id: 'bulgarian-fumbbl', label: 'Bulgarian Fumbbl' }
  ];

  activeTab: TabId = 'main';
  selectedCoachForInterview: string | null = null;

  constructor(
    private readonly titleService: Title,
    private readonly metaService: Meta,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  ngOnInit(): void {
    this.updateSeo();
  }

  selectTab(tabId: TabId): void {
    const tab = this.tabs.find(({ id }) => id === tabId);
    if (!tab || tab.disabled) {
      return;
    }

    this.activeTab = tabId;
    this.updateSeo();
  }

  openCoachInterview(coach: string): void {
    this.selectedCoachForInterview = coach;
    this.activeTab = 'coach-card';
    this.updateSeo();
  }

  setSelectedCoach(coach: string): void {
    this.selectedCoachForInterview = coach;
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
          title: `${this.seoSiteName} | Coach Cards`,
          description: 'Blood Bowl Bulgaria coach cards: browse current Bulgarian coaches and short interview Q&A highlights.'
        };
      case 'previous-seasons':
        return {
          title: `${this.seoSiteName} | Previous Seasons and Results`,
          description: 'Blood Bowl Bulgaria archive: browse previous Bulgarian Blood Bowl Cup seasons and results.'
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
}
