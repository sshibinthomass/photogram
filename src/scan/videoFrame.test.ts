import { describe, expect, it } from "vitest";
import { computeCoverCrop } from "./videoFrame";

describe("video frame helpers", () => {
  it("crops a wide camera frame to match a portrait viewport", () => {
    const crop = computeCoverCrop(
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    );

    expect(crop.sourceX).toBeGreaterThan(700);
    expect(crop.sourceY).toBe(0);
    expect(crop.sourceHeight).toBe(1080);
    expect(crop.sourceWidth).toBeCloseTo(499, 0);
  });

  it("crops a tall camera frame to match a landscape viewport", () => {
    const crop = computeCoverCrop(
      { width: 1080, height: 1920 },
      { width: 900, height: 500 },
    );

    expect(crop.sourceX).toBe(0);
    expect(crop.sourceY).toBeGreaterThan(650);
    expect(crop.sourceWidth).toBe(1080);
    expect(crop.sourceHeight).toBeCloseTo(600, 0);
  });
});
