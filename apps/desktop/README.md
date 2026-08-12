# apps/desktop

Capacitor Electron shell wrapping the `apps/web` production build — no
separate UI code (see docs/ARCHITECTURE.md).

## Status: scaffolding only

`package.json` and `capacitor.config.ts` are in place, but the native
Electron project itself hasn't been generated yet. That's a deliberate
manual step — `cap add` downloads Electron (100MB+) and scaffolds a real
platform project, which is worth running locally rather than blind:

```sh
pnpm --filter web build            # produces apps/web/dist, which webDir points at
pnpm --filter desktop exec cap add @capacitor-community/electron
pnpm --filter desktop exec cap sync
```

That generates an `electron/` directory (already gitignored — see root
`.gitignore`) containing the actual main-process entry point. Once it
exists, add `dev`/`build` scripts here that call into it.
