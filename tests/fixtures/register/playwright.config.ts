// Child config for tests/register.spec.ts — HUD applied via withDemowright() only.
import { defineConfig } from "@playwright/test";
import { withDemowright } from "../../../src/config.js";

export default withDemowright(
  defineConfig({ testDir: ".", testMatch: "*.fixture.ts", workers: 1, use: { browserName: "chromium" } }),
  { actionDelay: 0 },
);
