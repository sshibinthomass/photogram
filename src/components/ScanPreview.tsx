import { useEffect, useRef } from "react";
import {
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MeshBuffers } from "../scan/reconstruction";
import { createScanMesh } from "../scan/threeMesh";

type ScanPreviewProps = {
  mesh: MeshBuffers | null;
  active: boolean;
};

export function ScanPreview({ mesh, active }: ScanPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const meshGroupRef = useRef<Group | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const scene = new Scene();
    scene.background = new Color(0x07100f);

    const camera = new PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(2.8, 1.6, 3.2);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;

    const group = new Group();
    meshGroupRef.current = group;
    scene.add(group);

    const fill = new AmbientLight(0xd7fff2, 1.7);
    scene.add(fill);

    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(2.8, 4, 3.2);
    key.castShadow = true;
    scene.add(key);

    const rim = new DirectionalLight(0x73e2ff, 1.5);
    rim.position.set(-2, 1.5, -3);
    scene.add(rim);

    const grid = new GridHelper(3.2, 12, 0x57e0bf, 0x17423a);
    grid.position.y = -1.05;
    scene.add(grid);

    const axes = new AxesHelper(0.65);
    axes.position.set(-1.25, -1.02, -1.25);
    scene.add(axes);

    let frame = 0;
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (active) {
        group.rotation.y += 0.006;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      meshGroupRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) {
      return;
    }

    group.clear();
    if (mesh && mesh.positions.length > 0) {
      const scanMesh = createScanMesh(mesh);
      scanMesh.rotation.y = Math.PI;
      group.add(scanMesh);
    }
  }, [mesh]);

  return <div className="preview-canvas" ref={hostRef} aria-label="Live 3D object preview" />;
}
