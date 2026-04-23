## Quran Chrome Extension API

Backend API for a Chrome extension that displays verses from the Quran.  
This service wraps the [Quran Foundation Content API](https://api-docs.quran.foundation) and exposes a small, opinionated HTTP API for your extension, with OAuth token management, CORS locking to a specific extension, and a simple shared-secret authentication layer.

Built with [NestJS](https://nestjs.com) and TypeScript.

## Features

- **Random verse endpoint**: Fetches a random verse including text and a selected translation.
- **Verse by key**: Fetch a specific verse by its numeric key.
- **Translations list**: Returns available translation resources from Quran Foundation.
- **Chapters list**: Returns metadata for all Quran chapters.
- **OAuth handling**: Manages Quran Foundation OAuth2 token acquisition, caching, and refresh.
- **Chrome-extension–only CORS**: Only allows requests originating from your configured Chrome extension ID.
- **Shared-secret header**: Quran endpoints require a secret header to prevent arbitrary clients from calling the API.
- **AI verse explanation (Tafsir)**: `POST /tafsir` uses Google **Gemini** first, then optionally **[OpenRouter](https://openrouter.ai/)** (default: [Qwen3 Next 80B free](https://openrouter.ai/qwen/qwen3-next-80b-a3b-instruct:free/api)) if Gemini errors or returns empty text, with retries on transient OpenRouter rate limits.

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
- **`EXTENSION_ID`**: Your Chrome extension ID (e.g. `abcdefghijklmnopabcdefghijklmnop`).
- **`EXTENSION_SECRET`**: Shared secret your extension sends in the `extension-secret` header (any secure string you choose).

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
EXTENSION_ID=your-chrome-extension-id
EXTENSION_SECRET=your-shared-secret

GEMINI_API_KEY=your-gemini-api-key
# GEMINI_MODEL=gemini-2.5-flash

OPENROUTER_API_KEY=your-openrouter-key
# OPENROUTER_MODEL=qwen/qwen3-next-80b-a3b-instruct:free
# OPENROUTER_FALLBACK_MODEL=openai/gpt-4o-mini
```

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

4. **Chrome extension**: Point your extension’s API base URL to your Vercel URL (e.g. `https://your-project.vercel.app`) and keep the same `EXTENSION_ID` and `extension-secret` header on Quran routes. CORS is already restricted to `chrome-extension://<EXTENSION_ID>`.

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

- Allow **only** the origin `chrome-extension://<EXTENSION_ID>` (taken from your environment variable).
- Allow HTTP methods: `GET`, `POST`.
- Allow headers: `Content-Type`, `extension-secret` (see note below).

Your Chrome extension should:

- Make requests to `http://localhost:3000`.
- Include the required secret header (see next section).
- Run with the same `EXTENSION_ID` that you configure on the server.

> **Note**: Send the header name **`extension-secret`** (lowercase, kebab-case). Its value must match **`EXTENSION_SECRET`** from your environment.

## Authentication

All Quran-related endpoints require a shared secret header. The controller expects:

- **Header name**: `extension-secret`
- **Header value**: Must exactly match **`EXTENSION_SECRET`** from `.env`

If the header is missing or invalid, the API responds with `401 Unauthorized`.

## API endpoints

Quran data routes live under **`/quran`**. AI explanation is **`POST /tafsir`** (separate path).

### `GET /quran/random-verse`

- **Headers**:
  - `extension-secret: <EXTENSION_SECRET>`
- **Description**: Returns a random verse with basic fields and a translation.
- **Query/body**: None.
- **Response** (simplified):
  - `verse`: object matching the `Verse` interface (see `src/quran/interfaces/verse.interface.ts`), e.g.:
    - `id`, `verse_number`, `verse_key`, `chapter_id`, `text_uthmani`, `translations[]`, etc.

### `GET /quran/translations`

- **Headers**:
  - `extension-secret: <EXTENSION_SECRET>`
- **Description**: Returns available translation resources from Quran Foundation.
- **Query/body**: None.
- **Response**: Direct pass-through of Quran Foundation translations resource.

### `GET /quran/chapters`

- **Headers**:
  - `extension-secret: <EXTENSION_SECRET>`
- **Description**: Returns metadata for all Quran chapters.
- **Query/body**: None.
- **Response**: Direct pass-through of Quran Foundation chapters resource.

### `GET /quran/verse/:key`

- **Headers**:
  - `extension-secret: <EXTENSION_SECRET>`
- **Route params**:
  - `key`: Numeric verse key (e.g. `1` for the first verse).
- **Description**: Returns information for a specific verse by its numeric key.
- **Response**: Verse data from Quran Foundation.

### `POST /tafsir`

- **Headers**: `Content-Type: application/json` (CORS allows `extension-secret` for consistency; this route does not validate the extension secret in code today).
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
