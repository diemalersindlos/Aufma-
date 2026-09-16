export type PdfTextItemLike = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export function pdfText(items: PdfTextItemLike[]) {
  return items.map((item) => item.str ?? "").join(" ");
}

/**
 * Reads a printed plan scale such as “Maßstab 1:100”. This does not identify
 * rooms or geometry; it only prepares the PDF page for manual measuring.
 */
export function extractScaleDenominator(items: PdfTextItemLike[]) {
  const text = pdfText(items);
  const match = text.match(/(?:maßstab|massstab)[^\d]{0,12}1\s*[:/]\s*(\d{1,4})/i)
    ?? text.match(/\b1\s*[:/]\s*(\d{1,4})\b/);
  const denominator = match ? Number(match[1]) : 0;
  return denominator >= 1 && denominator <= 9999 ? denominator : null;
}
