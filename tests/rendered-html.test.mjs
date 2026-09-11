import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders production app metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", "oai-authenticated-user-email": "test@malerbetriebguestrow.de" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+Laser-Aufmaß/i);
  assert.match(html, /<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/i);
  assert.match(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']#181719["']/i);
  assert.match(html, /aria-label=["']Gespeicherte Projekte["']/i);
  assert.match(html, /Mit Mausziehen[^<]+Mausrad scrollt[^<]+Mausrad zoomt/i);
  assert.match(html, /aria-label=["']MalerAufmaß Pro wird gestartet["']/i);
  assert.match(html, /src=["']\/brand-logo\.png["']/i);
  assert.match(html, /aria-label=["']Benutzerhandbuch öffnen["']/i);

  const mobileResponse = await worker.fetch(
    new Request("http://localhost/mobil", { headers: { accept: "text/html", "oai-authenticated-user-email": "test@malerbetriebguestrow.de" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  assert.equal(mobileResponse.status, 200);
  const mobileHtml = await mobileResponse.text();
  assert.match(mobileHtml, /<title>Aufmaß Mobil \| Die Maler sind los<\/title>/i);
  assert.match(mobileHtml, /href=["']\/mobile\.webmanifest["']/i);
  assert.match(mobileHtml, /prüfbarer Freigabe, Projektversionen und direkter PC-Übergabe/i);
  assert.match(mobileHtml, /Räume aufnehmen/i);
  assert.match(mobileHtml, />Skizze</i);
  assert.match(mobileHtml, /aria-label=["']KI-Maßassistent öffnen["']/i);
  assert.match(mobileHtml, /aria-label=["']Projektbezeichnung per Sprache eingeben["']/i);
  assert.match(mobileHtml, />Prüfen</i);
  assert.match(mobileHtml, /aria-label=["']Benutzerhandbuch öffnen["']/i);
});
