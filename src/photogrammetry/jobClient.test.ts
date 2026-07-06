import { describe, expect, it, vi } from "vitest";
import { createPhotogrammetryClient } from "./jobClient";

describe("photogrammetry job client", () => {
  it("uploads captured frames as multipart files with scan metadata", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get("metadata")).toBe(
        JSON.stringify({ frameCount: 2, guideBox: { x: 0.2, y: 0.2, width: 0.4, height: 0.5 } }),
      );
      expect(body.getAll("images")).toHaveLength(2);

      return new Response(JSON.stringify({ jobId: "scan-1", status: "queued" }), { status: 200 });
    });

    const client = createPhotogrammetryClient("https://api.example.test", fetchMock);
    const result = await client.createScan({
      frames: [new Blob(["a"], { type: "image/jpeg" }), new Blob(["b"], { type: "image/jpeg" })],
      guideBox: { x: 0.2, y: 0.2, width: 0.4, height: 0.5 },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/scans", expect.any(Object));
    expect(result.jobId).toBe("scan-1");
  });

  it("normalizes a backend base URL with trailing slash", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jobId: "scan-2", status: "complete" })));
    const client = createPhotogrammetryClient("https://api.example.test/", fetchMock);

    await client.getScan("scan-2");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/scans/scan-2");
  });
});
