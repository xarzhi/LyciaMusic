import { describe, expect, it } from "vitest";

import { compareVersions, extractVersion } from "./update";

describe("extractVersion", () => {
  it("extracts a semantic version from release labels", () => {
    expect(extractVersion("v1.2.3")).toBe("1.2.3");
    expect(extractVersion("release-2.0.1")).toBe("2.0.1");
  });

  it("falls back to the trimmed input when no version pattern exists", () => {
    expect(extractVersion("  beta  ")).toBe("beta");
  });
});

describe("compareVersions", () => {
  it("compares dotted versions numerically", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  it("treats missing trailing parts as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });
});
