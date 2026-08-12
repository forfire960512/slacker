import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.slacker.app",
  appName: "slacker",
  // Points at apps/web's production build — mobile loads that build
  // as-is via the OS webview, no separate UI code (see docs/ARCHITECTURE.md).
  webDir: "../web/dist",
};

export default config;
