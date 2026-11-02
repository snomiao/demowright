// Child config for tests/config-tts.spec.ts — exercises withDemowright({ tts: fn }).
import { defineConfig } from "@playwright/test";
import { withDemowright } from "../../../src/config.js";
import { fakeTts } from "../../support/fake-tts.js";

export default withDemowright(
  defineConfig({ testDir: ".", testMatch: "*.fixture.ts", workers: 1, use: { browserName: "chromium" } }),
  { tts: fakeTts, actionDelay: 0 },
);
