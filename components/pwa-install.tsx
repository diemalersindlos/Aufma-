"use client";

import { CheckCircle2, Download, EllipsisVertical, Plus, Share2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPlatform = "ios" | "android" | "desktop";

function currentPlatform(): InstallPlatform {
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) return "ios";
  if (/android/.test(agent)) return "android";
  return "desktop";
}

function runsStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export default function PwaInstall() {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const hydrationFrame = window.requestAnimationFrame(() => {
      setPlatform(currentPlatform());
      setStandalone(runsStandalone());
      setReady(true);
    });

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => setStandalone(runsStandalone());
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setPromptEvent(null);
      setShowHelp(false);
    };

    displayMode.addEventListener?.("change", onDisplayModeChange);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) {
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setStandalone(true);
    setPromptEvent(null);
    setShowHelp(false);
  }

  if (!ready || standalone) return null;

  return (
    <>
      <button
        className="button icon-button pwa-install-button"
        onClick={() => setShowHelp(true)}
        title="Aufmaß Pro als App installieren"
        aria-label="Aufmaß Pro als App installieren"
      >
        <Smartphone size={18} />
      </button>

      {showHelp && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowHelp(false)}>
          <section className="modal pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
            <div className="modal-head">
              <div>
                <h2 id="pwa-install-title">Aufmaß Pro als App</h2>
                <p>Direkt vom Startbildschirm öffnen – ohne App-Store.</p>
              </div>
              <button onClick={() => setShowHelp(false)} aria-label="Schließen"><X size={17} /></button>
            </div>
            <div className="modal-body">
              <div className="pwa-install-hero">
                {/* The app icon is already a tiny local PNG; bypass image optimization so it also works in install previews. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/app-icon-192.png" width={68} height={68} alt="App-Symbol von MalerAufmaß Pro" />
                <span>
                  <strong>MalerAufmaß Pro</strong>
                  <small>PDF-Aufmaß, Projekte und Prüfberichte wie in einer normalen App.</small>
                </span>
              </div>

              <div className="pwa-install-steps">
                {promptEvent ? (
                  <>
                    <span><b>1</b><Download size={18} /><em>Unten auf „Jetzt installieren“ tippen.</em></span>
                    <span><b>2</b><CheckCircle2 size={18} /><em>Die Installation im Browser bestätigen.</em></span>
                    <span><b>3</b><Smartphone size={18} /><em>Aufmaß Pro anschließend über das neue App-Symbol öffnen.</em></span>
                  </>
                ) : platform === "ios" ? (
                  <>
                    <span><b>1</b><Share2 size={18} /><em>Diese Seite in Safari öffnen und unten auf „Teilen“ tippen.</em></span>
                    <span><b>2</b><Plus size={18} /><em>„Zum Home-Bildschirm“ auswählen.</em></span>
                    <span><b>3</b><CheckCircle2 size={18} /><em>Oben rechts auf „Hinzufügen“ tippen.</em></span>
                  </>
                ) : platform === "android" ? (
                  <>
                    <span><b>1</b><EllipsisVertical size={18} /><em>Das Browser-Menü oben rechts öffnen.</em></span>
                    <span><b>2</b><Download size={18} /><em>„App installieren“ oder „Zum Startbildschirm“ wählen.</em></span>
                    <span><b>3</b><CheckCircle2 size={18} /><em>Installation bestätigen.</em></span>
                  </>
                ) : (
                  <>
                    <span><b>1</b><EllipsisVertical size={18} /><em>Das Menü von Chrome oder Edge öffnen.</em></span>
                    <span><b>2</b><Download size={18} /><em>„MalerAufmaß Pro installieren“ auswählen.</em></span>
                    <span><b>3</b><CheckCircle2 size={18} /><em>Die Installation bestätigen.</em></span>
                  </>
                )}
              </div>

              <div className="pwa-install-note">
                Projekte und Original-PDFs bleiben weiterhin sicher in Ihrer Projektablage gespeichert.
              </div>
              <div className="modal-actions">
                <button className="button secondary" onClick={() => setShowHelp(false)}>{promptEvent ? "Abbrechen" : "Verstanden"}</button>
                {promptEvent && <button className="button primary" onClick={() => void install()}><Download size={16} /> Jetzt installieren</button>}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
