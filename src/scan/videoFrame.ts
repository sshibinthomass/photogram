type Size = {
  width: number;
  height: number;
};

export type CoverCrop = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function computeCoverCrop(source: Size, destination: Size): CoverCrop {
  const sourceAspect = source.width / source.height;
  const destinationAspect = destination.width / destination.height;

  if (sourceAspect > destinationAspect) {
    const sourceWidth = source.height * destinationAspect;
    return {
      sourceX: (source.width - sourceWidth) / 2,
      sourceY: 0,
      sourceWidth,
      sourceHeight: source.height,
    };
  }

  const sourceHeight = source.width / destinationAspect;
  return {
    sourceX: 0,
    sourceY: (source.height - sourceHeight) / 2,
    sourceWidth: source.width,
    sourceHeight,
  };
}
