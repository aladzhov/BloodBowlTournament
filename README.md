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



