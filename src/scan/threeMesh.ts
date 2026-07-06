import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
} from "three";
import type { MeshBuffers } from "./reconstruction";

export function createScanGeometry(buffers: MeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 3));

  if (buffers.indices.length > 0) {
    geometry.setIndex(buffers.indices);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}

export function createScanMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.05,
    side: DoubleSide,
    vertexColors: true,
  });
}

export function createScanMesh(buffers: MeshBuffers): Mesh {
  const mesh = new Mesh(createScanGeometry(buffers), createScanMaterial());
  mesh.name = "Android object scan";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.material.color.convertSRGBToLinear();
  return mesh;
}
