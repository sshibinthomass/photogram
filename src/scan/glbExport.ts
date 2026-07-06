import { Group, Scene } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { MeshBuffers } from "./reconstruction";
import { createScanMesh } from "./threeMesh";

export async function exportScanAsGlb(buffers: MeshBuffers): Promise<Blob> {
  const scene = createExportScene(buffers);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });

  if (!(result instanceof ArrayBuffer)) {
    throw new Error("GLB export returned JSON instead of binary data.");
  }

  return new Blob([result], { type: "model/gltf-binary" });
}

export function createExportScene(buffers: MeshBuffers): Scene {
  const scene = new Scene();
  const group = new Group();
  group.name = "Android object scan";
  group.add(createScanMesh(buffers));
  scene.add(group);
  return scene;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
