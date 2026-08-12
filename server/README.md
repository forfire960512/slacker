# server

Fastify + WebSocket chat server. `POST /auth/login` issues a nickname-claim
JWT, `/ws?token=...` carries chat traffic, `/health` for liveness. See
docs/ARCHITECTURE.md for the full design.

## Message persistence

Two backends behind the same `MessageStore` interface (`src/store/`):

- **SQLite** (default, zero setup) — `node:sqlite`, writes to
  `data/slacker.db`. Just run `pnpm dev`.
- **Postgres** (the real backend the architecture doc settles on) — set
  `DATABASE_URL` and it's picked automatically instead:

  ```sh
  docker compose up -d          # starts Postgres on localhost:5432 (see docker-compose.yml)
  cp .env.example .env          # then uncomment DATABASE_URL in .env
  pnpm dev
  ```

  **Status: written but not run.** This dev environment has neither Docker
  nor a local Postgres install, so `src/store/postgresMessageStore.ts` has
  only been typechecked, not executed against a real database. Before
  relying on it: bring up `docker compose`, point `DATABASE_URL` at it, and
  confirm `pnpm dev` boots cleanly and a login+message round-trip works
  (same checks as the SQLite path — see the git history for the
  session/message persistence commit for the exact verification steps used
  there).

## Session persistence

`JWT_SECRET`, if not set via env, is generated once and saved to
`data/.jwt-secret` — so restarting the server in dev doesn't invalidate
every session. Delete that file (or set `JWT_SECRET` explicitly) to force
everyone to re-login.

`data/` is gitignored entirely — safe to delete to reset both sessions and
(SQLite) history.
