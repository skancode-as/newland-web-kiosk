import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetRegistryForTests } from "../src/core/registry";

afterEach(() => {
  cleanup();
  resetRegistryForTests();
  delete window.nlScan;
  delete window.nlBarcode;
  delete window.nlNFC;
});
