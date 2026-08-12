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

  Verified against a real `docker compose up -d` Postgres instance: schema
  creation (including the idempotent `IF NOT EXISTS` re-run path), a
  login+send+broadcast round-trip, and reading a previously-saved message
  back via the history event on a fresh connection — all confirmed working
  end-to-end, JSONB `links` and `BIGINT created_at` included.

## Session persistence

`JWT_SECRET`, if not set via env, is generated once and saved to
`data/.jwt-secret` — so restarting the server in dev doesn't invalidate
every session. Delete that file (or set `JWT_SECRET` explicitly) to force
everyone to re-login.

`data/` is gitignored entirely — safe to delete to reset both sessions and
(SQLite) history.
