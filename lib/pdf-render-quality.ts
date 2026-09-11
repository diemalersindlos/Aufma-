export type PdfRenderMetrics = {
  cssWidth: number;
  cssHeight: number;
  outputScale: number;
  bitmapWidth: number;
  bitmapHeight: number;
};

export function calculatePdfRenderMetrics({
  baseWidth,
  baseHeight,
  zoom,
  devicePixelRatio,
  compact,
}: {
  baseWidth: number;
  baseHeight: number;
  zoom: number;
  devicePixelRatio: number;
  compact: boolean;
}): PdfRenderMetrics {
  const safeWidth = Math.max(1, baseWidth);
  const safeHeight = Math.max(1, baseHeight);
  const safeZoom = Math.min(4, Math.max(.35, zoom));
  const cssWidth = safeWidth * safeZoom;
  const cssHeight = safeHeight * safeZoom;
  const desiredScale = Math.min(3, Math.max(1, devicePixelRatio || 1));
  const maxPixels = compact ? 20_000_000 : 42_000_000;
  const maxSide = compact ? 6_144 : 8_192;
  const areaScale = Math.sqrt(maxPixels / Math.max(1, cssWidth * cssHeight));
  const sideScale = Math.min(maxSide / cssWidth, maxSide / cssHeight);
  const outputScale = Math.max(.5, Math.min(desiredScale, areaScale, sideScale));

  return {
    cssWidth,
    cssHeight,
    outputScale,
    bitmapWidth: Math.max(1, Math.floor(cssWidth * outputScale)),
    bitmapHeight: Math.max(1, Math.floor(cssHeight * outputScale)),
  };
}
