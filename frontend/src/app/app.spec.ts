import { App } from './app';

describe('App', () => {
  it('exposes the expected site title', () => {
    const app = new App();

    expect(app.title).toBe('Bulgarian Blood Bowl Cup');
  });

  it('exposes the current season', () => {
    const app = new App();

    expect(app.season).toBe('2026');
  });
});

