export type Rgb = readonly [number, number, number];

export type ScanRow = {
  radius: number;
  color: Rgb;
};

export type ScanSlice = {
  angle: number;
  rows: ScanRow[];
};

export type ScanSession = {
  rows: number;
  targetSlices: number;
  maxRadius: number;
  slices: ScanSlice[];
};

export type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type MeshBuffers = {
  positions: number[];
  colors: number[];
  indices: number[];
  progress: number;
  bounds: {
    height: number;
    radius: number;
  };
};

type ScanOptions = {
  rows: number;
  targetSlices: number;
  maxRadius: number;
};

type ExtractOptions = {
  rows: number;
  maxRadius: number;
  foregroundThreshold?: number;
};

export function createEmptyScan(options: ScanOptions): ScanSession {
  return {
    rows: options.rows,
    targetSlices: options.targetSlices,
    maxRadius: options.maxRadius,
    slices: [],
  };
}

export function appendScanSlice(scan: ScanSession, slice: ScanSlice): void {
  if (slice.rows.length !== scan.rows) {
    throw new Error(`Expected ${scan.rows} scan rows, received ${slice.rows.length}.`);
  }

  scan.slices.push({
    angle: slice.angle,
    rows: slice.rows.map((row) => ({
      radius: clamp(row.radius, 0.02, scan.maxRadius),
      color: row.color,
    })),
  });
}

export function createMeshBuffers(scan: ScanSession): MeshBuffers {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const height = scan.maxRadius * 2;

  scan.slices.forEach((slice) => {
    const cos = Math.cos(slice.angle);
    const sin = Math.sin(slice.angle);

    slice.rows.forEach((row, rowIndex) => {
      const y = scan.rows === 1 ? 0 : scan.maxRadius - (rowIndex / (scan.rows - 1)) * height;
      positions.push(row.radius * cos, y, row.radius * sin);
      colors.push(row.color[0] / 255, row.color[1] / 255, row.color[2] / 255);
    });
  });

  for (let sliceIndex = 0; sliceIndex < scan.slices.length - 1; sliceIndex += 1) {
    appendStripIndices(indices, sliceIndex * scan.rows, (sliceIndex + 1) * scan.rows, scan.rows);
  }

  if (scan.slices.length >= scan.targetSlices && scan.slices.length > 2) {
    appendStripIndices(indices, (scan.slices.length - 1) * scan.rows, 0, scan.rows);
  }

  return {
    positions,
    colors,
    indices,
    progress: Math.min(1, scan.slices.length / scan.targetSlices),
    bounds: {
      height,
      radius: scan.maxRadius,
    },
  };
}

function appendStripIndices(indices: number[], current: number, next: number, rows: number): void {
  for (let rowIndex = 0; rowIndex < rows - 1; rowIndex += 1) {
    const topLeft = current + rowIndex;
    const bottomLeft = topLeft + 1;
    const topRight = next + rowIndex;
    const bottomRight = topRight + 1;

    indices.push(topLeft, topRight, bottomLeft, bottomLeft, topRight, bottomRight);
  }
}

export function extractSliceFromImageData(
  image: RgbaImage,
  box: NormalizedBox,
  options: ExtractOptions,
): ScanRow[] {
  const crop = normalizedBoxToPixels(image, box);
  const background = estimateEdgeColor(image, crop);
  const threshold = options.foregroundThreshold ?? 36;
  const rows: ScanRow[] = [];

  for (let rowIndex = 0; rowIndex < options.rows; rowIndex += 1) {
    const y = crop.top + Math.min(crop.height - 1, Math.floor(((rowIndex + 0.5) / options.rows) * crop.height));
    let first = -1;
    let last = -1;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let x = crop.left; x < crop.left + crop.width; x += 1) {
      const pixel = readRgb(image, x, y);
      if (colorDistance(pixel, background) >= threshold) {
        if (first === -1) {
          first = x;
        }
        last = x;
        red += pixel[0];
        green += pixel[1];
        blue += pixel[2];
        count += 1;
      }
    }

    const widthRatio = count === 0 ? 0.02 : (last - first + 1) / crop.width;
    rows.push({
      radius: clamp(widthRatio * options.maxRadius, 0.02, options.maxRadius),
      color:
        count === 0
          ? background
          : [Math.round(red / count), Math.round(green / count), Math.round(blue / count)],
    });
  }

  return rows;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type PixelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function normalizedBoxToPixels(image: RgbaImage, box: NormalizedBox): PixelBox {
  const left = Math.floor(clamp(box.x, 0, 1) * image.width);
  const top = Math.floor(clamp(box.y, 0, 1) * image.height);
  const right = Math.ceil(clamp(box.x + box.width, 0, 1) * image.width);
  const bottom = Math.ceil(clamp(box.y + box.height, 0, 1) * image.height);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function estimateEdgeColor(image: RgbaImage, crop: PixelBox): Rgb {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const right = crop.left + crop.width - 1;
  const bottom = crop.top + crop.height - 1;

  for (let x = crop.left; x <= right; x += 1) {
    const topPixel = readRgb(image, x, crop.top);
    const bottomPixel = readRgb(image, x, bottom);
    red += topPixel[0] + bottomPixel[0];
    green += topPixel[1] + bottomPixel[1];
    blue += topPixel[2] + bottomPixel[2];
    count += 2;
  }

  for (let y = crop.top + 1; y < bottom; y += 1) {
    const leftPixel = readRgb(image, crop.left, y);
    const rightPixel = readRgb(image, right, y);
    red += leftPixel[0] + rightPixel[0];
    green += leftPixel[1] + rightPixel[1];
    blue += leftPixel[2] + rightPixel[2];
    count += 2;
  }

  return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}

function readRgb(image: RgbaImage, x: number, y: number): Rgb {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

function colorDistance(a: Rgb, b: Rgb): number {
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}
