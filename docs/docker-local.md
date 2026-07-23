# Local Docker Setup

The Docker setup runs the production Nestory app in a container while the
Supabase CLI manages the local database services. The checkout and all
project-owned files stay under `D:\nestory`.

## Start

From PowerShell in `D:\nestory`:

```powershell
Copy-Item .env.docker.example .env.docker
npx supabase start
docker compose --env-file .env.docker up --build -d
```

Create `.env.docker` once, then replace every placeholder with values from the
disposable local Supabase stack. Keep this file local and never commit or paste
its keys into documentation, logs, or chat.

The public Supabase URL and one public client key
(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or the legacy
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) are required while the image is built and at
runtime. `SUPABASE_SERVICE_ROLE_KEY`, `APP_ROOT_DOMAIN`, and
`APP_RESERVED_SUBDOMAINS` are runtime-only values. For this Windows Docker
setup, keep the public URL on `http://host.docker.internal:54321` so the browser
and the container can both reach the CLI-managed gateway.

Compose binds Nestory only to `127.0.0.1:3000`. Open Nestory at
`http://127.0.0.1:3000`, Supabase Studio at
`http://localhost:54323`, and local email at `http://localhost:54324`.

## Smoke checks

Confirm the public login route responds:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/login -UseBasicParsing
```

For the authenticated smoke, open `http://127.0.0.1:3000/login`, sign in with a
disposable local fixture account, and confirm the workspace dashboard loads.
Do not use hosted credentials. If an automated authenticated smoke is needed,
set `BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` only in the current PowerShell
session and run the focused route through `npm run test:ui-redesign --
--route=/properties/setup`.

## Status and logs

```powershell
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
npx supabase status
```

## Stop

```powershell
docker compose --env-file .env.docker down
npx supabase stop
```

Do not add `-v` to either stop command unless local Docker data is intentionally
being deleted. `.env.docker` contains local-only keys and remains ignored by
Git.
