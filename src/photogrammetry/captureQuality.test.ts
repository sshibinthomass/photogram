import { describe, expect, it } from "vitest";
import { scoreFrameQuality, shouldAcceptFrame } from "./captureQuality";

function makeImage(width: number, height: number, pixel: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = pixel(x, y);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

describe("capture quality", () => {
  it("scores a detailed frame higher than a flat frame", () => {
    const flat = makeImage(32, 32, () => 128);
    const detailed = makeImage(32, 32, (x, y) => ((x + y) % 2 === 0 ? 20 : 235));

    expect(scoreFrameQuality(detailed).sharpness).toBeGreaterThan(scoreFrameQuality(flat).sharpness);
    expect(scoreFrameQuality(detailed).exposure).toBeGreaterThan(0.4);
  });

  it("rejects duplicate or blurry frames and accepts changed sharp frames", () => {
    const first = makeImage(32, 32, (x, y) => ((x + y) % 2 === 0 ? 20 : 235));
    const duplicate = makeImage(32, 32, (x, y) => ((x + y) % 2 === 0 ? 20 : 235));
    const changed = makeImage(32, 32, (x, y) => ((x * 3 + y * 5) % 7 < 3 ? 30 : 220));

    expect(shouldAcceptFrame(null, first).accepted).toBe(true);
    expect(shouldAcceptFrame(first, duplicate).accepted).toBe(false);
    expect(shouldAcceptFrame(first, changed).accepted).toBe(true);
  });
});
