import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { ClockComponent } from './clock.component';
import { BulgarianFumbblTabComponent } from './bulgarian-fumbbl-tab.component';
import { CoachCardComponent } from './coach-card.component';
import { MainTabComponent } from './main-tab.component';
import { PuzzlesTabComponent } from './puzzles-tab.component';
import { PlayerDetailsComponent } from './player-details.component';
import { SuccessBreakdownComponent } from './success-breakdown.component';
import { HintsComponent } from './hints.component';
import { QueryPanelComponent } from './query-panel.component';

@NgModule({
  declarations: [
    App,
    MainTabComponent,
    CoachCardComponent,
    BulgarianFumbblTabComponent,
    PuzzlesTabComponent,
    PlayerDetailsComponent,
    SuccessBreakdownComponent,
    HintsComponent,
    QueryPanelComponent,
    ClockComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient()
  ],
  bootstrap: [App]
})
export class AppModule { }
