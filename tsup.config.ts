import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    mock: "src/mock/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
  ],
  banner: {
    js: '"use client";',
  },
});
