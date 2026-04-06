# Gemini SZ

Mobile-first AI query app scaffold built with:

- Next.js App Router
- Cloudflare Workers via OpenNext
- Gemini API on the server side
- first-party username/password login
- D1 for auth, conversations, and messages

## What is included

- Landing page with username/password sign-in
- Protected `/app` workspace
- Conversation list + message history
- Text prompt submission
- Optional image upload encoded as Gemini `inlineData`
- D1 schema for auth and chat data
- Cloudflare deployment config

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy local secrets:

```bash
cp .dev.vars.example .dev.vars
```

3. Create the local D1 database:

```bash
npx wrangler d1 create gemini-sz-db
```

4. Replace the placeholder `database_id` in [wrangler.jsonc](/Users/ni/Github/gemini-sz/wrangler.jsonc) with the real value from the previous command.

5. Apply the schema:

```bash
npx wrangler d1 execute gemini-sz-db --local --file=./migrations/0001_init.sql
```

6. Start the app:

```bash
npm run dev
```

## Manual account setup

This version uses your own account table in D1. You manually create users, then sign in with the stored username and password.

The current password hashing setting uses `PBKDF2-SHA256` with `100000` iterations to stay compatible with Cloudflare Workers. If you created users with an older build that used a higher iteration count, regenerate those user records before deploying.

Generate one SQL insert with:

```bash
node scripts/create-user.mjs admin change-me-now Admin
```

Or write directly into the local D1 database:

```bash
node scripts/create-user.mjs admin change-me-now Admin --apply
```

Then run the printed SQL against D1, for example:

```bash
npx wrangler d1 execute gemini-sz-db --local --command=\"INSERT INTO users (...) VALUES (...)\"
```

Only `GEMINI_API_KEY` is required in `.dev.vars` for this version.

## Deploy

Build and deploy with:

```bash
npm run deploy
```

Before deploying, make sure you have:

- created the D1 database in your Cloudflare account
- updated `wrangler.jsonc`
- uploaded `GEMINI_API_KEY` with `wrangler secret put`

## Reference

Gemini request formatting is based on the local prototype in:

- [README.md](/Users/ni/Github/gemini-test/README.md)
- [index.mjs](/Users/ni/Github/gemini-test/index.mjs)
