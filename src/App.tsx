import { Box, Camera, Download, Eraser, Play, Rotate3D, SquareDashedMousePointer, StopCircle } from "lucide-react";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ScanPreview } from "./components/ScanPreview";
import { downloadBlob, exportScanAsGlb } from "./scan/glbExport";
import {
  appendScanSlice,
  createEmptyScan,
  createMeshBuffers,
  extractSliceFromImageData,
  type MeshBuffers,
  type NormalizedBox,
  type ScanSession,
} from "./scan/reconstruction";
import { computeCoverCrop } from "./scan/videoFrame";

const SCAN_ROWS = 56;
const TARGET_SLICES = 42;
const CAPTURE_INTERVAL_MS = 620;
const CAPTURE_WIDTH = 640;
const MAX_RADIUS = 1.05;

type ScanMode = "framing" | "ready" | "scanning" | "complete";
type DragState = { startX: number; startY: number } | null;

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const scanRef = useRef<ScanSession>(createEmptyScan({ rows: SCAN_ROWS, targetSlices: TARGET_SLICES, maxRadius: MAX_RADIUS }));
  const dragRef = useRef<DragState>(null);

  const [streamState, setStreamState] = useState<"booting" | "ready" | "blocked">("booting");
  const [cameraError, setCameraError] = useState("");
  const [mode, setMode] = useState<ScanMode>("framing");
  const [box, setBox] = useState<NormalizedBox | null>(null);
  const [mesh, setMesh] = useState<MeshBuffers | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const progressPercent = Math.round((mesh?.progress ?? 0) * 100);
  const statusText = useMemo(() => {
    if (streamState === "blocked") {
      return "Camera permission needed";
    }
    if (!box) {
      return "Draw scan box";
    }
    if (mode === "scanning") {
      return `Walk around object - ${progressPercent}%`;
    }
    if (mode === "complete") {
      return "Scan ready";
    }
    return "Box locked";
  }, [box, mode, progressPercent, streamState]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function openCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not expose camera capture.");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStreamState("ready");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to open camera.";
        setCameraError(message);
        setStreamState("blocked");
      }
    }

    openCamera();

    return () => {
      cancelled = true;
      if (captureTimerRef.current !== null) {
        window.clearInterval(captureTimerRef.current);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const clearScan = () => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    scanRef.current = createEmptyScan({ rows: SCAN_ROWS, targetSlices: TARGET_SLICES, maxRadius: MAX_RADIUS });
    setMesh(null);
    setSampleCount(0);
    setMode(box ? "ready" : "framing");
  };

  const startScan = () => {
    if (!box || streamState !== "ready") {
      return;
    }

    clearScan();
    setMode("scanning");
    captureOneSlice(0);
    captureTimerRef.current = window.setInterval(() => {
      const nextIndex = scanRef.current.slices.length;
      captureOneSlice(nextIndex);
    }, CAPTURE_INTERVAL_MS);
  };

  const stopScan = () => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setMode(scanRef.current.slices.length > 2 ? "complete" : "ready");
  };

  const captureOneSlice = (sliceIndex: number) => {
    const video = videoRef.current;
    const stage = stageRef.current;
    const canvas = frameCanvasRef.current;
    if (!video || !stage || !canvas || !box || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const stageBounds = stage.getBoundingClientRect();
    canvas.width = CAPTURE_WIDTH;
    canvas.height = Math.round(CAPTURE_WIDTH * (stageBounds.height / stageBounds.width));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    const crop = computeCoverCrop(
      { width: video.videoWidth, height: video.videoHeight },
      { width: canvas.width, height: canvas.height },
    );
    context.drawImage(
      video,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const rows = extractSliceFromImageData(image, box, { rows: SCAN_ROWS, maxRadius: MAX_RADIUS });
    const angle = (Math.PI * 2 * sliceIndex) / TARGET_SLICES;
    appendScanSlice(scanRef.current, { angle, rows });
    const nextMesh = createMeshBuffers(scanRef.current);
    setMesh(nextMesh);
    setSampleCount(scanRef.current.slices.length);

    if (scanRef.current.slices.length >= TARGET_SLICES) {
      if (captureTimerRef.current !== null) {
        window.clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      setMode("complete");
    }
  };

  const exportGlb = async () => {
    if (!mesh || mesh.indices.length === 0) {
      return;
    }

    setIsExporting(true);
    try {
      const blob = await exportScanAsGlb(mesh);
      downloadBlob(blob, `object-scan-${new Date().toISOString().replace(/[:.]/g, "-")}.glb`);
    } finally {
      setIsExporting(false);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode === "scanning") {
      return;
    }
    const point = pointFromPointer(event);
    dragRef.current = { startX: point.x, startY: point.y };
    setBox({ x: point.x, y: point.y, width: 0, height: 0 });
    setMode("framing");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || mode === "scanning") {
      return;
    }

    const point = pointFromPointer(event);
    setBox(normalizeDragBox(drag.startX, drag.startY, point.x, point.y));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const nextBox = box;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!nextBox || nextBox.width < 0.08 || nextBox.height < 0.08) {
      setBox(null);
      setMode("framing");
      return;
    }

    setMode("ready");
  };

  return (
    <main className="scanner-shell">
      <section className="camera-stage" ref={stageRef} aria-label="Android camera scanner">
        <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
        <canvas ref={frameCanvasRef} className="hidden-canvas" aria-hidden="true" />

        <div
          className="scan-overlay"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {box && (
            <div
              className={`scan-box ${mode === "scanning" ? "is-scanning" : ""}`}
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        <header className="top-bar">
          <div>
            <p className="eyebrow"><Camera size={14} /> S25 Ultra web scan</p>
            <h1>Object Scan GLB</h1>
          </div>
          <div className={`status-pill ${mode}`}>
            <Rotate3D size={16} />
            <span>{statusText}</span>
          </div>
        </header>

        <aside className="preview-dock">
          <div className="preview-header">
            <div>
              <p>Build preview</p>
              <strong>{sampleCount}/{TARGET_SLICES}</strong>
            </div>
            <span>{progressPercent}%</span>
          </div>
          <ScanPreview mesh={mesh} active={mode === "scanning"} />
        </aside>

        {streamState === "blocked" && (
          <div className="camera-error" role="alert">
            <strong>Camera blocked</strong>
            <p>{cameraError || "Open this page on HTTPS and allow camera access."}</p>
          </div>
        )}

        <footer className="control-rail">
          <button type="button" className="tool-button secondary" onClick={clearScan}>
            <Eraser size={18} />
            <span>Reset</span>
          </button>

          {mode === "scanning" ? (
            <button type="button" className="tool-button danger" onClick={stopScan}>
              <StopCircle size={20} />
              <span>Stop</span>
            </button>
          ) : (
            <button type="button" className="tool-button primary" onClick={startScan} disabled={!box || streamState !== "ready"}>
              <Play size={20} />
              <span>Start scan</span>
            </button>
          )}

          <button type="button" className="tool-button secondary" onClick={exportGlb} disabled={!mesh || mesh.indices.length === 0 || isExporting}>
            <Download size={18} />
            <span>{isExporting ? "Exporting" : ".glb"}</span>
          </button>
        </footer>

        <div className="guide-strip">
          <span><SquareDashedMousePointer size={15} /> Draw box before scanning</span>
          <span><Box size={15} /> Keep object inside box</span>
          <span><Rotate3D size={15} /> Walk one full circle</span>
        </div>
      </section>
    </main>
  );
}

function pointFromPointer(event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function normalizeDragBox(startX: number, startY: number, endX: number, endY: number): NormalizedBox {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return {
    x,
    y,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
