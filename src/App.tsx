import {
  Camera,
  Download,
  Eraser,
  Play,
  Radar,
  StopCircle,
  UploadCloud,
} from "lucide-react";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { GlbPreview } from "./components/GlbPreview";
import { shouldAcceptFrame, type FrameQuality } from "./photogrammetry/captureQuality";
import { createPhotogrammetryClient, type PhotogrammetryClient, type ScanJob } from "./photogrammetry/jobClient";
import type { NormalizedBox } from "./scan/reconstruction";

const TARGET_FRAMES = 72;
const MIN_UPLOAD_FRAMES = 24;
const CAPTURE_INTERVAL_MS = 700;
const EXPORT_WIDTH = 1600;
const ANALYSIS_WIDTH = 192;

type ScanMode = "framing" | "capturing" | "readyToUpload" | "uploading" | "processing" | "complete" | "failed";
type DragState = { startX: number; startY: number } | null;
type CapturedFrame = {
  id: number;
  blob: Blob;
  url: string;
  quality: FrameQuality;
};

const DEFAULT_API_BASE =
  import.meta.env.VITE_PHOTOGRAMMETRY_API_URL ??
  "https://sshibinthomass--photogrammetry-colmap-fastapi-app.modal.run";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const dragRef = useRef<DragState>(null);
  const previousAnalysisRef = useRef<ImageData | null>(null);
  const framesRef = useRef<CapturedFrame[]>([]);

  const [apiBase, setApiBase] = useState(() => window.localStorage.getItem("photogrammetryApiUrl") ?? DEFAULT_API_BASE);
  const [streamState, setStreamState] = useState<"booting" | "ready" | "blocked">("booting");
  const [cameraError, setCameraError] = useState("");
  const [mode, setMode] = useState<ScanMode>("framing");
  const [box, setBox] = useState<NormalizedBox | null>(null);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [lastDecision, setLastDecision] = useState("Draw a guide box, then walk around the object.");
  const [job, setJob] = useState<ScanJob | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const client = useMemo<PhotogrammetryClient | null>(
    () => (apiBase.trim() ? createPhotogrammetryClient(apiBase.trim()) : null),
    [apiBase],
  );

  const canUpload = frames.length >= MIN_UPLOAD_FRAMES && mode === "readyToUpload";
  const showPreviewDock = frames.length > 0 || Boolean(modelUrl) || mode === "uploading" || mode === "processing";
  const progressPercent = Math.min(100, Math.round((frames.length / TARGET_FRAMES) * 100));
  const statusText = useMemo(() => {
    if (streamState === "blocked") {
      return "Camera permission needed";
    }
    if (mode === "capturing") {
      return `Capturing ${frames.length}/${TARGET_FRAMES}`;
    }
    if (mode === "readyToUpload") {
      return `${frames.length} photos ready`;
    }
    if (mode === "uploading") {
      return "Uploading scan";
    }
    if (mode === "processing") {
      return job?.message ?? "Reconstructing on Modal";
    }
    if (mode === "complete") {
      return "GLB ready";
    }
    if (mode === "failed") {
      return "Scan failed";
    }
    return box ? "Guide box locked" : "Draw guide box";
  }, [box, frames.length, job?.message, mode, streamState]);

  const stopTimers = () => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

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
        setCameraError(error instanceof Error ? error.message : "Unable to open camera.");
        setStreamState("blocked");
      }
    }

    openCamera();

    return () => {
      cancelled = true;
      stopTimers();
      stream?.getTracks().forEach((track) => track.stop());
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    };
  }, []);

  useEffect(() => {
    if (apiBase.trim()) {
      window.localStorage.setItem("photogrammetryApiUrl", apiBase.trim());
    }
  }, [apiBase]);

  const syncFrames = (nextFrames: CapturedFrame[]) => {
    framesRef.current = nextFrames;
    setFrames(nextFrames);
  };

  const resetScan = () => {
    stopTimers();
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    previousAnalysisRef.current = null;
    syncFrames([]);
    setJob(null);
    setModelUrl(null);
    setMode(box ? "framing" : "framing");
    setLastDecision("Draw a guide box, then walk around the object.");
  };

  const startCapture = () => {
    if (streamState !== "ready") {
      return;
    }
    resetScan();
    setMode("capturing");
    void captureFrame();
    captureTimerRef.current = window.setInterval(() => {
      void captureFrame();
    }, CAPTURE_INTERVAL_MS);
  };

  const stopCapture = () => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setMode(framesRef.current.length >= MIN_UPLOAD_FRAMES ? "readyToUpload" : "framing");
  };

  const uploadScan = async () => {
    if (!client) {
      setMode("failed");
      setLastDecision("Enter the deployed Modal API URL before uploading.");
      return;
    }

    setMode("uploading");
    setLastDecision("Uploading the captured photo set to Modal.");
    try {
      const created = await client.createScan({
        frames: framesRef.current.map((frame) => frame.blob),
        guideBox: box,
      });
      setJob(created);
      setMode(created.status === "complete" ? "complete" : "processing");
      if (created.status === "complete") {
        setModelUrl(created.modelUrl ?? client.modelUrl(created.jobId));
      } else {
        pollJob(created.jobId, client);
      }
    } catch (error) {
      setMode("failed");
      setLastDecision(error instanceof Error ? error.message : "Upload failed.");
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    const fullCanvas = fullCanvasRef.current;
    const analysisCanvas = analysisCanvasRef.current;
    if (!video || !fullCanvas || !analysisCanvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const analysis = readFrameImageData(video, analysisCanvas, ANALYSIS_WIDTH);
    const decision = shouldAcceptFrame(previousAnalysisRef.current, analysis, {
      minSharpness: 0.025,
      minDifference: 0.045,
    });
    setLastDecision(labelDecision(decision.reason, decision.quality.sharpness, decision.difference));

    if (!decision.accepted) {
      return;
    }

    const blob = await captureJpeg(video, fullCanvas, EXPORT_WIDTH);
    const nextFrame: CapturedFrame = {
      id: Date.now(),
      blob,
      url: URL.createObjectURL(blob),
      quality: decision.quality,
    };
    previousAnalysisRef.current = analysis;
    const nextFrames = [...framesRef.current, nextFrame];
    syncFrames(nextFrames);

    if (nextFrames.length >= TARGET_FRAMES) {
      stopCapture();
    }
  };

  const pollJob = (jobId: string, client: PhotogrammetryClient) => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const latest = await client.getScan(jobId);
        setJob(latest);
        if (latest.status === "complete") {
          stopTimers();
          setMode("complete");
          setModelUrl(latest.modelUrl ?? client.modelUrl(jobId));
          setLastDecision("Photogrammetry reconstruction complete.");
        }
        if (latest.status === "failed") {
          stopTimers();
          setMode("failed");
          setLastDecision(latest.message ?? "Photogrammetry reconstruction failed.");
        }
      } catch (error) {
        setLastDecision(error instanceof Error ? error.message : "Could not poll scan status.");
      }
    }, 3500);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode === "capturing" || mode === "processing" || mode === "uploading") {
      return;
    }
    const point = pointFromPointer(event);
    dragRef.current = { startX: point.x, startY: point.y };
    setBox({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const point = pointFromPointer(event);
    setBox(normalizeDragBox(drag.startX, drag.startY, point.x, point.y));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!box || box.width < 0.08 || box.height < 0.08) {
      setBox(null);
    }
  };

  return (
    <main className="scanner-shell">
      <section className="camera-stage" aria-label="Android photogrammetry scanner">
        <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
        <canvas ref={fullCanvasRef} className="hidden-canvas" aria-hidden="true" />
        <canvas ref={analysisCanvasRef} className="hidden-canvas" aria-hidden="true" />

        <div
          className="scan-overlay"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {box && (
            <div
              className={`scan-box ${mode === "capturing" ? "is-scanning" : ""}`}
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
            <p className="eyebrow"><Camera size={14} /> Photogrammetry capture</p>
            <h1>Object Scan GLB</h1>
          </div>
          <div className={`status-pill ${mode}`}>
            <Radar size={16} />
            <span>{statusText}</span>
          </div>
        </header>

        {showPreviewDock && (
          <aside className="preview-dock">
            <div className="preview-header">
              <div>
                <p>{mode === "complete" ? "GLB preview" : "Photo set"}</p>
                <strong>{frames.length}/{TARGET_FRAMES}</strong>
              </div>
              <span>{job?.progress ? `${Math.round(job.progress)}%` : `${progressPercent}%`}</span>
            </div>
            {modelUrl ? (
              <GlbPreview url={modelUrl} />
            ) : (
              <div className="frame-strip">
                {frames.slice(-12).map((frame) => (
                  <img src={frame.url} alt="" key={frame.id} />
                ))}
              </div>
            )}
          </aside>
        )}

        {streamState === "blocked" && (
          <div className="camera-error" role="alert">
            <strong>Camera blocked</strong>
            <p>{cameraError || "Open this page on HTTPS and allow camera access."}</p>
          </div>
        )}

        <div className="scan-readout">
          <strong>{lastDecision}</strong>
          <span>Keep the full object in frame; move slowly and keep 60-80% overlap.</span>
          <input
            className="endpoint-input"
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder="Modal API URL"
            inputMode="url"
            aria-label="Modal API URL"
          />
        </div>

        <footer className="control-rail">
          <button type="button" className="tool-button secondary" onClick={resetScan}>
            <Eraser size={18} />
            <span>Reset</span>
          </button>

          {mode === "capturing" ? (
            <button type="button" className="tool-button danger" onClick={stopCapture}>
              <StopCircle size={20} />
              <span>Stop</span>
            </button>
          ) : (
            <button type="button" className="tool-button primary" onClick={startCapture} disabled={streamState !== "ready" || mode === "uploading" || mode === "processing"}>
              <Play size={20} />
              <span>Capture</span>
            </button>
          )}

          {mode === "complete" && modelUrl ? (
            <a className="tool-button secondary" href={modelUrl} download="photogrammetry-scan.glb">
              <Download size={18} />
              <span>.glb</span>
            </a>
          ) : (
            <button type="button" className="tool-button secondary" onClick={uploadScan} disabled={!canUpload}>
              <UploadCloud size={18} />
              <span>Upload</span>
            </button>
          )}
        </footer>

      </section>
    </main>
  );
}

function readFrameImageData(video: HTMLVideoElement, canvas: HTMLCanvasElement, targetWidth: number): ImageData {
  const height = Math.max(1, Math.round(targetWidth * (video.videoHeight / video.videoWidth)));
  canvas.width = targetWidth;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not read camera frame.");
  }
  context.drawImage(video, 0, 0, targetWidth, height);
  return context.getImageData(0, 0, targetWidth, height);
}

async function captureJpeg(video: HTMLVideoElement, canvas: HTMLCanvasElement, targetWidth: number): Promise<Blob> {
  const height = Math.max(1, Math.round(targetWidth * (video.videoHeight / video.videoWidth)));
  canvas.width = targetWidth;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not capture camera frame.");
  }
  context.drawImage(video, 0, 0, targetWidth, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode camera frame."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.9);
  });
}

function labelDecision(reason: string, sharpness: number, difference: number): string {
  if (reason === "too-blurry") {
    return "Skipped blurry frame. Hold steady.";
  }
  if (reason === "too-similar") {
    return "Skipped duplicate view. Move a little farther around the object.";
  }
  return `Accepted photo. Sharpness ${sharpness.toFixed(2)}, view change ${difference.toFixed(2)}.`;
}

function pointFromPointer(event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function normalizeDragBox(startX: number, startY: number, endX: number, endY: number): NormalizedBox {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
