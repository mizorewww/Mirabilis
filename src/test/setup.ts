import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

Object.defineProperty(globalThis, "jest", {
  configurable: true,
  value: {
    advanceTimersByTime(milliseconds: number) {
      vi.advanceTimersByTime(milliseconds);
    },
  },
});

afterEach(() => {
  cleanup();
});
