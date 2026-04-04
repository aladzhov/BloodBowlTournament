# BloodBowlTournament

Multi-module workspace with:

- `backend/` — Kotlin + Spring Boot REST API
- `frontend/` — Angular 21 application consuming the backend API

## Project structure

- `backend/src/main/kotlin/bloodbowltournament/` contains the crawler, Spring Boot app, REST controller, and CORS config.
- `frontend/src/app/` contains the Angular UI and the service that calls `/api/tournaments`.

## Run locally

## Run both modules with a single command

From the repository root:

```bash
npm run dev
```

What it does:

- starts `backend` with `./gradlew :backend:bootRun`
- starts `frontend` with `npm start`
- installs frontend dependencies automatically the first time if `frontend/node_modules/` is missing

Then open:

```text
http://localhost:4200
```

Use `Ctrl+C` once in that terminal to stop both processes.

### Backend

From the repository root, use Gradle to run the backend module:

```bash
./gradlew :backend:bootRun
```

If your environment does not yet have the Gradle wrapper scripts available, run Gradle directly after installing it:

```bash
gradle :backend:bootRun
```

The backend API will be available at `http://localhost:8080/api/tournaments`.

### Frontend

```bash
cd frontend
npm install
npm start
```

The Angular dev server runs on `http://localhost:4200` and proxies `/api` requests to the backend.

## Build and test

### Frontend only

```bash
cd frontend
npm test -- --watch=false
npm run build
```

### Multi-module Gradle build

```bash
./gradlew buildAll
./gradlew checkAll
```

## API example

```bash
curl "http://localhost:8080/api/tournaments?countries=Bulgaria&countries=Greece&startDate=2026-04-02&variant=Blood%20Bowl%202025"
```

