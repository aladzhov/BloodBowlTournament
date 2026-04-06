import { App } from './app';

describe('App', () => {
  it('defaults to the main tab', () => {
    const app = new App();

    expect(app.activeTab).toBe('main');
  });

  it('keeps the previous seasons tab disabled', () => {
    const app = new App();

    app.selectTab('previous-seasons');

    expect(app.activeTab).toBe('main');
  });
});

