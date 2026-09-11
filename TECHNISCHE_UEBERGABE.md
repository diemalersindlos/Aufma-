# MalerAufmaß Pro – technische Übergabe

> Nachtrag vom 1. September 2026: Auf Grundlage dieses Exports wurde der lokal vollständig getestete **V45-Kandidat** erstellt. Er setzt leere neue Projekte, eine vertikale Projektwahl und die automatische Begradigung rechtwinkliger Handskizzen um. Einzelheiten stehen in `ARBEITSSTAND_V45.md`. Dieser Nachfolgestand ist wegen fehlenden Editorzugriffs noch nicht in Sites veröffentlicht.

Exportdatum: 1. September 2026  
Live-Adresse: https://maler-aufmass-pro.marcelbening.chatgpt.site  
Sites-Projekt: bestehendes Projekt „MalerAufmaß Pro“  
Projektstatus: **Pilotbetrieb**

## 1. Eindeutig identifizierter Stand

- Aktuell von Sites gemeldete gespeicherte Version: **40**
- Interne Live-Bezeichnung: **V44**
- Lokale Entwicklungs-/Handbuchbezeichnung: **V45-Kandidat**
- Git-Commit: `fdcf0b248ca299c4f2fe18c08d8cb6dbd51c707f`
- Commit-Nachricht: `V44: Präzisere Raumerkennung und Einzelraumanzeige`
- Commit-Datum: `2026-08-23T18:33:53+01:00`
- Git-Branch: `main`
- Der Branch-HEAD und der Commit der neuesten Sites-Version stimmen überein.

Die abweichenden Live-Nummern sind kein unterschiedlicher Quellstand: Sites zählt den gespeicherten Stand als Version 40; der damalige Anwendungscode und Commit bezeichnen denselben Stand als V44. Der V45-Kandidat baut lokal darauf auf und ist noch nicht gespeichert oder veröffentlicht.

Der ursprüngliche Export wurde direkt aus genau diesem Git-Commit erzeugt. Die Git-Verwaltungsdaten `.git/` waren nicht enthalten. Der neue V45-Kandidat besitzt deshalb noch keinen eigenen Git-Commit; installierte Abhängigkeiten, lokale Build-Ausgaben und Laufzeitdaten werden auch aus dem aktualisierten Übergabearchiv ausgeschlossen.

## 2. Projektstruktur

| Pfad | Inhalt |
|---|---|
| `app/` | Next-/Vinext-Seiten, Anmeldung, Desktop- und Mobil-Einstieg |
| `components/` | Desktop- und Mobiloberfläche, PDF-Aufmaß, Eingaben, Laser, Sprache, Skizze, Insta360, Handbuch |
| `lib/` | Rechenkern, VOB-Regeln, Plausibilitätsprüfung, PDF-/XLSX-Export, PDF-Raumerkennung, Projektdomäne |
| `lib/server/` | Projekt-API, D1- und R2-Speicherlogik, Versionen, Archiv, Papierkorb und Audit |
| `worker/` | Cloudflare-Worker-Einstieg und API-/App-Routing |
| `db/` | Drizzle-Datenbankschema und D1-Zugriff |
| `drizzle/` | SQL-Migrationen und Drizzle-Metadaten |
| `tests/` | Automatisierte Smoke-, Matrix-, Speicher-, Export- und Regressionstests |
| `docs/` | Produktvorgaben und Produktionsreife-Audit |
| `public/` | Logo, Symbole, PWA-Manifeste und Service Worker |
| `scripts/` | reproduzierbarer Install-, Build- und Artefakt-Prüfablauf |
| `build/` | Sites-/Vite-Integration |
| `.openai/hosting.json` | Zuordnung des bestehenden Sites-Projekts sowie D1-/R2-Bindings |

Technik: TypeScript, React 19, Next.js 16, Vinext/Vite, Cloudflare Worker, D1/SQLite, R2, Drizzle ORM, PDF.js, pdf-lib und ExcelJS.

## 3. Voraussetzungen und Befehle

Voraussetzung: Node.js `>=22.13.0`, npm, Linux mit `bash`, `flock`, `curl` und GNU `timeout`.

```bash
npm ci
npm run dev
```

Vollständige vorhandene Prüfung:

```bash
npm test
npm run lint
```

Weitere Befehle:

```bash
npm run build
npm run start
npm run validate:artifact
npm run db:generate
```

`npm test` führt zuerst den Produktionsbuild aus und danach sämtliche in `package.json` aufgeführten Tests. Die Veröffentlichung ist kein Bestandteil dieser Befehle.

## 4. Datenbank- und Speicherstruktur

`.openai/hosting.json` bindet:

- Cloudflare D1 als `DB`
- Cloudflare R2 als `BUCKET`

D1-Tabellen:

| Tabelle | Aufgabe |
|---|---|
| `projects` | Aktueller Projektzustand einschließlich `state_json`, Metadaten und PDF-Schlüssel |
| `project_versions` | Fortlaufende Projektrevisionen |
| `project_archives` | Archivstatus je Projekt und Eigentümer |
| `project_trash` | Wiederherstellbarer Papierkorb mit Lösch- und Schutzfrist |
| `project_audit_log` | Benutzer, Aktion, Feldänderungen und Zeitpunkt |

Die Daten werden über die authentifizierte E-Mail kontobezogen getrennt. D1 ist die zentrale Projektablage. R2 speichert Projektdateien nach folgendem Muster:

```text
projects/<owner>/<project-id>/source.pdf
projects/<owner>/<project-id>/panoramas/<panorama-id>
```

Die Migrationen `0000` bis `0003` sowie alle Drizzle-Snapshots liegen vollständig unter `drizzle/`. Der Server besitzt zusätzlich idempotente `CREATE TABLE IF NOT EXISTS`-Sicherung in `lib/server/project-store.ts`.

Dieser Export enthält absichtlich **keine Datenbankinhalte, Kundendaten, hochgeladenen PDFs oder 360°-Dateien**. Enthalten sind nur Schema, Migrationen und Quellcode.

## 5. Bekannte Fehler, Risiken und offene Arbeiten

### Kritisch vor Produktionsfreigabe

- VOB-/ATV-Regeln und projektspezifische Grenzwerte müssen anhand der lizenzierten, vertraglich gültigen Ausgabe fachlich bestätigt werden.
- Automatische Serverbackups und eine dokumentierte echte Wiederherstellungsprobe fehlen als nachgewiesener Betriebsprozess.
- Firmenbenutzer, Mandantenmodell, Rollen und fein abgestufte Berechtigungen fehlen.
- Datenschutz-, Aufbewahrungs-, Lösch- und Betriebsüberwachungskonzept sind nicht abschließend freigegeben.
- Reale Baustellenvergleiche zwischen klassischem und digitalem Aufmaß fehlen.

### Wichtig

- Die PDF-Raum-/Konturerkennung ist heuristisch und muss mit mehreren realen Grundrissen weiter geprüft werden. Unsichere Konturen werden korrekt blockiert, die automatische Trefferquote ist aber nicht durch einen repräsentativen Baustellendatensatz belegt.
- Vollständige Mehrgeräte-Konfliktoberfläche und praktische Offline-Synchronisationsprüfungen auf iOS, iPadOS und Android sind noch offen.
- Explizite Kunden-, Aufmaß- und Benutzer-ID sowie vollständiger Projektstamm für die spätere Handwerker-App fehlen.
- Projektduplikat, Volltextsuche und erweiterte Filter sind noch offen.
- Fehlertelemetrie und administrative Wiederherstellungsansicht fehlen.
- Produktive Laserprofile und Insta360-Auswertung sind nur vorbereitet, nicht mit festgelegten realen Gerätemodellen abgenommen.

### Technische Hinweise aus diesem Exportlauf

- Der Produktionsbuild meldet eine nicht blockierende Warnung für JavaScript-Chunks über 500 kB.
- `npm ci` meldet veraltete transitive Pakete. Ein aktueller Sicherheits-Audit wurde nicht ausgeführt; `.npmrc` deaktiviert den automatischen npm-Audit.
- Automatisierte Tests sind überwiegend Smoke-, Matrix- und Integrationstests. Eine vollständige Browser-End-to-End-Matrix auf allen Zielgeräten ist nicht vorhanden.

## 6. Aktuell veröffentlichter Stand

Die Live-Adresse gehört eindeutig zum vorhandenen Projekt „MalerAufmaß Pro“. Beim Export wurde es als aktiv und öffentlich gemeldet. Die veröffentlichte/neueste Sites-Version 40 verweist auf Commit `fdcf0b248ca299c4f2fe18c08d8cb6dbd51c707f`.

Der Quellstand enthält unter anderem:

- Desktop- und mobile Aufmaßoberfläche
- ChatGPT-Anmeldung für Desktop und Mobil
- PDF-Import, Seitenwahl, Zoom, Scrollen und Raumerkennung
- Einzelraumanzeige nach Auswahl in der Raumliste
- VOB-Regelmodul und Prüffreigabe
- manuelles, Laser-, Sprach-, Skizzen- und vorbereitetes Insta360-Aufmaß
- PDF-, XLSX-, CSV-, JSON- und vorbereitete GAEB-/REB-Ausgaben
- D1-Projekte, Revisionen, Archiv, Papierkorb und Audit-Protokoll
- R2-Speicherung für Original-PDF und Panoramen
- mobile Offline-Zwischenspeicherung und Konflikterkennung

## 7. Tatsächlich ausgeführte Prüfungen

Ausgeführt am 1. September 2026 auf exakt dem exportierten Commit mit Node.js `v24.19.0` und npm `11.9.0`:

- `npm ci` – erfolgreich
- `npm test` – erfolgreich, Exit-Code 0
- `npm run lint` – erfolgreich, Exit-Code 0

Dabei erfolgreich geprüft:

- reproduzierbarer Produktionsbuild und Sites-Artefakt
- keine zufällige Projekt-ID im globalen Worker-Bereich
- 90 VOB-Grenz- und Variantenfälle
- Raumhöhe, Öffnungen, Plausibilität und ungültige Eingaben
- Projektzustandsvalidierung und Audit-Differenzen
- echte SQLite-Integration für Anlegen, Aktualisieren, Revisionen, Konflikt, Papierkorb, Schreibsperre und Wiederherstellung
- Mess-/Rundungsgrenzen und Farbmigration
- Insta360-Geometrie
- professioneller Workflow und Freigabegate
- KI-Maßeingabe, Spracheingabe und Bluetooth-Laser-Parser
- Freihandskizzen-Erkennung
- mobile Projektübergabe und Berechnungen
- Archiv, Papierkorb, Wiederherstellung und Audit-API
- löschbare Zahlenfelder ohne automatische Null
- PDF-Renderqualität sowie Zoom-, Scroll- und Navigationslogik
- PDF-Raumkonturzuordnung, Mehrdeutigkeit, fehlende Konturen, mehrere Erkennungsläufe und Einzelraumanzeige
- Benutzerhandbuch V45
- prüfbare und Architekten-XLSX-Ausgaben
- mehrseitiger PDF-Prüfbericht
- gerenderte Desktop- und Mobil-Metadaten

Nicht nachgewiesen wurden fachliche VOB-Abnahme, Live-Datenbank-Restore, reale Baustellenvergleiche, vollständige Sicherheitsprüfung, Lasttest sowie eine echte Browser-/Gerätematrix.

## 8. Sicherheits- und Exporthinweise

- Keine `.env`-Datei war im Quellstand enthalten; daher wurde keine `.env.example` erfunden.
- Keine Passwörter, Zugriffstokens, API-Schlüssel, privaten Schlüssel oder Runtime-Geheimnisse wurden in den Export aufgenommen.
- `.openai/hosting.json` enthält nur Projektkennung und Binding-Namen, keine geheimen Werte.
- Die Testdaten sind ausschließlich künstliche Musterwerte.
- Die Git-Historie ist aus Sicherheits- und Größenbereinigungsgründen nicht Bestandteil der ZIP. Commit und Herkunft sind oben eindeutig dokumentiert.
- Das Projekt darf im übernehmenden Account nicht neu angelegt werden. Vor Änderungen muss der bestehende Sites-Zugriff beziehungsweise das Quellrepository eindeutig verbunden werden.
