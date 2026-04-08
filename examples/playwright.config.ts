import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { withDemowright } from "../src/config.js";

// Load .env.local (GEMINI_API_KEY) — register.cjs auto-detects it
try {
  const envFile = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env.local not found */ }

export default withDemowright(
  defineConfig({
    testDir: ".",
    outputDir: "../.demowright/tmp",
    timeout: 360_000,
    use: {
      video: { mode: "on", size: { width: 1280, height: 720 } },
      viewport: { width: 1280, height: 720 },
      launchOptions: {
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      },
    },
    projects: [
      {
        name: "firefox",
        use: { browserName: "firefox" },
      },
    ],
  }),
  { actionDelay: 300, audio: true },
);
