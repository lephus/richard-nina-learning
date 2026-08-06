import { describe, expect, it } from "vitest";
import type { PartOfSpeech } from "@content/types";

describe("toolchain", () => {
  it("chạy được TypeScript và alias @content", () => {
    const pos: PartOfSpeech = "n";
    expect(pos).toBe("n");
  });
});
