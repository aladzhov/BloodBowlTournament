import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { GamebookService } from './gamebook.service';

@Component({
  selector: 'app-superstar-tab',
  standalone: false,
  templateUrl: './superstar-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './superstar-tab.component.css',
})
export class SuperstarTabComponent {
  readonly game = inject(GamebookService);
}
