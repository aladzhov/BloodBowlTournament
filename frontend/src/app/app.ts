import {Component} from '@angular/core';

type TabId = 'main' | 'previous-seasons' | 'bulgarian-fumbbl';

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
export class App {
  title = 'Bulgarian Blood Bowl Cup';
  season = '2026';

  readonly tabs: TabDefinition[] = [
    { id: 'main', label: 'Cup' },
    { id: 'previous-seasons', label: 'Previous Seasons', disabled: true },
    { id: 'bulgarian-fumbbl', label: 'Bulgarian Fumbbl' }
  ];

  activeTab: TabId = 'main';

  selectTab(tabId: TabId): void {
    const tab = this.tabs.find(({ id }) => id === tabId);
    if (!tab || tab.disabled) {
      return;
    }

    this.activeTab = tabId;
  }
}
