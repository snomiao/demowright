import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/config.ts",
    "src/helpers.ts",
    "src/auto-annotate.ts",
    "src/setup.ts",
    "src/video-script.ts",
  ],
  format: "esm",
  dts: true,
  outDir: "dist",
  clean: true,

});
