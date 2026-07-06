import type { NormalizedBox } from "../scan/reconstruction";

export type ScanStatus = "queued" | "processing" | "complete" | "failed";

export type CreateScanInput = {
  frames: Blob[];
  guideBox: NormalizedBox | null;
};

export type ScanJob = {
  jobId: string;
  status: ScanStatus;
  message?: string;
  progress?: number;
  modelUrl?: string;
};

export type PhotogrammetryClient = {
  createScan(input: CreateScanInput): Promise<ScanJob>;
  getScan(jobId: string): Promise<ScanJob>;
  modelUrl(jobId: string): string;
};

type FetchLike = typeof fetch;

export function createPhotogrammetryClient(baseUrl: string, fetchImpl: FetchLike = fetch): PhotogrammetryClient {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  return {
    async createScan(input) {
      const body = new FormData();
      body.set("metadata", JSON.stringify({ frameCount: input.frames.length, guideBox: input.guideBox }));
      input.frames.forEach((frame, index) => {
        body.append("images", frame, `frame-${String(index + 1).padStart(4, "0")}.jpg`);
      });

      const response = await fetchImpl(`${normalizedBase}/scans`, {
        method: "POST",
        body,
      });
      return readJobResponse(response);
    },

    async getScan(jobId) {
      const response = await fetchImpl(`${normalizedBase}/scans/${encodeURIComponent(jobId)}`);
      return readJobResponse(response);
    },

    modelUrl(jobId) {
      return `${normalizedBase}/scans/${encodeURIComponent(jobId)}/model.glb`;
    },
  };
}

async function readJobResponse(response: Response): Promise<ScanJob> {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : `Request failed with ${response.status}`);
  }

  return {
    jobId: String(payload.jobId ?? payload.job_id),
    status: payload.status,
    message: payload.message,
    progress: typeof payload.progress === "number" ? payload.progress : undefined,
    modelUrl: payload.modelUrl ?? payload.model_url,
  };
}
