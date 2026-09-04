# Pivot

Pivot is a trend-first weight tracker delivered as a React PWA and Capacitor iOS app. Its web application and API run together on Cloudflare Workers; user data is stored in D1.

## Local development

Prerequisites: Node.js 22+, a Google OAuth web client, and a VAPID key pair if you want to test push reminders.

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and add your local credentials.
3. Add `http://localhost:5173/api/auth/callback` to the Google client's authorized redirect URIs.
4. Create the local database with `npm run cf:migrate:local`.
5. Start the integrated React + Worker server with `npm run dev`.

The browser, Worker API, and OAuth callback share one origin. The development database is stored under `.wrangler/` and is intentionally ignored by Git.

Cloudflare's Vite output lives in `dist/client`; the Capacitor configuration uses that directory. The current OAuth/session flow is same-origin, so a distributable native build still needs a deployed Worker origin and a native OAuth handoff before release.

## Cloudflare deployment

The production stack consists of:

- a Worker serving the API and built frontend assets;
- D1 for profiles, entries, sessions, and reminder subscriptions;
- a Cron Trigger running every five minutes for reminder delivery;
- server-side Google OAuth with an opaque, HTTP-only session cookie.

Before the first deployment:

1. Authenticate Wrangler with `npx wrangler login`.
2. Create or provision the `pivot` D1 database and update `wrangler.jsonc` if Wrangler supplies a database ID.
3. Set `GOOGLE_CLIENT_ID`, `VAPID_PUBLIC_KEY`, and `VAPID_SUBJECT` as Worker vars.
4. Store `GOOGLE_CLIENT_SECRET` and `VAPID_PRIVATE_KEY` with `npx wrangler secret put <NAME>`.
5. Add `https://<your-domain>/api/auth/callback` to Google's authorized redirect URIs.
6. Run `npm run cf:migrate:remote`, then `npm run deploy`.

The GitHub Actions workflow expects repository secrets named `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`.

## Moving existing Firebase data

The infrastructure switch does not automatically read the old Firebase project. Before retiring it, users can export their history as JSON from the existing app and import that file after signing into the Cloudflare version. Keep Firebase read-only until the production D1 data has been checked.

## Useful commands

- `npm run lint` — type-check the React app and Worker.
- `npm run build` — create the production asset bundle.
- `npm run cf:types` — regenerate Cloudflare binding/runtime types after editing `wrangler.jsonc`.
- `npm run cap:sync` — build and sync the Capacitor projects.
