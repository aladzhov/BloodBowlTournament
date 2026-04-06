import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { BulgarianFumbblTabComponent } from './bulgarian-fumbbl-tab.component';
import { MainTabComponent } from './main-tab.component';
import { PreviousSeasonsTabComponent } from './previous-seasons-tab.component';

@NgModule({
  declarations: [
    App,
    MainTabComponent,
    PreviousSeasonsTabComponent,
    BulgarianFumbblTabComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners()
  ],
  bootstrap: [App]
})
export class AppModule { }
