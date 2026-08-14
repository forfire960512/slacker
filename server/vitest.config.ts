import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The /ws test spins up a real listener and a real socket round-trip,
    // which is slower than pure-logic tests — give it more headroom than
    // vitest's 5s default so it isn't flaky under load.
    testTimeout: 10_000,
  },
});
