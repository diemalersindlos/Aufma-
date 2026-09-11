import type { PdfTextItemLike, PdfViewportLike } from "@/lib/pdf-plan-analysis";

type PdfTextPage = {
  getTextContent?: () => Promise<{ items: PdfTextItemLike[] }>;
};

type TextMaskContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  restore: () => void;
  rotate: (angle: number) => void;
  save: () => void;
  translate: (x: number, y: number) => void;
};

function multiplyAffine(left: number[], right: number[]) {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

/**
 * Paints selectable PDF text white before raster room detection. Otherwise
 * room names and dimensions can connect to nearby walls during dilation and
 * incorrectly reduce the measured room polygon.
 */
export function erasePdfTextItemsFromCanvas(
  items: PdfTextItemLike[],
  viewport: PdfViewportLike,
  context: TextMaskContext,
) {
  if (!viewport.transform) return;
  const viewportScale = viewport.scale ?? Math.hypot(viewport.transform[0] ?? 1, viewport.transform[1] ?? 0);

  items.forEach((item) => {
    if (!item.str?.trim() || !item.transform || item.transform.length < 6) return;
    const transform = multiplyAffine(viewport.transform!, item.transform);
    const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]) || (item.height ?? 0) * viewportScale);
    const width = Math.max(fontHeight * 0.35, (item.width ?? item.str.length * fontHeight * 0.5) * viewportScale);
    const angle = Math.atan2(transform[1], transform[0]);
    const padding = Math.max(0.8, fontHeight * 0.08);

    context.save();
    context.translate(transform[4], transform[5]);
    context.rotate(angle);
    context.fillStyle = "#ffffff";
    context.fillRect(-padding, -fontHeight - padding, width + padding * 2, fontHeight * 1.18 + padding * 2);
    context.restore();
  });
}

export async function erasePdfTextFromCanvas(
  page: PdfTextPage,
  viewport: PdfViewportLike,
  context: TextMaskContext,
) {
  if (!page.getTextContent) return;
  const textContent = await page.getTextContent();
  erasePdfTextItemsFromCanvas(textContent.items, viewport, context);
}
