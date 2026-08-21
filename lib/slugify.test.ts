import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Caregiver Circle")).toBe("caregiver-circle");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
  });

  it("strips punctuation", () => {
    expect(slugify("Founders' Collective!")).toBe("founders-collective");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--Wellness Guild--")).toBe("wellness-guild");
  });

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});
