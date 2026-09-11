import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import {
  measurementMultiplier,
  openingCalculation,
  polygonCentroid,
  roomAreaMeters,
  roomHeightMeters,
  roomPerimeterMeters,
  type LineItem,
  type Measurement,
  type ProjectMeta,
} from "@/lib/measurements";

export type AuditPdfInput = {
  meta: ProjectMeta;
  fileName: string;
  pageCount: number;
  selectedPages: number[];
  rows: LineItem[];
  measurements: Measurement[];
  scales: Record<number, number>;
  status?: "draft" | "completed";
  sourcePdfBytes?: Uint8Array | null;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 38;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—−]/g, "-")
    .replace(/×/g, "x")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function format(value: number, digits = 2) {
  return Number.isFinite(value)
    ? value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0,00";
}

function hexChannels(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "8E1E6E";
  return [0, 2, 4].map((offset) => Number.parseInt(safe.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function contrastIsLight(hex: string) {
  const [red, green, blue] = hexChannels(hex).map((channel) => channel * 255);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 154;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 5) {
  const source = cleanText(text).trim() || "-";
  const words = source.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}...`;
  }
  return lines;
}

function drawTopText(page: PDFPage, text: string, x: number, top: number, options: { font: PDFFont; size: number; color: RGB; maxWidth?: number }) {
  page.drawText(cleanText(text), {
    x,
    y: page.getHeight() - top - options.size,
    size: options.size,
    font: options.font,
    color: options.color,
    maxWidth: options.maxWidth,
  });
}

function drawTopRect(page: PDFPage, x: number, top: number, width: number, height: number, options: { color?: RGB; borderColor?: RGB; borderWidth?: number; opacity?: number }) {
  page.drawRectangle({
    x,
    y: page.getHeight() - top - height,
    width,
    height,
    color: options.color,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
    opacity: options.opacity,
  });
}

function sourceLabel(measurement: Measurement | undefined) {
  if (!measurement) return { source: "Keine Zuordnung", status: "PRÜFEN" };
  if (measurement.areaSource === "pdf-nrf") return {
    source: "PDF-Raumstempel (NRF)",
    status: measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain"
      ? "PDF-WERT | KONTUR FEHLT"
      : "PDF-WERT",
  };
  if (measurement.areaSource === "pdf-dimensions") return { source: "PDF-Maßketten + Kontur", status: "KONTUR PRÜFEN" };
  if (measurement.areaSource === "pdf-scale") return { source: "Planmaßstab + Kontur", status: "KONTUR PRÜFEN" };
  if (measurement.areaSource === "insta360-reference") return { source: "Insta360 + Kontrollmaß", status: "MASSE PRÜFEN" };
  if (measurement.areaSource === "laser-reference") return { source: measurement.proCapture?.label || "Laser-Aufmaß", status: "KONTROLLMASS PRÜFEN" };
  if (measurement.areaSource === "special-geometry") return { source: measurement.proCapture?.label || "Sondergeometrie", status: "EINGABEN PRÜFEN" };
  if (measurement.areaSource === "freehand-sketch") return { source: measurement.proCapture?.label || "Freihandskizze", status: "SKIZZE PRÜFEN" };
  if (measurement.source === "auto") return { source: "Automatische Geometrie", status: "KONTUR PRÜFEN" };
  return { source: "Manuelle Messung", status: "EINGABE PRÜFEN" };
}

export async function buildAuditPdf(input: AuditPdfInput) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const colors = {
    plum: rgb(.557, .118, .431),
    dark: rgb(.15, .11, .145),
    orange: rgb(.851, .435, .224),
    muted: rgb(.45, .41, .45),
    line: rgb(.88, .85, .87),
    pale: rgb(.973, .929, .961),
    white: rgb(1, 1, 1),
    green: rgb(.047, .608, .439),
    amber: rgb(.824, .475, .094),
    red: rgb(.72, .18, .18),
    soft: rgb(.985, .98, .984),
  };

  let sourceDocument: Awaited<ReturnType<typeof PDFDocument.load>> | null = null;
  if (input.sourcePdfBytes?.byteLength) {
    try {
      sourceDocument = await PDFDocument.load(input.sourcePdfBytes, { ignoreEncryption: false });
    } catch {
      sourceDocument = null;
    }
  }
  const validPlanPages = sourceDocument
    ? [...new Set(input.selectedPages)].filter((page) => page >= 1 && page <= sourceDocument!.getPageCount()).sort((left, right) => left - right)
    : [];

  document.setTitle(cleanText(`${input.meta.title} - Prüfbares Aufmaß`));
  document.setAuthor("Die Maler sind los - Malermeisterbetrieb Marcus Schwan");
  document.setSubject("Prüf- und Rechennachweis nach Projekteinstellung / VOB");
  document.setCreator("MalerAufmaß Pro");
  document.setProducer("MalerAufmaß Pro");
  document.setCreationDate(new Date());
  document.setModificationDate(new Date());

  let page!: PDFPage;
  let cursor = 0;
  const reportPages: PDFPage[] = [];

  const addReportPage = (subtitle = "Prüf- und Rechennachweis") => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    reportPages.push(page);
    drawTopRect(page, 0, 0, PAGE_WIDTH, 56, { color: colors.dark });
    drawTopRect(page, 0, 53, PAGE_WIDTH, 3, { color: colors.orange });
    drawTopText(page, "DIE MALER SIND LOS", MARGIN, 13, { font: bold, size: 15, color: colors.white });
    drawTopText(page, "MalerAufmaß Pro", MARGIN, 33, { font: regular, size: 8, color: colors.white });
    drawTopText(page, subtitle, PAGE_WIDTH - MARGIN - 260, 16, { font: bold, size: 10, color: colors.white, maxWidth: 260 });
    drawTopText(page, `Projekt: ${input.meta.title}`, PAGE_WIDTH - MARGIN - 260, 34, { font: regular, size: 7.5, color: colors.white, maxWidth: 260 });
    cursor = 76;
    return page;
  };

  const ensureSpace = (height: number, subtitle?: string) => {
    if (cursor + height <= BOTTOM_LIMIT) return;
    addReportPage(subtitle);
  };

  const sectionTitle = (title: string) => {
    ensureSpace(28, title);
    drawTopRect(page, MARGIN, cursor, CONTENT_WIDTH, 21, { color: colors.pale });
    drawTopRect(page, MARGIN, cursor, 4, 21, { color: colors.orange });
    drawTopText(page, title.toUpperCase(), MARGIN + 12, cursor + 5, { font: bold, size: 8.5, color: colors.plum });
    cursor += 28;
  };

  addReportPage();
  drawTopText(page, "Prüfbares Aufmaß", MARGIN, cursor, { font: bold, size: 21, color: colors.dark });
  drawTopText(page, input.status === "completed" ? "FERTIGGESTELLT UND GESPEICHERT" : "ENTWURF - vor Abrechnung prüfen", PAGE_WIDTH - MARGIN - 210, cursor + 3, {
    font: bold,
    size: 9,
    color: input.status === "completed" ? colors.green : colors.amber,
    maxWidth: 210,
  });
  cursor += 34;

  const metaRows = [
    ["Kunde / Auftraggeber", input.meta.customer || "-", "LV / Referenz", input.meta.reference || "-"],
    ["Bauvorhaben", input.meta.address || "-", "Bearbeiter", input.meta.estimator || "-"],
    ["Grundriss", input.fileName || "-", "Ausgewertete Seiten", input.selectedPages.join(", ") || "-"],
    ["Berechnungsgrundlage", input.meta.standard, "Plananlagen im Bericht", validPlanPages.length ? String(validPlanPages.length) : "keine"],
  ];
  metaRows.forEach((row, index) => {
    const top = cursor + index * 19;
    if (index % 2 === 0) drawTopRect(page, MARGIN, top, CONTENT_WIDTH, 19, { color: colors.soft });
    drawTopText(page, row[0], MARGIN + 8, top + 5, { font: bold, size: 7, color: colors.muted, maxWidth: 105 });
    drawTopText(page, row[1], MARGIN + 112, top + 4, { font: regular, size: 8, color: colors.dark, maxWidth: 270 });
    drawTopText(page, row[2], MARGIN + 394, top + 5, { font: bold, size: 7, color: colors.muted, maxWidth: 105 });
    drawTopText(page, row[3], MARGIN + 500, top + 4, { font: regular, size: 8, color: colors.dark, maxWidth: 250 });
  });
  cursor += 86;

  const totals = input.rows.reduce<Record<string, number>>((result, row) => {
    result[row.unit] = (result[row.unit] ?? 0) + row.result;
    return result;
  }, {});
  const deductionTotal = input.rows.filter((row) => row.unit === "m²").reduce((sum, row) => sum + row.deduction, 0);
  const reviewCount = input.rows.filter((row) => sourceLabel(input.measurements.find((item) => item.id === row.measurementId)).status !== "PDF-WERT").length;
  const cards = [
    ["Flächen netto", `${format(totals["m²"] ?? 0)} m²`, colors.green],
    ["Längen netto", `${format(totals.m ?? 0)} m`, colors.plum],
    ["VOB-Abzüge", `${format(deductionTotal)} m²`, colors.orange],
    ["Zu kontrollieren", `${reviewCount} von ${input.rows.length}`, reviewCount ? colors.amber : colors.green],
  ] as const;
  const cardGap = 10;
  const cardWidth = (CONTENT_WIDTH - cardGap * 3) / 4;
  cards.forEach(([label, value, color], index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    drawTopRect(page, x, cursor, cardWidth, 47, { color: colors.white, borderColor: colors.line, borderWidth: .7 });
    drawTopRect(page, x, cursor, 4, 47, { color });
    drawTopText(page, label, x + 12, cursor + 8, { font: regular, size: 7, color: colors.muted, maxWidth: cardWidth - 18 });
    drawTopText(page, value, x + 12, cursor + 23, { font: bold, size: 13, color, maxWidth: cardWidth - 18 });
  });
  cursor += 59;

  drawTopRect(page, MARGIN, cursor, CONTENT_WIDTH, 42, { color: rgb(1, .974, .91), borderColor: rgb(.92, .79, .54), borderWidth: .7 });
  drawTopText(page, "Prüfhinweis", MARGIN + 10, cursor + 7, { font: bold, size: 8, color: colors.amber });
  const ruleConfirmation = input.meta.vobRuleConfirmed
    ? `Projektregel fachlich bestätigt${input.meta.vobRuleConfirmedBy ? ` durch ${input.meta.vobRuleConfirmedBy}` : ""}${input.meta.vobRuleConfirmedAt ? ` am ${new Date(input.meta.vobRuleConfirmedAt).toLocaleDateString("de-DE")}` : ""}.`
    : "VOB-/Vertragsregel NICHT fachlich bestätigt – keine ungeprüfte Abrechnungsfreigabe.";
  const note = `Kennfarbe, PDF-Seite, Raumbezeichnung, Herkunft und Rechenansatz abgleichen. Öffnungen bis einschließlich ${format(input.meta.deductionThreshold)} m² werden gemäß Projekteinstellung behandelt. ${ruleConfirmation} Vertrag, Leistungsverzeichnis und vereinbarte ATV-Ausgabe bleiben maßgeblich.`;
  const noteLines = wrapText(note, regular, 7.3, CONTENT_WIDTH - 20, 3);
  noteLines.forEach((line, index) => drawTopText(page, line, MARGIN + 10, cursor + 19 + index * 9, { font: regular, size: 7.3, color: colors.dark }));
  cursor += 52;

  sectionTitle("Einzelpositionen und Rechenprüfung");
  const columns = [
    { label: "Pos.", width: 34 },
    { label: "Seite", width: 36 },
    { label: "Raum / Bereich", width: 115 },
    { label: "Leistung", width: 130 },
    { label: "Rechenansatz", width: 210 },
    { label: "Abzug", width: 70 },
    { label: "Ergebnis", width: 78 },
    { label: "Prüfstatus", width: 85 },
  ];

  const drawTableHeader = () => {
    ensureSpace(26, "Rechenprüfung - Fortsetzung");
    let x = MARGIN;
    columns.forEach((column) => {
      drawTopRect(page, x, cursor, column.width, 24, { color: colors.plum, borderColor: colors.white, borderWidth: .35 });
      drawTopText(page, column.label, x + 4, cursor + 7, { font: bold, size: 7, color: colors.white, maxWidth: column.width - 8 });
      x += column.width;
    });
    cursor += 24;
  };
  drawTableHeader();

  input.rows.forEach((line, index) => {
    const measurement = input.measurements.find((item) => item.id === line.measurementId);
    const audit = sourceLabel(measurement);
    const roomLines = wrapText(line.room, regular, 6.8, 97, 3);
    const serviceLines = wrapText(line.description, regular, 6.8, 122, 3);
    const formulaLines = wrapText(line.formula, regular, 6.8, 202, 4);
    const statusLines = [audit.status, ...wrapText(audit.source, regular, 5.8, 77, 2)];
    const lineCount = Math.max(roomLines.length, serviceLines.length, formulaLines.length, statusLines.length);
    const rowHeight = Math.max(27, 8 + lineCount * 8);
    if (cursor + rowHeight > BOTTOM_LIMIT) {
      addReportPage("Rechenprüfung - Fortsetzung");
      drawTableHeader();
    }
    let x = MARGIN;
    const background = index % 2 ? colors.soft : colors.white;
    columns.forEach((column) => {
      drawTopRect(page, x, cursor, column.width, rowHeight, { color: background, borderColor: colors.line, borderWidth: .45 });
      x += column.width;
    });
    const keyColorHex = measurement?.color ?? "#8E1E6E";
    const [red, green, blue] = hexChannels(keyColorHex);
    const keyColor = rgb(red, green, blue);
    drawTopRect(page, MARGIN + 3, cursor + 4, 28, rowHeight - 8, { color: keyColor });
    drawTopText(page, String(index + 1).padStart(3, "0"), MARGIN + 7, cursor + rowHeight / 2 - 4, { font: bold, size: 7, color: contrastIsLight(keyColorHex) ? colors.dark : colors.white, maxWidth: 21 });
    drawTopText(page, String(measurement?.page ?? "-"), MARGIN + 42, cursor + 8, { font: bold, size: 7, color: colors.dark, maxWidth: 27 });
    const drawLines = (lines: string[], cellX: number, width: number, font: PDFFont = regular, size = 6.8, color: RGB = colors.dark) => {
      lines.forEach((text, lineIndex) => drawTopText(page, text, cellX + 5, cursor + 6 + lineIndex * 8, { font, size, color, maxWidth: width - 10 }));
    };
    drawLines(roomLines, MARGIN + 70, 115);
    drawLines(serviceLines, MARGIN + 185, 130);
    drawLines(formulaLines, MARGIN + 315, 210);
    drawLines([line.deduction ? `-${format(line.deduction)} ${line.unit}` : "-"], MARGIN + 525, 70, regular, 6.8, line.deduction ? colors.red : colors.muted);
    drawLines([`${format(line.result)} ${line.unit}`], MARGIN + 595, 78, bold, 7.2, colors.green);
    drawLines(statusLines, MARGIN + 673, 85, statusLines.length ? bold : regular, 5.8, audit.status === "PDF-WERT" ? colors.green : colors.amber);
    cursor += rowHeight;
  });

  cursor += 10;
  sectionTitle("Raumgrundlagen");
  const rooms = input.measurements.filter((measurement) => measurement.visible && measurement.kind === "room" && (input.scales[measurement.page] || (measurement.areaOverride !== undefined && measurement.perimeterOverride !== undefined)));
  if (!rooms.length) {
    drawTopText(page, "Keine Raumgrundlagen vorhanden.", MARGIN, cursor, { font: regular, size: 8, color: colors.muted });
    cursor += 20;
  } else {
    rooms.forEach((room, index) => {
      ensureSpace(28, "Raumgrundlagen - Fortsetzung");
      const [red, green, blue] = hexChannels(room.color);
      const top = cursor;
      drawTopRect(page, MARGIN, top, CONTENT_WIDTH, 24, { color: index % 2 ? colors.soft : colors.white, borderColor: colors.line, borderWidth: .45 });
      drawTopRect(page, MARGIN + 4, top + 4, 16, 16, { color: rgb(red, green, blue) });
      drawTopText(page, room.name, MARGIN + 27, top + 6, { font: bold, size: 7.5, color: colors.dark, maxWidth: 210 });
      const scale = input.scales[room.page];
      const evidence = room.areaSource === "insta360-reference"
        ? `360°-Nachweis ${room.captureSource?.fileName || "Insta360"}`
        : room.areaSource === "laser-reference"
          ? `${room.proCapture?.label || "Laser-Aufmaß"} - ${room.proCapture?.formula || "Kontrollmaße"}`
        : room.areaSource === "freehand-sketch"
          ? `${room.proCapture?.label || "Freihandskizze"} - ${room.proCapture?.formula || "Kontrollmaß"} - Erkennung ${Math.round((room.proCapture?.confidence ?? room.confidence ?? 0) * 100)} %`
        : `Seite ${room.page}`;
      const geometryMissing = room.geometryStatus === "missing" || room.geometryStatus === "uncertain";
      const perimeterBasis = geometryMissing ? "Umfang NICHT BESTIMMT" : `Umfang ${format(roomPerimeterMeters(room, scale))} m`;
      const basis = `${evidence} - Grundfläche ${format(roomAreaMeters(room, scale))} m² - ${perimeterBasis} - Höhe ${format(roomHeightMeters(room))} m - Menge/Faktor ${format(measurementMultiplier(room), 2)}`;
      drawTopText(page, basis, MARGIN + 245, top + 6, { font: regular, size: 7.2, color: colors.dark, maxWidth: CONTENT_WIDTH - 255 });
      cursor += 24;
    });
  }

  cursor += 10;
  sectionTitle("VOB-Abzüge und Übermessungen");
  const openings = rooms.flatMap((room) => (room.openings ?? []).map((opening) => ({ room, opening, result: openingCalculation(opening, input.meta.deductionThreshold) })));
  if (!openings.length) {
    drawTopRect(page, MARGIN, cursor, CONTENT_WIDTH, 28, { color: rgb(1, .974, .91), borderColor: rgb(.92, .79, .54), borderWidth: .6 });
    drawTopText(page, "Keine Fenster- oder Türöffnungen erfasst. Die Wandflächen enthalten daher keine Öffnungsabzüge.", MARGIN + 8, cursor + 9, { font: regular, size: 7.5, color: colors.amber, maxWidth: CONTENT_WIDTH - 16 });
    cursor += 36;
  } else {
    openings.forEach(({ room, opening, result }, index) => {
      ensureSpace(26, "VOB-Abzüge - Fortsetzung");
      drawTopRect(page, MARGIN, cursor, CONTENT_WIDTH, 23, { color: index % 2 ? colors.soft : colors.white, borderColor: colors.line, borderWidth: .45 });
      drawTopText(page, `${room.name} - ${opening.name}`, MARGIN + 7, cursor + 6, { font: bold, size: 7.2, color: colors.dark, maxWidth: 220 });
      drawTopText(page, `${format(opening.width)} x ${format(opening.height)} m x ${format(opening.quantity, 0)} = ${format(result.gross)} m²${result.revealDepth > 0 ? ` | Laibung ${result.revealSides}-seitig, T ${format(result.revealDepth)} m = ${format(result.revealGross)} m²` : ""}`, MARGIN + 235, cursor + 6, { font: regular, size: 7.2, color: colors.dark, maxWidth: 265 });
      drawTopText(page, result.isDoor ? result.overmeasured ? `TÜR ÜBERMESSEN | Zarge, keine Laibung` : `TÜR ABZUG -${format(result.deduct)} m² | Zarge, keine Laibung` : result.overmeasured ? `ÜBERMESSEN | Laibung nicht zusätzlich` : result.deduct ? `ABZUG -${format(result.deduct)} m²${result.revealDepth > 0 ? ` | Laibung +${format(result.revealResult)} m²` : ""}` : "KEIN ABZUG", MARGIN + 515, cursor + 6, { font: bold, size: 7.2, color: result.overmeasured ? colors.green : result.deduct ? colors.red : colors.muted, maxWidth: 235 });
      cursor += 23;
    });
  }

  ensureSpace(92, "Prüfung und Freigabe");
  cursor += 10;
  sectionTitle("Prüfung und Freigabe");
  drawTopText(page, "Prüfung durch Architekt / Bauleitung / Auftraggeber", MARGIN, cursor, { font: bold, size: 8, color: colors.dark });
  cursor += 18;
  [["Geprüft am", 0], ["Name / Funktion", 255], ["Unterschrift / Freigabe", 510]].forEach(([label, offset]) => {
    const x = MARGIN + Number(offset);
    drawTopText(page, String(label), x, cursor, { font: regular, size: 7, color: colors.muted });
    page.drawLine({ start: { x, y: PAGE_HEIGHT - cursor - 27 }, end: { x: x + 225, y: PAGE_HEIGHT - cursor - 27 }, thickness: .7, color: colors.line });
  });
  cursor += 42;

  const reportPageCount = reportPages.length;
  if (sourceDocument && validPlanPages.length) {
    const copied = await document.copyPages(sourceDocument, validPlanPages.map((pageNumber) => pageNumber - 1));
    copied.forEach((planPage, pageIndex) => {
      document.addPage(planPage);
      const originalPageNumber = validPlanPages[pageIndex];
      const pageWidth = planPage.getWidth();
      const pageHeight = planPage.getHeight();
      const targetWidth = Math.min(1180, Math.max(760, pageWidth * 1.55));
      const coordinateScale = pageWidth / targetWidth;
      const pageMeasurements = input.measurements.filter((measurement) => measurement.visible && measurement.page === originalPageNumber);
      pageMeasurements.forEach((measurement, measurementIndex) => {
        const [red, green, blue] = hexChannels(measurement.color);
        const color = rgb(red, green, blue);
        const points = measurement.points.map((point) => ({ x: point.x * coordinateScale, y: pageHeight - point.y * coordinateScale }));
        if (measurement.kind === "count" && points[0]) {
          planPage.drawCircle({ x: points[0].x, y: points[0].y, size: 7, color, opacity: .9, borderColor: colors.white, borderWidth: .7 });
        } else if (points.length >= 2) {
          const close = measurement.kind === "room" || measurement.kind === "area";
          const segments = close ? [...points, points[0]] : points;
          for (let index = 1; index < segments.length; index += 1) {
            planPage.drawLine({ start: segments[index - 1], end: segments[index], thickness: 2, color, opacity: .9 });
          }
        }
        if (measurement.points.length) {
          const centerPoint = polygonCentroid(measurement.points);
          const center = { x: centerPoint.x * coordinateScale, y: pageHeight - centerPoint.y * coordinateScale };
          const label = cleanText(`${measurementIndex + 1}. ${measurement.name}`);
          const labelWidth = Math.min(155, Math.max(48, bold.widthOfTextAtSize(label, 6.5) + 10));
          planPage.drawRectangle({ x: Math.max(2, center.x - labelWidth / 2), y: Math.max(2, center.y - 7), width: labelWidth, height: 15, color, opacity: .92, borderColor: colors.white, borderWidth: .5 });
          planPage.drawText(label, { x: Math.max(5, center.x - labelWidth / 2 + 5), y: Math.max(6, center.y - 2), size: 6.5, font: bold, color: contrastIsLight(measurement.color) ? colors.dark : colors.white, maxWidth: labelWidth - 10 });
        }
      });
      planPage.drawRectangle({ x: 8, y: 8, width: Math.min(330, pageWidth - 16), height: 20, color: colors.white, opacity: .9, borderColor: colors.plum, borderWidth: .7 });
      planPage.drawText(cleanText(`PLANANLAGE - PDF-Seite ${originalPageNumber} - Kennfarben entsprechen Prüfbericht und Excel`), { x: 14, y: 15, size: 6.6, font: bold, color: colors.plum, maxWidth: Math.min(318, pageWidth - 28) });
    });
  }

  const allPages = document.getPages();
  allPages.forEach((currentPage, index) => {
    const width = currentPage.getWidth();
    currentPage.drawLine({ start: { x: 22, y: 22 }, end: { x: width - 22, y: 22 }, thickness: .45, color: colors.line });
    currentPage.drawText(cleanText(`MalerAufmaß Pro - ${input.meta.id} - Stand ${new Date(input.meta.updatedAt).toLocaleDateString("de-DE")}`), { x: 24, y: 10, size: 5.8, font: regular, color: colors.muted, maxWidth: Math.max(100, width - 150) });
    const pageLabel = `Seite ${index + 1} von ${allPages.length}${index >= reportPageCount ? " - Plananlage" : ""}`;
    currentPage.drawText(cleanText(pageLabel), { x: width - 112, y: 10, size: 5.8, font: regular, color: colors.muted, maxWidth: 90 });
  });

  return document.save();
}
