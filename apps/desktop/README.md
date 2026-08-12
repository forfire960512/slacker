# apps/desktop

Capacitor Electron shell wrapping the `apps/web` production build — no
separate UI code (see docs/ARCHITECTURE.md).

## Running it

```sh
pnpm --filter web build     # produces apps/web/dist
pnpm --filter desktop sync  # copies it into electron/app (see note below — NOT `cap sync`)
cd apps/desktop/electron
npm run build                # compiles the Electron main process (tsc + electron-rebuild)
npx electron ./
```

Re-run `sync` + the `electron/` build + relaunch after any change to
`apps/web` or `electron/src/*.ts` — nothing here watches/hot-reloads.

## `cap sync` doesn't work for this platform — use `pnpm sync` instead

`cap add @capacitor-community/electron` generated the `electron/` project
(gitignored — see root `.gitignore`), but its own `cap sync` reports
success ("copy web in Nms") without actually copying anything into
`electron/app`. Root cause: `cap add` copies `capacitor.config.ts` into
`electron/` without adjusting its `webDir` for the extra directory level,
so it silently resolves to a path that doesn't exist — and even after
fixing that, `cap sync` still didn't pick up changes reliably. `scripts/sync-web.mjs`
(the `pnpm sync` script above) bypasses `cap sync` entirely with a plain
recursive copy from `apps/web/dist` into `electron/app`.

## Content Security Policy — external links

`electron/src/setup.ts`'s `setWindowOpenHandler` denies opening any URL
outside the app's own custom scheme, which is correct for security but
also silently swallowed clicks on chat message links until it was changed
to call `shell.openExternal()` for those before denying — see git history.
