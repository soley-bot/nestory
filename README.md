# Nestory

Nestory is a web-first Property History and Performance Hub for property management companies in Cambodia.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Next.js app:

```bash
npm run dev
```

Run verification:

```bash
npm run lint
npm run build
```

## Supabase

Supabase CLI is installed as a local dev dependency. Docker Desktop must be running before local Supabase commands work.

Start Supabase:

```bash
npm run supabase:start
```

Validate and reset the local database:

```bash
npm run db:lint
npm run db:reset
npm run db:types
```

Copy `.env.example` to `.env.local` and fill in the Supabase values from the local start output or from the hosted Supabase project.

Hosted Supabase project:

- Organization: SOLEY
- Project: nestory
- Region: ap-southeast-1, Singapore
- Project ref: `pfvmztxktkwyewvxfgot`
- Public URL: `https://pfvmztxktkwyewvxfgot.supabase.co`

Codex Supabase MCP is authenticated for hosted project work. Supabase CLI hosted login is not required for local development; if we later want `supabase link` or `supabase db push`, log in with a fresh Supabase personal access token.

## Project Rules

Read `PROJECT_RULES.md` before making architecture, database, UI, or refactoring decisions.
