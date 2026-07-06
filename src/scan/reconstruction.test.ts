import { describe, expect, it } from "vitest";
import {
  appendScanSlice,
  createEmptyScan,
  createMeshBuffers,
  extractSliceFromImageData,
} from "./reconstruction";

describe("scan reconstruction", () => {
  it("builds a colored strip mesh from angular object slices", () => {
    const scan = createEmptyScan({ rows: 3, targetSlices: 4, maxRadius: 1.2 });

    appendScanSlice(scan, {
      angle: 0,
      rows: [
        { radius: 0.25, color: [255, 0, 0] },
        { radius: 0.5, color: [0, 255, 0] },
        { radius: 0.25, color: [0, 0, 255] },
      ],
    });
    appendScanSlice(scan, {
      angle: Math.PI / 2,
      rows: [
        { radius: 0.3, color: [255, 80, 0] },
        { radius: 0.65, color: [80, 255, 0] },
        { radius: 0.3, color: [0, 80, 255] },
      ],
    });

    const mesh = createMeshBuffers(scan);

    expect(mesh.positions).toHaveLength(2 * 3 * 3);
    expect(mesh.colors).toHaveLength(2 * 3 * 3);
    expect(mesh.indices).toEqual([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
    expect(mesh.progress).toBe(0.5);
    expect(mesh.bounds.height).toBe(2.4);
  });

  it("extracts foreground radius and color from the drawn scan box", () => {
    const width = 8;
    const height = 6;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
      data[index] = 8;
      data[index + 1] = 8;
      data[index + 2] = 8;
      data[index + 3] = 255;
    }

    for (let y = 1; y <= 4; y += 1) {
      for (let x = 2; x <= 5; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 20;
        data[index + 1] = 180;
        data[index + 2] = 70;
      }
    }

    const rows = extractSliceFromImageData(
      { width, height, data },
      { x: 0, y: 0, width: 1, height: 1 },
      { rows: 3, maxRadius: 1 },
    );

    expect(rows).toHaveLength(3);
    expect(rows[1].radius).toBeCloseTo(0.5, 2);
    expect(rows[1].color).toEqual([20, 180, 70]);
  });

  it("closes the mesh loop when the target slice count is reached", () => {
    const scan = createEmptyScan({ rows: 2, targetSlices: 4, maxRadius: 1 });

    for (let sliceIndex = 0; sliceIndex < 4; sliceIndex += 1) {
      appendScanSlice(scan, {
        angle: (Math.PI * 2 * sliceIndex) / 4,
        rows: [
          { radius: 0.4, color: [255, 255, 255] },
          { radius: 0.6, color: [255, 255, 255] },
        ],
      });
    }

    const mesh = createMeshBuffers(scan);

    expect(mesh.indices).toHaveLength(24);
    expect(mesh.indices.slice(-6)).toEqual([6, 0, 7, 7, 0, 1]);
    expect(mesh.progress).toBe(1);
  });
});
