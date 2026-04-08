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
- **Shared-secret header**: All Quran endpoints require a secret header to prevent arbitrary clients from calling the API.

## Prerequisites

- **Node.js**: v18+ (recommended)
- **npm**: v9+ (or yarn / pnpm if you prefer)
- **Quran Foundation API credentials**: `CLIENT_ID` and `CLIENT_SECRET` from [Quran Foundation](https://api-docs.quran.foundation/request-access).
- **Chrome Extension ID**: The ID of your Chrome extension that will call this API.

## Environment variables

Create a `.env` file in the project root (do **not** commit real secrets to version control in new projects) with the following keys:

- **`CLIENT_ID`**: Quran Foundation API client ID.
- **`CLIENT_SECRET`**: Quran Foundation API client secret.
- **`EXTENSION_ID`**: Your Chrome extension ID (e.g. `abcdefghijklmnopabcdefghijklmnop`).
- **`EXTENSION_SECRET`**: Shared secret your extension sends in the `extension_secret` header (any secure string you choose).

Example:

```bash
CLIENT_ID=your-quran-foundation-client-id
CLIENT_SECRET=your-quran-foundation-client-secret
EXTENSION_ID=your-chrome-extension-id
EXTENSION_SECRET=your-shared-secret
```

## Deploying to Vercel

The app is set up to run as a single serverless function on [Vercel](https://vercel.com).

1. **Push your code** to a Git repo (GitHub, GitLab, or Bitbucket) and [import the project in Vercel](https://vercel.com/new). Vercel will use the repo’s `vercel.json` and `package.json` build script.

2. **Set environment variables** in the Vercel project:
   - **Project → Settings → Environment Variables**
   - Add: `CLIENT_ID`, `CLIENT_SECRET`, `EXTENSION_ID`, `EXTENSION_SECRET` (same values as in `.env`).

3. **Deploy**: Each push to your main branch will trigger a deploy. Or run:
   ```bash
   npx vercel
   ```
   and follow the prompts (use `vercel --prod` for production).

4. **Chrome extension**: Point your extension’s API base URL to your Vercel URL (e.g. `https://your-project.vercel.app`) and keep the same `EXTENSION_ID` and `extension_secret` header. CORS is already restricted to `chrome-extension://<EXTENSION_ID>`.

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

> **Note**: The CORS configuration currently allows the header named `extension-secret`, while the controller reads `extension-secret`. Make sure the header name used by your extension matches what your controllers expect (you can align them by updating one side if needed).

## Authentication

All Quran-related endpoints require a shared secret header. The controller expects:

- **Header name**: `extension-secret`
- **Header value**: Must exactly match your `EXTENSION-SECRET` from `.env`

If the header is missing or invalid, the API responds with `401 Unauthorized`.

## API endpoints

All routes are prefixed with `/quran`.

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

Standard NestJS test scripts are available:

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# coverage
npm run test:cov
```

## License

This project is based on the NestJS starter and uses the MIT license.
