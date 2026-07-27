## Quran Chrome Extension API

Backend API for the **Daily Quran** Chrome extension.  
This service wraps the [Quran Foundation Content API](https://api-docs.quran.foundation) and exposes a small HTTP API for the extension, with OAuth token management, Chrome-extension–locked CORS, shared-secret auth, user login (PKCE), bookmarks, and translation preferences stored in Postgres.

Built with [NestJS](https://nestjs.com) and TypeScript.

## Roadmap

Product planning: [Daily Quran roadmap (Trello)](https://trello.com/b/C6AHrqBZ/daily-quran-roadmap).

## Features

- **Random / by-key verses**: Arabic text plus translation(s). English is always included; an optional preferred translation can be requested as a second language.
- **Languages & translations**: Lists translation languages and resources from Quran Foundation.
- **Chapters / tafsirs**: Chapter metadata and verse tafsir resources.
- **OAuth (content API)**: Manages Quran Foundation `client_credentials` tokens (cache + refresh).
- **Chrome-extension–only CORS**: Only `chrome-extension://<EXTENSION_ID>` origins (comma-separated IDs supported).
- **Shared-secret header**: Quran and user routes require `extension_secret`.
- **AI verse explanation**: `POST /tafsir` uses Gemini first, then optional OpenRouter fallback, with guest/user rate limiting when sessions are present.
- **Quran.com login (OAuth2 + PKCE)**: Backend owns the auth code flow; the extension stores only an opaque session token.
- **Quran.com-synced bookmarks**: Favorites sync to the user’s Quran.com default collection.
- **Translation preferences (our DB)**: `GET`/`PUT /user/preferences` store the user’s chosen language/translation in **Neon Postgres** (not QF’s preference API — our OAuth client is not approved for the `preference` scope).

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Quran Foundation API credentials**: `CLIENT_ID` / `CLIENT_SECRET` — [request access](https://api-docs.quran.foundation/request-access)
- **Chrome Extension ID(s)** for CORS
- **Gemini API key** (`GEMINI_API_KEY`) — required for boot
- **Neon Postgres** (`DATABASE_URL`) — required for login/sessions/preferences in production
- **OpenRouter** (optional) for AI fallback

## Environment variables

Copy `.env.example` to `.env` (never commit real secrets).

### Quran API and extension

| Variable | Purpose |
| --- | --- |
| `CLIENT_ID` / `CLIENT_SECRET` | Quran Foundation Content API |
| `EXTENSION_ID` | Chrome extension ID(s), comma-separated for unpacked + Store |
| `EXTENSION_SECRET` | Shared secret sent as `extension_secret` header |

### Database & sessions

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon (or local) Postgres URL — sessions, PKCE state, AI usage log, **user preferences** |
| `APP_SESSION_SECRET` | ≥32-char random secret for session IDs (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

### User OAuth (login + bookmarks)

| Variable | Purpose |
| --- | --- |
| `QF_USER_REDIRECT_URI` | Exact callback registered with QF (prod or `http://localhost:3000/auth/quran/callback`) |
| `QF_USER_CLIENT_ID` / `QF_USER_CLIENT_SECRET` | Optional overrides of `CLIENT_*` for user APIs |
| `QF_USER_AUTH_BASE_URL` | Default `https://oauth2.quran.foundation` |
| `QF_USER_API_BASE_URL` | Default `https://apis.quran.foundation` |

OAuth scopes requested today: `openid offline_access user bookmark collection` (no `preference` — not approved for this client).

### AI / Tafsir

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Required |
| `GEMINI_MODEL` | Optional (default `gemini-2.5-flash`) |
| `OPENROUTER_API_KEY` | Optional fallback |
| `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` | Optional model slugs |

Example:

```bash
CLIENT_ID=...
CLIENT_SECRET=...
EXTENSION_ID=diilngbfimlnkdbabjhadnblkhfbfcge
EXTENSION_SECRET=...

DATABASE_URL=postgresql://user:password@host/db?sslmode=require
APP_SESSION_SECRET=...   # 64 hex chars recommended

QF_USER_REDIRECT_URI=https://quran-chrome-extension-api.vercel.app/auth/quran/callback
# Local: QF_USER_REDIRECT_URI=http://localhost:3000/auth/quran/callback

GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...
```

## Deploying to Vercel

1. Import the Git repo in [Vercel](https://vercel.com/new).
2. Set env vars for **Production** at minimum:
   - `CLIENT_ID`, `CLIENT_SECRET`, `EXTENSION_ID`, `EXTENSION_SECRET`
   - `GEMINI_API_KEY`
   - `DATABASE_URL`, `APP_SESSION_SECRET`
   - `QF_USER_REDIRECT_URI` (must match QF app settings)
3. Deploy (`git push` to `main`, or `npx vercel --prod`).
4. Point the extension’s `VITE_API_URL` at the production host and keep `EXTENSION_SECRET` in sync.

**Database migrations on deploy:** the `build` script runs `prisma migrate deploy` before compiling. Any new files under `prisma/migrations/` are applied to Neon automatically whenever Vercel builds (Production and Preview), as long as `DATABASE_URL` is set for that environment. Use `prisma migrate deploy` only — never `migrate dev` on Vercel.

Locally / one-off:

```bash
npm run prisma:migrate   # same as: npx prisma migrate deploy
```

Docker Compose already runs migrations on container start via `docker-entrypoint.sh`.

## Installation & run

```bash
npm install

npm run start:dev    # watch mode → http://localhost:3000
npm run start:prod   # after build
```

### Docker (API + Postgres 18)

```bash
cp .env.example .env   # fill secrets
docker compose up --build
```

- API: http://localhost:3000  
- Postgres: `localhost:5432` (`dailyquran` / `dailyquran` / `dailyquran`)  
- Compose sets `DATABASE_URL` for the API container and runs migrations on start.

```bash
docker compose logs -f api
docker compose down       # keep volume
docker compose down -v    # wipe DB
```

## CORS

Configured in `main.ts`:

- Origins: `chrome-extension://<id>` for each `EXTENSION_ID`
- Methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS` (`PUT` is required for preference updates)
- Headers: `Content-Type`, `extension_secret`, `Accept`, `x-session-token`

Call the API from the **side panel / service worker**, not from a content script on a normal web origin (those fail CORS by design).

## Authentication

- **All Quran + auth/user routes**: header `extension_secret` = `EXTENSION_SECRET`
- **Logged-in user routes**: also `x-session-token` from the OAuth session pickup
- Missing/invalid secret → `401`

## API endpoints

### Quran (`/quran`) — header `extension_secret`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/quran/random-verse` | Optional `?translationId=` — always includes English; preferred id adds a second translation |
| `GET` | `/quran/verses/:key` | Same translation behavior (`1:1` style key) |
| `GET` | `/quran/languages` | Languages with a default translation each |
| `GET` | `/quran/translations` | Translation resources |
| `GET` | `/quran/chapters` | Chapters |
| `GET` | `/quran/tafsirs` | Tafsir resources |
| `GET` | `/quran/tafsir/:key` | Tafsir for a verse key |

### AI

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/tafsir` | Body: `chapter_name`, `verseKey`, `text`, `tafsirHtml`, `question` → `{ explanation, modelUsed, generatedAt }` |

### Auth (`/auth/quran`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/auth/quran/login?state=<extState>` | Redirect to QF |
| `GET` | `/auth/quran/callback` | Server-only; stores session |
| `GET` | `/auth/quran/session/:extState` | Extension polls once → `{ sessionToken, user }` |
| `GET` | `/auth/quran/me` | Current user (`x-session-token`) |
| `POST` | `/auth/quran/logout` | Clears session |

### User (`/user`) — `extension_secret` + `x-session-token`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/user/bookmarks` | Quran.com default collection |
| `POST` | `/user/bookmarks` | Body `{ key, verseNumber }` |
| `DELETE` | `/user/bookmarks/:id` | Remove bookmark |
| `GET` | `/user/preferences` | `{ translationId?, languageIso? }` from **our** DB |
| `PUT` | `/user/preferences` | Body `{ translationId, languageIso }` upsert by QF `sub` |

## Quran Foundation integration

- Content OAuth: `client_credentials` + `scope=content` against production QF OAuth.
- Content API: `https://apis.quran.foundation/content/api/v4` with `x-auth-token` + `x-client-id`.
- User APIs: bookmarks/collections with the user’s access token after PKCE login.
- Preferences are **not** synced to QF until/unless the `preference` scope is approved for this client.

## Testing

```bash
npm run test
```

## License

MIT (NestJS starter–based).
