import { defineConfig } from "@playwright/test";
import { withQaHud } from "../src/config.js";

export default withQaHud(
  defineConfig({
    testDir: ".",
    outputDir: "../tmp",
    timeout: 120_000,
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
);
