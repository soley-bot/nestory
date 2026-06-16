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
```

Copy `.env.example` to `.env.local` and fill in the Supabase values from the local start output or from the hosted Supabase project.

## Project Rules

Read `PROJECT_RULES.md` before making architecture, database, UI, or refactoring decisions.
