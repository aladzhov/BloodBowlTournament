import { Meta, Title } from '@angular/platform-browser';

import { App } from './app';

function createApp(): App {
  const titleStub = { setTitle: () => {} } as unknown as Title;
  const metaStub = { updateTag: () => {} } as unknown as Meta;

  return new App(titleStub, metaStub, document);
}

describe('App', () => {
  it('defaults to the main tab', () => {
    const app = createApp();

    expect(app.activeTab).toBe('main');
  });

  it('keeps the previous seasons tab disabled', () => {
    const app = createApp();

    app.selectTab('previous-seasons');

    expect(app.activeTab).toBe('main');
  });
});

