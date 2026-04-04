# BloodBowlTournament

Angular-only workspace for the Bulgarian Blood Bowl Cup site.

## Project structure

- `frontend/` — Angular 21 application
- `frontend/src/app/` — UI components and static tournament/standings data
- `frontend/src/assets/` — bundled assets such as local fonts
- `frontend/public/` — static assets

## Run locally

From the repository root:

```bash
npm run dev
```

This starts the Angular dev server on:

```text
http://localhost:4200
```

You can also run it directly from the frontend module:

```bash
cd frontend
npm install
npm start
```

## Build and test

From the repository root:

```bash
npm run build
npm run test
```

Or use the frontend module directly:

```bash
cd frontend
npm run build
npm test
```

## Deploy to Netlify

This repository includes a root `netlify.toml` configured for Netlify.

It tells Netlify to:

- use `frontend/` as the base directory
- run `npm run build`
- publish `frontend/dist/frontend`
- redirect all routes to `index.html` for Angular SPA routing

If you connect the repository in Netlify, no extra build settings are required.

Equivalent Netlify settings:

```text
Base directory: frontend
Build command: npm run build
Publish directory: dist/frontend
```



