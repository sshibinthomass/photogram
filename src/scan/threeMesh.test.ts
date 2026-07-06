import { describe, expect, it } from "vitest";
import { BufferAttribute } from "three";
import { createScanGeometry } from "./threeMesh";
import type { MeshBuffers } from "./reconstruction";

describe("three mesh helpers", () => {
  it("creates buffer geometry with position, color, and index data", () => {
    const buffers: MeshBuffers = {
      positions: [0, 1, 0, 1, 0, 0, 0, -1, 0],
      colors: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 1, 2],
      progress: 1,
      bounds: { height: 2, radius: 1 },
    };

    const geometry = createScanGeometry(buffers);

    expect(geometry.getAttribute("position")).toBeInstanceOf(BufferAttribute);
    expect(geometry.getAttribute("color")).toBeInstanceOf(BufferAttribute);
    expect(Array.from(geometry.index?.array ?? [])).toEqual([0, 1, 2]);
    expect(geometry.getAttribute("position").count).toBe(3);
  });
});
