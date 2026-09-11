"use client";

import { BookOpen, Check, ChevronDown, HelpCircle, Printer, Search, ShieldCheck, Smartphone, X } from "lucide-react";
import { useMemo, useState } from "react";
import { USER_MANUAL_UPDATED, USER_MANUAL_VERSION, userManualSections } from "@/lib/user-manual";

export default function UserManual({ mode, onClose }: { mode: "desktop" | "mobile"; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<"Alle" | "PC" | "Mobil">(mode === "mobile" ? "Mobil" : "Alle");
  const [openId, setOpenId] = useState(mode === "mobile" ? "quickstart" : "quickstart");
  const sections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-DE");
    return userManualSections.filter((section) => {
      const platformMatches = platform === "Alle" || section.platform === "Alle" || section.platform === platform;
      const text = [section.title, section.summary, ...section.steps, ...(section.tips ?? []), ...section.keywords].join(" ").toLocaleLowerCase("de-DE");
      return platformMatches && (!needle || text.includes(needle));
    });
  }, [platform, query]);

  function printManual() {
    document.body.dataset.printMode = "user-manual";
    const cleanup = () => { delete document.body.dataset.printMode; };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 5000);
  }

  return <section className={`user-manual ${mode}`} aria-labelledby="user-manual-title">
    <header className="user-manual-head">
      <span><BookOpen size={23} /></span>
      <div><h2 id="user-manual-title">Benutzerhandbuch</h2><p>MalerAufmaß Pro · Programm und App</p></div>
      <em>Stand V{USER_MANUAL_VERSION} · {USER_MANUAL_UPDATED}</em>
      <button onClick={onClose} aria-label="Benutzerhandbuch schließen"><X size={20} /></button>
    </header>
    <div className="user-manual-toolbar">
      <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hilfe durchsuchen, z. B. Maßstab, Laser oder Excel" /></label>
      <div role="group" aria-label="Handbuch nach Plattform filtern">{(["Alle", "PC", "Mobil"] as const).map((item) => <button key={item} className={platform === item ? "active" : ""} onClick={() => setPlatform(item)}>{item === "PC" ? <ShieldCheck size={14} /> : item === "Mobil" ? <Smartphone size={14} /> : <HelpCircle size={14} />}{item}</button>)}</div>
      <button className="manual-print" onClick={printManual}><Printer size={15} /> Drucken / PDF</button>
    </div>
    <div className="user-manual-body">
      <aside><strong>INHALT</strong>{sections.map((section) => <button key={section.id} className={openId === section.id ? "active" : ""} onClick={() => setOpenId(section.id)}><span>{section.title}</span><small>{section.platform}</small></button>)}</aside>
      <main>
        {sections.length ? sections.map((section) => <article key={section.id} className={openId === section.id || query ? "open" : ""}>
          <button className="manual-article-head" onClick={() => setOpenId(openId === section.id ? "" : section.id)} aria-expanded={openId === section.id || Boolean(query)}><span><strong>{section.title}</strong><small>{section.summary}</small></span><em>{section.platform}</em><ChevronDown size={17} /></button>
          <div className="manual-article-content"><ol>{section.steps.map((step) => <li key={step}><b><Check size={13} /></b><span>{step}</span></li>)}</ol>{section.tips?.map((tip) => <p key={tip}><HelpCircle size={15} /><span><strong>Wichtig:</strong> {tip}</span></p>)}</div>
        </article>) : <div className="manual-empty"><Search size={25} /><strong>Keine passende Hilfe gefunden</strong><span>Anderen Suchbegriff verwenden oder Filter auf „Alle“ stellen.</span></div>}
      </main>
    </div>
    <footer><span><BookOpen size={15} /> Das Handbuch wird mit jeder neuen Programmversion gemeinsam aktualisiert.</span><button onClick={onClose}>Schließen</button></footer>
  </section>;
}
