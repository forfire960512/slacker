# apps/mobile

Capacitor iOS/Android shell wrapping the `apps/web` production build — no
separate UI code (see docs/ARCHITECTURE.md). Per the doc's build order,
this is meant to come *after* `apps/desktop`/`apps/vscode-extension`, once
`packages/core` has stabilized against a real native consumer — this
folder is scaffolding only, not the next thing to build.

## Status: scaffolding only

Next step (run locally — `cap add` pulls in Xcode/Android SDK-dependent
tooling, worth doing manually rather than blind):

```sh
pnpm --filter web build              # produces apps/web/dist, which webDir points at
pnpm --filter mobile exec cap add ios
pnpm --filter mobile exec cap add android
pnpm --filter mobile exec cap sync
```

That generates `ios/`/`android/` directories (already gitignored — see
root `.gitignore`). Note: this app has its own `capacitor.config.ts`
separate from `apps/desktop`'s, both pointing at the same web build —
that duplication is the architecture doc's chosen structure (one
monorepo package per native shell), not a Capacitor requirement.
