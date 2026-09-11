"use client";

import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  LockKeyhole,
  Pentagon,
  Ruler,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { formatNumber, type LineItem, type Measurement, type ProjectMeta } from "@/lib/measurements";
import EditableNumberInput from "@/components/editable-number-input";
import {
  calculateSpecialShape,
  evaluateQualityGate,
  type LaserRoomInput,
  type ProjectReviewState,
  type ReviewDecision,
  type SpecialShape,
  type SpecialShapeInput,
} from "@/lib/pro-workflow";
import { useMemo, useState } from "react";

export type ProfessionalTab = "laser" | "special" | "review" | "exchange";

const specialCategories = [
  "Dachschräge",
  "Giebel",
  "Laibung",
  "Nische",
  "Pfeiler / Stütze",
  "Fassade",
  "Holzfläche",
  "Metallfläche",
  "Sonderfläche",
];

const shapeLabels: Record<SpecialShape, string> = {
  rectangle: "Rechteck",
  triangle: "Dreieck",
  trapezoid: "Trapez",
  gable: "Giebeldreieck",
  circle: "Kreis",
  semicircle: "Halbkreis",
};

function CheckOption({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={value ? "checked" : ""}>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      <span><Check size={14} /></span>{label}
    </label>
  );
}

export default function ProfessionalSuite({
  initialTab,
  rows,
  measurements,
  scales,
  meta,
  review,
  page,
  onAddLaser,
  onAddSpecial,
  onReviewChange,
  onDownloadReview,
  onDownloadReb,
  onDownloadGaeb,
  onDownloadIntegration,
  onClose,
}: {
  initialTab: ProfessionalTab;
  rows: LineItem[];
  measurements: Measurement[];
  scales: Record<number, number>;
  meta: ProjectMeta;
  review: ProjectReviewState;
  page: number;
  onAddLaser: (input: LaserRoomInput) => void;
  onAddSpecial: (input: SpecialShapeInput) => void;
  onReviewChange: (review: ProjectReviewState) => void;
  onDownloadReview: () => void;
  onDownloadReb: () => void;
  onDownloadGaeb: () => void;
  onDownloadIntegration: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ProfessionalTab>(initialTab);
  const [laser, setLaser] = useState<LaserRoomInput>({
    name: "Raum Laser 01",
    device: "Leica DISTO / Laser-Kontrollmaß",
    length: 5,
    width: 4,
    height: 2.5,
    quantity: 1,
    factor: 1,
    includeWalls: true,
    includeCeiling: true,
    includeFloor: false,
    includeSkirting: false,
  });
  const [special, setSpecial] = useState<SpecialShapeInput>({
    name: "Dachschräge 01",
    category: "Dachschräge",
    shape: "rectangle",
    a: 4,
    b: 2.5,
    height: 2.5,
    radius: 1,
    quantity: 1,
    factor: 1,
  });
  const specialResult = useMemo(() => calculateSpecialShape(special), [special]);
  const laserValid = [laser.length, laser.width, laser.height, laser.quantity, laser.factor].every((value) => Number.isFinite(value) && value > 0)
    && laser.name.trim();
  const specialValid = specialResult.area > 0 && special.name.trim() && special.quantity > 0 && special.factor > 0;
  const reviewSummary = rows.reduce<Record<ReviewDecision, number>>((result, row) => {
    result[review.entries[row.id]?.decision ?? "open"] += 1;
    return result;
  }, { open: 0, approved: 0, correction: 0 });
  const quality = useMemo(() => evaluateQualityGate(meta, rows, measurements, scales, review), [meta, measurements, review, rows, scales]);
  const isReleased = review.workflowStatus === "released";

  function updateReviewHeader(patch: Partial<Pick<ProjectReviewState, "reviewer" | "office" | "signatureName">>) {
    onReviewChange({ ...review, ...patch, workflowStatus: isReleased ? "in-review" : review.workflowStatus, releasedAt: isReleased ? "" : review.releasedAt, releaseCode: isReleased ? "" : review.releaseCode, updatedAt: new Date().toISOString() });
  }

  function releaseProject() {
    if (!quality.releasable) return;
    const now = new Date();
    const compactDate = now.toISOString().slice(0, 10).replaceAll("-", "");
    const checksum = rows.reduce((sum, row) => sum + Math.round(row.result * 100), 0).toString(36).toUpperCase();
    onReviewChange({
      ...review,
      workflowStatus: "released",
      revision: Math.max(1, review.revision ?? 1),
      releasedAt: now.toISOString(),
      releaseCode: `MA-${compactDate}-${checksum}`,
      signatureName: review.signatureName?.trim() || review.reviewer.trim(),
      updatedAt: now.toISOString(),
    });
  }

  function reopenProject() {
    onReviewChange({ ...review, workflowStatus: "in-review", revision: (review.revision ?? 1) + 1, releasedAt: "", releaseCode: "", updatedAt: new Date().toISOString() });
  }

  function updateReviewEntry(lineId: string, patch: { decision?: ReviewDecision; comment?: string }) {
    const previous = review.entries[lineId] ?? {
      lineId,
      decision: "open" as const,
      comment: "",
      reviewer: review.reviewer,
      reviewedAt: "",
    };
    const nextDecision = patch.decision ?? previous.decision;
    const now = new Date().toISOString();
    onReviewChange({
      ...review,
      workflowStatus: isReleased ? "in-review" : review.workflowStatus,
      releasedAt: isReleased ? "" : review.releasedAt,
      releaseCode: isReleased ? "" : review.releaseCode,
      updatedAt: now,
      entries: {
        ...review.entries,
        [lineId]: {
          ...previous,
          ...patch,
          decision: nextDecision,
          reviewer: review.reviewer,
          reviewedAt: nextDecision === "open" && !(patch.comment ?? previous.comment).trim() ? "" : now,
        },
      },
    });
  }

  function printReview() {
    document.body.dataset.printMode = "professional-review";
    const cleanup = () => { delete document.body.dataset.printMode; };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 5000);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal professional-modal" role="dialog" aria-modal="true" aria-labelledby="professional-title">
        <header className="modal-head">
          <div><h2 id="professional-title">Profi-Aufmaß</h2><p>Laser, Sonderflächen, Prüferportal und Datenaustausch</p></div>
          <button onClick={onClose} aria-label="Profi-Aufmaß schließen"><X size={20} /></button>
        </header>

        <nav className="professional-tabs" aria-label="Profi-Werkzeuge">
          <button className={tab === "laser" ? "active" : ""} onClick={() => setTab("laser")}><Ruler size={16} /> Laser-Aufmaß</button>
          <button className={tab === "special" ? "active" : ""} onClick={() => setTab("special")}><Pentagon size={16} /> Sonderflächen</button>
          <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><ClipboardCheck size={16} /> Prüferportal</button>
          <button className={tab === "exchange" ? "active" : ""} onClick={() => setTab("exchange")}><FileSpreadsheet size={16} /> Übergabe</button>
        </nav>

        <div className="professional-content">
          {tab === "laser" && (
            <div className="professional-grid">
              <section className="professional-form-card">
                <div className="professional-card-title"><span><Ruler size={19} /></span><div><strong>Raum mit Lasermaßen</strong><small>Kontrollwerte ohne Planmaßstab erfassen</small></div></div>
                <label className="field-label">Raumbezeichnung</label>
                <input className="text-input" value={laser.name} onChange={(event) => setLaser({ ...laser, name: event.target.value })} />
                <label className="field-label with-top">Messquelle / Gerät</label>
                <select className="text-input" value={laser.device} onChange={(event) => setLaser({ ...laser, device: event.target.value })}>
                  <option>Leica DISTO / Laser-Kontrollmaß</option>
                  <option>Bosch GLM / Laser-Kontrollmaß</option>
                  <option>Anderer Laserentfernungsmesser</option>
                  <option>Bekanntes Kontrollmaß</option>
                </select>
                <div className="field-grid three with-top">
                  <label><span className="field-label">Länge</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.01" value={laser.length} onValueChange={(value) => setLaser({ ...laser, length: value })} /><span>m</span></div></label>
                  <label><span className="field-label">Breite</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.01" value={laser.width} onValueChange={(value) => setLaser({ ...laser, width: value })} /><span>m</span></div></label>
                  <label><span className="field-label">Höhe</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.01" value={laser.height} onValueChange={(value) => setLaser({ ...laser, height: value })} /><span>m</span></div></label>
                </div>
                <label className="field-label with-top">Zu berechnende Mengen</label>
                <div className="check-grid">
                  <CheckOption label="Wände" value={laser.includeWalls} onChange={(value) => setLaser({ ...laser, includeWalls: value })} />
                  <CheckOption label="Decke" value={laser.includeCeiling} onChange={(value) => setLaser({ ...laser, includeCeiling: value })} />
                  <CheckOption label="Boden" value={laser.includeFloor} onChange={(value) => setLaser({ ...laser, includeFloor: value })} />
                  <CheckOption label="Fußleisten" value={laser.includeSkirting} onChange={(value) => setLaser({ ...laser, includeSkirting: value })} />
                </div>
                <div className="field-grid two with-top">
                  <label><span className="field-label">Anzahl</span><EditableNumberInput className="text-input" min="1" step="1" value={laser.quantity} onValueChange={(value) => setLaser({ ...laser, quantity: value })} /></label>
                  <label><span className="field-label">Faktor</span><EditableNumberInput className="text-input" min="0.01" step="0.1" value={laser.factor} onValueChange={(value) => setLaser({ ...laser, factor: value })} /></label>
                </div>
                <button className="button primary full professional-add" disabled={!laserValid} onClick={() => onAddLaser(laser)}><Check size={16} /> Raum ins Aufmaß übernehmen</button>
              </section>

              <aside className="professional-preview-card">
                <span className="professional-preview-kicker">SOFORTBERECHNUNG · SEITE {page}</span>
                <div><small>Grundfläche</small><strong>{formatNumber(laser.length * laser.width)} m²</strong><em>{formatNumber(laser.length)} × {formatNumber(laser.width)}</em></div>
                <div><small>Umfang</small><strong>{formatNumber(2 * (laser.length + laser.width))} m</strong><em>2 × (Länge + Breite)</em></div>
                <div><small>Wand brutto</small><strong>{formatNumber(2 * (laser.length + laser.width) * laser.height)} m²</strong><em>Umfang × Raumhöhe</em></div>
                <p><AlertTriangle size={15} /> Die Werte werden mit Gerät, Datum und offenem Rechenweg gespeichert. Vor Abrechnung bleibt die Kontrollmessung zu bestätigen.</p>
              </aside>
            </div>
          )}

          {tab === "special" && (
            <div className="professional-grid">
              <section className="professional-form-card">
                <div className="professional-card-title"><span><Pentagon size={19} /></span><div><strong>Maler-Sonderfläche</strong><small>Dachschrägen, Giebel, Nischen und Rundungen</small></div></div>
                <div className="field-grid two">
                  <label><span className="field-label">Bezeichnung</span><input className="text-input" value={special.name} onChange={(event) => setSpecial({ ...special, name: event.target.value })} /></label>
                  <label><span className="field-label">Flächenart</span><select className="text-input" value={special.category} onChange={(event) => setSpecial({ ...special, category: event.target.value })}>{specialCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
                </div>
                <label className="field-label with-top">Geometrie</label>
                <div className="shape-grid">
                  {(Object.keys(shapeLabels) as SpecialShape[]).map((shape) => <button key={shape} className={special.shape === shape ? "active" : ""} onClick={() => setSpecial({ ...special, shape })}>{shapeLabels[shape]}</button>)}
                </div>
                <div className="field-grid three with-top">
                  {!['circle', 'semicircle'].includes(special.shape) && <label><span className="field-label">{special.shape === "trapezoid" ? "Seite a" : "Breite / Basis"}</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={special.a} onValueChange={(value) => setSpecial({ ...special, a: value })} /><span>m</span></div></label>}
                  {['rectangle', 'trapezoid'].includes(special.shape) && <label><span className="field-label">{special.shape === "trapezoid" ? "Seite b" : "Höhe / Länge"}</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={special.b} onValueChange={(value) => setSpecial({ ...special, b: value })} /><span>m</span></div></label>}
                  {['triangle', 'trapezoid', 'gable'].includes(special.shape) && <label><span className="field-label">Senkrechte Höhe</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={special.height} onValueChange={(value) => setSpecial({ ...special, height: value })} /><span>m</span></div></label>}
                  {['circle', 'semicircle'].includes(special.shape) && <label><span className="field-label">Radius</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={special.radius} onValueChange={(value) => setSpecial({ ...special, radius: value })} /><span>m</span></div></label>}
                </div>
                <div className="field-grid two with-top">
                  <label><span className="field-label">Anzahl</span><EditableNumberInput className="text-input" min="1" step="1" value={special.quantity} onValueChange={(value) => setSpecial({ ...special, quantity: value })} /></label>
                  <label><span className="field-label">Faktor</span><EditableNumberInput className="text-input" min="0.01" step="0.1" value={special.factor} onValueChange={(value) => setSpecial({ ...special, factor: value })} /></label>
                </div>
                <button className="button primary full professional-add" disabled={!specialValid} onClick={() => onAddSpecial(special)}><Check size={16} /> Sonderfläche übernehmen</button>
              </section>
              <aside className="professional-preview-card special">
                <span className="professional-preview-kicker">{specialResult.label.toUpperCase()}</span>
                <div><small>Einzelfläche</small><strong>{formatNumber(specialResult.area)} m²</strong><em>{specialResult.formula}</em></div>
                <div><small>Gesamtfläche</small><strong>{formatNumber(specialResult.area * special.quantity * special.factor)} m²</strong><em>{special.quantity} × Faktor {formatNumber(special.factor)}</em></div>
                <p><Check size={15} /> Formel und Eingangswerte erscheinen im prüfbaren Aufmaß sowie in Excel und PDF.</p>
              </aside>
            </div>
          )}

          {tab === "review" && (
            <section className="review-portal">
              <div className="review-head">
                <div className="review-head-copy"><span><ClipboardCheck size={21} /></span><div><strong>Prüferportal für Architekt und Auftraggeber</strong><small>Freigaben und Korrekturhinweise werden projektbezogen gespeichert.</small></div></div>
                <div className="review-summary"><span><small>Offen</small><strong>{reviewSummary.open}</strong></span><span className="approved"><small>Freigegeben</small><strong>{reviewSummary.approved}</strong></span><span className="correction"><small>Korrektur</small><strong>{reviewSummary.correction}</strong></span></div>
              </div>
              <div className={`quality-gate ${isReleased ? "released" : quality.errors ? "blocked" : quality.warnings ? "attention" : "ready"}`}>
                <div className="quality-gate-title"><span>{isReleased ? <LockKeyhole size={20} /> : <ShieldCheck size={20} />}</span><div><strong>{isReleased ? "Aufmaß freigegeben und gesperrt" : quality.releasable ? "Bereit zur Freigabe" : "Prüfung vor Freigabe"}</strong><small>{isReleased ? `Revision ${review.revision ?? 1} · Prüfcode ${review.releaseCode}` : "Fehler, offene Prüfungen und unsichere KI-Werte werden automatisch gesammelt."}</small></div></div>
                <div className="quality-gate-stats"><span><small>Fehler</small><strong>{quality.errors}</strong></span><span><small>Warnungen</small><strong>{quality.warnings}</strong></span><span><small>Freigegeben</small><strong>{quality.approved}/{rows.length}</strong></span></div>
              </div>
              {!isReleased && quality.issues.length > 0 && <div className="quality-issues" role="status">
                {quality.issues.slice(0, 8).map((issue) => <div key={issue.id} className={issue.severity}><AlertTriangle size={15} /><span><strong>{issue.label}</strong><small>{issue.detail}</small></span></div>)}
                {quality.issues.length > 8 && <p>Weitere {quality.issues.length - 8} Hinweise stehen in den Aufmaßpositionen.</p>}
              </div>}
              <div className="field-grid two review-person">
                <label><span className="field-label">Prüfer/in</span><input disabled={isReleased} className="text-input" value={review.reviewer} onChange={(event) => updateReviewHeader({ reviewer: event.target.value })} placeholder="Name des Prüfers" /></label>
                <label><span className="field-label">Architekturbüro / Auftraggeber</span><input disabled={isReleased} className="text-input" value={review.office} onChange={(event) => updateReviewHeader({ office: event.target.value })} placeholder="Büro oder Firma" /></label>
                <label><span className="field-label">Freigabe / digitale Namenszeichnung</span><input disabled={isReleased} className="text-input" value={review.signatureName ?? ""} onChange={(event) => updateReviewHeader({ signatureName: event.target.value })} placeholder={review.reviewer || "Vor- und Nachname"} /></label>
              </div>
              {rows.length ? (
                <div className="review-table-wrap">
                  <table className="review-table">
                    <thead><tr><th>Pos.</th><th>Raum / Leistung</th><th>Ansatz</th><th>Menge</th><th>Entscheidung</th><th>Prüfkommentar</th></tr></thead>
                    <tbody>{rows.map((row, index) => {
                      const entry = review.entries[row.id];
                      return <tr key={row.id} className={entry?.decision ?? "open"}>
                        <td>{String(index + 1).padStart(3, "0")}</td>
                        <td><strong>{row.room}</strong><small>{row.description}</small></td>
                        <td>{row.formula}</td>
                        <td><strong>{formatNumber(row.result)}</strong> {row.unit}</td>
                        <td><select disabled={isReleased} value={entry?.decision ?? "open"} onChange={(event) => updateReviewEntry(row.id, { decision: event.target.value as ReviewDecision })}><option value="open">Offen</option><option value="approved">Freigeben</option><option value="correction">Korrektur</option></select></td>
                        <td><input disabled={isReleased} value={entry?.comment ?? ""} onChange={(event) => updateReviewEntry(row.id, { comment: event.target.value })} placeholder="Hinweis zur Position" /></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              ) : <div className="review-empty"><ClipboardCheck size={25} /><strong>Noch keine Aufmaßpositionen</strong><span>Erst Mengen erfassen, anschließend können sie geprüft und freigegeben werden.</span></div>}
              <div className="modal-actions"><button className="button secondary" disabled={!rows.length} onClick={onDownloadReview}><FileDown size={16} /> Prüfprotokoll als CSV</button><button className="button secondary" disabled={!rows.length} onClick={printReview}><ClipboardCheck size={16} /> Prüferansicht drucken</button>{isReleased ? <button className="button warning" onClick={reopenProject}><Unlock size={16} /> Neue Revision öffnen</button> : <button className="button primary" disabled={!quality.releasable} onClick={releaseProject}><LockKeyhole size={16} /> Prüfen, freigeben & sperren</button>}</div>
            </section>
          )}

          {tab === "exchange" && (
            <section className="exchange-panel">
              <div className="exchange-hero"><span><Building2 size={23} /></span><div><strong>Professionelle Datenübergabe</strong><small>Strukturierte Mengen für Architekten, AVA und die spätere Handwerker-App.</small></div></div>
              <div className="exchange-grid">
                <article><FileSpreadsheet size={21} /><strong>REB-Prüfansätze</strong><p>Einzelansätze mit Formel, Brutto, Abzug, Netto, Quelle und Projekt-ID.</p><button className="button primary" disabled={!rows.length} onClick={onDownloadReb}><FileDown size={15} /> CSV herunterladen</button></article>
                <article><ClipboardCheck size={21} /><strong>Prüfprotokoll</strong><p>Freigaben und Beanstandungen je Position für Architekt oder Auftraggeber.</p><button className="button secondary" disabled={!rows.length} onClick={onDownloadReview}><FileDown size={15} /> Protokoll herunterladen</button></article>
                <article><Building2 size={21} /><strong>GAEB X31 Vorbereitung</strong><p>XML-Mengenübergabe mit stabilen Projekt-, Positions- und Aufmaß-IDs für die AVA-Prüfung.</p><button className="button secondary" disabled={!rows.length} onClick={onDownloadGaeb}><FileDown size={15} /> X31-XML vorbereiten</button></article>
                <article><FileDown size={21} /><strong>API-Übergabepaket</strong><p>Maschinenlesbares JSON für die spätere Verbindung zu Marcus&apos; Handwerker-App.</p><button className="button secondary" disabled={!rows.length} onClick={onDownloadIntegration}><FileDown size={15} /> Übergabepaket laden</button></article>
                <article className="exchange-status"><Check size={21} /><strong>Schnittstelle vorbereitet</strong><p>Projekt-, Aufmaß- und Positions-IDs bleiben stabil für die spätere Verbindung mit Marcus&apos; Handwerker-App.</p><span>AKTIV</span></article>
              </div>
              <div className="exchange-note"><AlertTriangle size={17} /><div><strong>Offene Standards mit klarer Kennzeichnung</strong><small>Die X31-Datei ist eine strukturierte GAEB-3.3-Vorbereitung und muss vor dem produktiven AVA-Austausch gegen das offizielle Schema geprüft werden. IFC/DWG-Import und Apple RoomPlan bleiben native Erweiterungen; es werden keine unbestätigten Fremdformate als zertifiziert ausgegeben.</small></div></div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
