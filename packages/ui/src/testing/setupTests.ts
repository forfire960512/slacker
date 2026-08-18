import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup only self-registers when it detects
// a global `afterEach` (this repo runs with Vitest's `test.globals` off, same
// as core/server — describe/it/expect are imported explicitly everywhere),
// so wire it up once here instead of repeating it per test file.
afterEach(() => {
  cleanup();
});
