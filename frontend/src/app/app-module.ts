import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { BulgarianFumbblTabComponent } from './bulgarian-fumbbl-tab.component';
import { CoachCardComponent } from './coach-card.component';
import { MainTabComponent } from './main-tab.component';
import { PreviousSeasonsTabComponent } from './previous-seasons-tab.component';
import { PuzzlesTabComponent } from './puzzles-tab.component';

@NgModule({
  declarations: [
    App,
    MainTabComponent,
    CoachCardComponent,
    PreviousSeasonsTabComponent,
    BulgarianFumbblTabComponent,
    PuzzlesTabComponent
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
