import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type GlbPreviewProps = {
  url: string | null;
};

export function GlbPreview({ url }: GlbPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) {
      return undefined;
    }

    const scene = new Scene();
    scene.background = new Color(0x07100f);

    const camera = new PerspectiveCamera(42, 1, 0.01, 1000);
    camera.position.set(2.8, 1.8, 3.2);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;

    scene.add(new AmbientLight(0xdffdf3, 1.5));
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(3, 4, 4);
    scene.add(key);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      if (disposed) {
        return;
      }

      const root = gltf.scene;
      const bounds = new Box3().setFromObject(root);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const maxSize = Math.max(size.x, size.y, size.z, 0.1);
      root.position.sub(center);
      root.scale.setScalar(2 / maxSize);
      scene.add(root);
    });

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
      controls.update();
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    animate();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [url]);

  return <div className="preview-canvas" ref={hostRef} aria-label="Photogrammetry GLB preview" />;
}
