import { describe, expect, it } from "vitest";
import { Light } from "three";
import { createExportScene } from "./glbExport";
import type { MeshBuffers } from "./reconstruction";

describe("GLB export scene", () => {
  it("does not include scene lights that GLTFExporter warns about", () => {
    const buffers: MeshBuffers = {
      positions: [0, 1, 0, 1, 0, 0, 0, -1, 0],
      colors: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 1, 2],
      progress: 1,
      bounds: { height: 2, radius: 1 },
    };

    const scene = createExportScene(buffers);
    const lights: Light[] = [];
    scene.traverse((object) => {
      if (object instanceof Light) {
        lights.push(object);
      }
    });

    expect(lights).toHaveLength(0);
    expect(scene.getObjectByName("Android object scan")).toBeDefined();
  });
});
