export type FrameQuality = {
  sharpness: number;
  exposure: number;
  contrast: number;
};

export type CaptureDecisionOptions = {
  minSharpness?: number;
  minDifference?: number;
};

export type CaptureDecision = {
  accepted: boolean;
  reason: "accepted" | "too-blurry" | "too-similar";
  quality: FrameQuality;
  difference: number;
};

export function scoreFrameQuality(image: ImageData): FrameQuality {
  let sum = 0;
  let sumSquares = 0;
  let gradient = 0;
  let gradientSamples = 0;
  const luma = new Float32Array(image.width * image.height);

  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * 4;
    const value = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114;
    luma[index] = value;
    sum += value;
    sumSquares += value * value;
  }

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const center = y * image.width + x;
      const gx = Math.abs(luma[center] - luma[center + 1]);
      const gy = Math.abs(luma[center] - luma[center + image.width]);
      gradient += gx + gy;
      gradientSamples += 1;
    }
  }

  const pixelCount = image.width * image.height;
  const mean = sum / pixelCount;
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean);
  const normalizedMean = mean / 255;

  return {
    sharpness: gradientSamples === 0 ? 0 : gradient / gradientSamples / 255,
    exposure: 1 - Math.min(1, Math.abs(normalizedMean - 0.5) * 2),
    contrast: Math.min(1, Math.sqrt(variance) / 128),
  };
}

export function shouldAcceptFrame(
  previous: ImageData | null,
  current: ImageData,
  options: CaptureDecisionOptions = {},
): CaptureDecision {
  const quality = scoreFrameQuality(current);
  const minSharpness = options.minSharpness ?? 0.04;
  const minDifference = options.minDifference ?? 0.08;
  const difference = previous ? frameDifference(previous, current) : 1;

  if (quality.sharpness < minSharpness) {
    return { accepted: false, reason: "too-blurry", quality, difference };
  }

  if (previous && difference < minDifference) {
    return { accepted: false, reason: "too-similar", quality, difference };
  }

  return { accepted: true, reason: "accepted", quality, difference };
}

function frameDifference(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }

  const step = Math.max(4, Math.floor((a.width * a.height) / 2048) * 4);
  let total = 0;
  let samples = 0;

  for (let offset = 0; offset < a.data.length; offset += step) {
    const aLuma = a.data[offset] * 0.299 + a.data[offset + 1] * 0.587 + a.data[offset + 2] * 0.114;
    const bLuma = b.data[offset] * 0.299 + b.data[offset + 1] * 0.587 + b.data[offset + 2] * 0.114;
    total += Math.abs(aLuma - bLuma) / 255;
    samples += 1;
  }

  return samples === 0 ? 0 : total / samples;
}
