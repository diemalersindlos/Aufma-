"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

type SplashPhase = "visible" | "leaving" | "hidden";

export default function StartupSplash() {
  const [phase, setPhase] = useState<SplashPhase>("visible");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), reducedMotion ? 650 : 1450);
    const hideTimer = window.setTimeout(() => setPhase("hidden"), reducedMotion ? 750 : 1980);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={`startup-splash ${phase === "leaving" ? "leaving" : ""}`}
      role="status"
      aria-label="MalerAufmaß Pro wird gestartet"
    >
      <div className="startup-splash-glow" aria-hidden="true" />
      <div className="startup-splash-content">
        <img src="/brand-logo.png" alt="Die Maler sind los – Malermeisterbetrieb Marcus Schwan" />
        <span className="startup-splash-product">AUFMASS PRO</span>
        <div className="startup-splash-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
