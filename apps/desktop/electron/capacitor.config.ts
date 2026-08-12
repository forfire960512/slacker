import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.slacker.app",
  appName: "slacker",
  // Points at apps/web's production build — desktop loads that build
  // as-is, no separate UI code (see docs/ARCHITECTURE.md). One level
  // deeper than apps/desktop/capacitor.config.ts (this file lives in
  // apps/desktop/electron/, not apps/desktop/), so it needs an extra
  // "../" to actually reach apps/web/dist — `cap add` copied this file
  // in without adjusting the relative path, so it silently pointed at
  // the nonexistent apps/desktop/web/dist and every `cap sync` was a
  // no-op that still reported success.
  webDir: "../../web/dist",
};

export default config;
