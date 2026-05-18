## Quran Chrome Extension API

Backend API for a Chrome extension that displays verses from the Quran.  
This service wraps the [Quran Foundation Content API](https://api-docs.quran.foundation) and exposes a small, opinionated HTTP API for your extension, with OAuth token management, CORS locking to a specific extension, and a simple shared-secret authentication layer.

Built with [NestJS](https://nestjs.com) and TypeScript.

## Roadmap

Product planning and upcoming work for the Daily Quran extension and this API: [Daily Quran roadmap (Trello)](https://trello.com/b/C6AHrqBZ/daily-quran-roadmap).

## Features

- **Random verse endpoint**: Fetches a random verse including text and a selected translation.
- **Verse by key**: Fetch a specific verse by its numeric key.
- **Translations list**: Returns available translation resources from Quran Foundation.
- **Chapters list**: Returns metadata for all Quran chapters.
- **OAuth handling**: Manages Quran Foundation OAuth2 token acquisition, caching, and refresh.
- **Chrome-extension–only CORS**: Only allows requests originating from your configured Chrome extension ID.
- **Shared-secret header**: Quran endpoints require an `extension_secret` header to prevent arbitrary clients from calling the API.
- **AI verse explanation (Tafsir)**: `POST /tafsir` uses Google **Gemini** first, then optionally **[OpenRouter](https://openrouter.ai/)** (default: [Qwen3 Next 80B free](https://openrouter.ai/qwen/qwen3-next-80b-a3b-instruct:free/api)) if Gemini errors or returns empty text, with retries on transient OpenRouter rate limits.
- **Quran.com login (OAuth2 + PKCE)**: Users can log in with their Quran Foundation/Quran.com account. The backend handles the full Authorization Code + PKCE flow; the extension only stores an opaque session token.
- **Quran.com-synced bookmarks**: Logged-in users can save/unsave ayah favorites via `POST /user/bookmarks`, which syncs directly to their Quran.com default collection. All existing endpoints remain fully usable without login (guest mode).

## Prerequisites

- **Node.js**: v18+ (recommended)
- **npm**: v9+ (or yarn / pnpm if you prefer)
- **Quran Foundation API credentials**: `CLIENT_ID` and `CLIENT_SECRET` from [Quran Foundation](https://api-docs.quran.foundation/request-access).
- **Chrome Extension ID**: The ID of your Chrome extension that will call this API.
- **Gemini API key**: Required for the app to start (`GEMINI_API_KEY`). Used for AI explanations on `/tafsir`. See [Google AI Studio](https://aistudio.google.com/apikey).
- **OpenRouter** (optional): `OPENROUTER_API_KEY` enables a fallback when Gemini fails or returns no text. Free models can hit upstream rate limits; see [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) for Gemini and OpenRouter’s dashboard for usage.

## Environment variables

Create a `.env` file in the project root (do **not** commit real secrets to version control in new projects). Copy `.env.example` and fill in values.

### Quran API and extension

- **`CLIENT_ID`**: Quran Foundation API client ID.
- **`CLIENT_SECRET`**: Quran Foundation API client secret.
- **`EXTENSION_ID`**: Your Chrome extension ID (32 characters). For a [Chrome Web Store](https://chromewebstore.google.com/) listing, use the ID from the listing URL (the segment after the final `/`). Example (Daily Quran): `diilngbfimlnkdbabjhadnblkhfbfcge`. You may set a comma-separated list (e.g. unpacked dev ID and Store ID) so both can call the same API without changing deploys.
- **`EXTENSION_SECRET`**: Shared secret your extension sends in the `extension_secret` header (any secure string you choose).

### AI / Tafsir (`POST /tafsir`)

- **`GEMINI_API_KEY`** (required): Google Generative AI API key. The server will not boot without it.
- **`GEMINI_MODEL`** (optional): Gemini model id. Default: `gemini-2.5-flash`. Free tier has low per-day quotas; enable billing on Google Cloud for higher limits if needed.
- **`OPENROUTER_API_KEY`** (optional): [OpenRouter](https://openrouter.ai/) API key. When set, the service retries OpenRouter on `429`/`503`, then optionally tries a second model.
- **`OPENROUTER_MODEL`** (optional): OpenRouter model slug. Default: `qwen/qwen3-next-80b-a3b-instruct:free`.
- **`OPENROUTER_FALLBACK_MODEL`** (optional): If the primary OpenRouter model fails after retries, this model is tried once (use a paid or less congested slug from [OpenRouter models](https://openrouter.ai/models)).

Example:

```bash
CLIENT_ID=your-quran-foundation-client-id
CLIENT_SECRET=your-quran-foundation-client-secret
EXTENSION_ID=diilngbfimlnkdbabjhadnblkhfbfcge
EXTENSION_SECRET=your-shared-secret

GEMINI_API_KEY=your-gemini-api-key
# GEMINI_MODEL=gemini-2.5-flash

OPENROUTER_API_KEY=your-openrouter-key
# OPENROUTER_MODEL=qwen/qwen3-next-80b-a3b-instruct:free
# OPENROUTER_FALLBACK_MODEL=openai/gpt-4o-mini

# User auth (login + bookmarks)
QF_USER_REDIRECT_URI=https://quran-chrome-extension-api.vercel.app/auth/quran/callback
APP_SESSION_SECRET=your-32-char-random-secret
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

### User Auth / Bookmarks (`/auth/quran/*` and `/user/*`)

> These env vars are only needed if you want login and Quran.com bookmark sync.

- **`QF_USER_REDIRECT_URI`** (required for login): The exact callback URL registered with Quran Foundation. Production: `https://quran-chrome-extension-api.vercel.app/auth/quran/callback`. Local dev: `http://localhost:3000/auth/quran/callback`. Both must be registered with QF.
- **`QF_USER_CLIENT_ID`** (optional): Overrides `CLIENT_ID` for user API calls (use if QF issued separate credentials).
- **`QF_USER_CLIENT_SECRET`** (optional): Overrides `CLIENT_SECRET` for user API calls.
- **`QF_USER_AUTH_BASE_URL`** (optional): QF OAuth base URL. Default: `https://oauth2.quran.foundation`.
- **`QF_USER_API_BASE_URL`** (optional): QF User API base URL. Default: `https://apis.quran.foundation`.
- **`APP_SESSION_SECRET`**: Random secret (≥32 chars) used for session ID generation. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **`UPSTASH_REDIS_REST_URL`** / **`UPSTASH_REDIS_REST_TOKEN`**: Upstash Redis REST credentials. Create a free database at [console.upstash.com](https://console.upstash.com). Without these, the server falls back to in-memory storage (local dev only — not suitable for production).

## Deploying to Vercel

The app is set up to run as a single serverless function on [Vercel](https://vercel.com).

1. **Push your code** to a Git repo (GitHub, GitLab, or Bitbucket) and [import the project in Vercel](https://vercel.com/new). Vercel will use the repo’s `vercel.json` and `package.json` build script.

2. **Set environment variables** in the Vercel project:
   - **Project → Settings → Environment Variables**
   - Add at minimum: `CLIENT_ID`, `CLIENT_SECRET`, `EXTENSION_ID`, `EXTENSION_SECRET`, `GEMINI_API_KEY`.
   - For OpenRouter fallback: `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`.

3. **Deploy**: Each push to your main branch will trigger a deploy. Or run:
   ```bash
   npx vercel
   ```
   and follow the prompts (use `vercel --prod` for production).

4. **Chrome extension**: In Vercel, set **`EXTENSION_ID`** to your published extension’s Store ID (for [Daily Quran](https://chromewebstore.google.com/detail/daily-quran/diilngbfimlnkdbabjhadnblkhfbfcge), use `diilngbfimlnkdbabjhadnblkhfbfcge`). Point the extension’s API base URL to your Vercel URL and send **`extension_secret`** on **Quran** routes. Redeploy after changing `EXTENSION_ID`. CORS allows only `chrome-extension://` origins for the configured ID(s).

## Installation

```bash
npm install
```

## Running the server

```bash
# development
npm run start

# watch mode (recommended during development)
npm run start:dev

# production build
npm run start:prod
```

By default the API listens on `http://localhost:3000`.

### CORS and Chrome extension integration

In `main.ts`, CORS is configured to:

- Allow **only** origins `chrome-extension://<id>` for each comma-separated value in **`EXTENSION_ID`** (e.g. one Store listing ID for every user of that listing, or `devId,storeId` for local unpacked plus production).
- Allow HTTP methods: `GET`, `POST`, and `OPTIONS` (preflight).
- Allow request headers: `Content-Type`, `extension_secret`, and `Accept`.
- Cache preflight responses for up to 24 hours (`maxAge`).

**Important — where `fetch` runs:** Requests from your extension **popup, options page, or service worker** send `Origin: chrome-extension://<your-extension-id>`, which matches the allowlist above. A **`fetch` from a content script** injected on a normal `https://` page often sends that **page’s** origin instead, so the API will reject it by design. If you need to call the API from a content script, perform `fetch` in the **service worker** (or extension page) and use **`chrome.runtime.sendMessage`** from the content script to ask the worker to call the API (see [Extension: API calls from content scripts](#extension-api-calls-from-content-scripts) below).

Your Chrome extension should:

- Make requests to `http://localhost:3000` (or your Vercel URL in production).
- Include the required **`extension_secret`** header on Quran routes (see next section). You may also send it on `POST /tafsir` if you want; the server does not validate it on that route yet.
- Use an **`EXTENSION_ID`** on the server that matches the extension build users install (Web Store ID for published builds).

> **Note**: Send the header name **`extension_secret`** (lowercase, underscore). Its value must match **`EXTENSION_SECRET`** from your environment.

#### Extension: API calls from content scripts

This repository is the API only. If Network shows `Origin: https://...` (the web page) instead of `chrome-extension://...`, update the **extension** project (not this repo): (1) handle `fetch` in the **service worker** with the same base URL and headers; (2) from the content script, call `chrome.runtime.sendMessage` to request that fetch; (3) ensure `host_permissions` (or equivalent) include your API host for MV3.

## Authentication

All Quran-related endpoints require a shared secret header. The controller expects:

- **Header name**: `extension_secret`
- **Header value**: Must exactly match **`EXTENSION_SECRET`** from `.env`

If the header is missing or invalid, the API responds with `401 Unauthorized`.

**`POST /tafsir`** does not validate `extension_secret` today (backward compatible with older extension clients). A future release may require the same header as Quran routes; see the [roadmap](https://trello.com/b/C6AHrqBZ/daily-quran-roadmap).

## API endpoints

Quran data routes live under **`/quran`**. AI explanation is **`POST /tafsir`** (separate path).

### `GET /quran/random-verse`

- **Headers**:
  - `extension_secret: <EXTENSION_SECRET>`
- **Description**: Returns a random verse with basic fields and a translation.
- **Query/body**: None.
- **Response** (simplified):
  - `verse`: object matching the `Verse` interface (see `src/quran/interfaces/verse.interface.ts`), e.g.:
    - `id`, `verse_number`, `verse_key`, `chapter_id`, `text_uthmani`, `translations[]`, etc.

### `GET /quran/translations`

- **Headers**:
  - `extension_secret: <EXTENSION_SECRET>`
- **Description**: Returns available translation resources from Quran Foundation.
- **Query/body**: None.
- **Response**: Direct pass-through of Quran Foundation translations resource.

### `GET /quran/chapters`

- **Headers**:
  - `extension_secret: <EXTENSION_SECRET>`
- **Description**: Returns metadata for all Quran chapters.
- **Query/body**: None.
- **Response**: Direct pass-through of Quran Foundation chapters resource.

### `GET /quran/verse/:key`

- **Headers**:
  - `extension_secret: <EXTENSION_SECRET>`
- **Route params**:
  - `key`: Numeric verse key (e.g. `1` for the first verse).
- **Description**: Returns information for a specific verse by its numeric key.
- **Response**: Verse data from Quran Foundation.

### `POST /tafsir`

- **Headers**:
  - `Content-Type: application/json`
  - `extension_secret` (optional today; not validated on the server — CORS still allows this header name for clients that send it)
- **Body** (JSON):
  - `chapter_name` (string)
  - `verseKey` (string)
  - `text` (string) — verse text
  - `tafsirHtml` (string) — HTML tafsir context
  - `question` (string) — user question (can be empty)
- **Description**: Returns a short grounded explanation. Tries **Gemini** first; if that fails or returns no text and `OPENROUTER_API_KEY` is set, tries **OpenRouter** with retries, then optional `OPENROUTER_FALLBACK_MODEL`.
- **Response** (JSON):
  - `explanation` (string)
  - `modelUsed` (string) — Gemini model id or OpenRouter model slug that produced the answer
  - `generatedAt` (string, ISO 8601)
- **Errors**: `503` when both providers are rate-limited or temporarily unavailable; `500` for other generation failures.

## Auth and user API endpoints

All auth/user routes also require `extension_secret` header. User routes additionally require `x-session-token`.

### `GET /auth/quran/login?state=<extState>`

- **Headers**: `extension_secret`
- **Description**: Redirects the browser to the Quran Foundation login page. `state` is a random opaque value generated by the extension. After login, QF redirects back to `/auth/quran/callback`.

### `GET /auth/quran/callback`

- **Description**: Handled by the server only (browser redirect from QF). Exchanges the code, stores the session, and returns a self-closing success HTML page.

### `GET /auth/quran/session/:extState`

- **Headers**: `extension_secret`
- **Description**: Extension polls this endpoint after opening the login tab. Returns `{ sessionToken, user }` once login completes; `404` until then. One-shot — the mapping is deleted on first successful read.
- **Response**: `{ sessionToken: string, user: { sub, firstName, lastName, email } }`

### `GET /auth/quran/me`

- **Headers**: `extension_secret`, `x-session-token`
- **Description**: Returns the authenticated user's profile.

### `POST /auth/quran/logout`

- **Headers**: `extension_secret`, `x-session-token`
- **Description**: Deletes the session.

### `GET /user/bookmarks`

- **Headers**: `extension_secret`, `x-session-token`
- **Description**: Returns the user's ayah bookmarks from Quran Foundation.

### `POST /user/bookmarks`

- **Headers**: `extension_secret`, `x-session-token`, `Content-Type: application/json`
- **Body**: `{ key: number, verseNumber: number }` — the `chapter_id` and `verse_number` from the verse.
- **Description**: Adds the ayah to the user's Quran.com default collection (favorites). Syncs with Quran.com immediately.

### `DELETE /user/bookmarks/:id`

- **Headers**: `extension_secret`, `x-session-token`
- **Description**: Removes a bookmark by its QF bookmark ID.

## Quran Foundation integration details

Internally, the service:

- Fetches an OAuth2 access token from `https://prelive-oauth2.quran.foundation` using `client_credentials` and `scope=content`.
- Caches the token and refreshes it automatically ~30 seconds before expiry.
- Calls the content API at `https://apis-prelive.quran.foundation/content/api/v4` using:
  - `x-auth-token: <access-token>`
  - `x-client-id: <CLIENT_ID>`
- Forwards upstream error responses with their original HTTP status code and message where possible.

You do **not** need to handle any of this in your Chrome extension; it only talks to this backend.

## Testing

```bash
npm run test
```

## License

This project is based on the NestJS starter and uses the MIT license.
