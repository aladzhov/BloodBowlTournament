import { Meta, Title } from '@angular/platform-browser';

import { App } from './app';
import { PuzzleSessionService } from './puzzle-session.service';

function createApp(): App {
  const titleStub = { setTitle: () => {} } as unknown as Title;
  const metaStub = { updateTag: () => {} } as unknown as Meta;
  const sessionStub = {} as unknown as PuzzleSessionService;

  return new App(titleStub, metaStub, document, sessionStub);
}

describe('App', () => {
  it('defaults to the main tab', () => {
    const app = createApp();

    expect(app.activeTab).toBe('main');
  });

});
