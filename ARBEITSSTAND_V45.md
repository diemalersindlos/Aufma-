# MalerAufmaß Pro – lokaler Arbeitsstand V45

Bearbeitet und geprüft: 1. September 2026  
Ausgangsstand: V44 / Sites-Version 40 / Commit `fdcf0b248ca299c4f2fe18c08d8cb6dbd51c707f`  
Status: **V45-Kandidat, noch nicht veröffentlicht**

## Umgesetzte Änderungen

### Neue Projekte

- Projektbezeichnung, Kunde, Anschrift, Bearbeiter und Referenz beginnen leer.
- Desktop und Mobil übernehmen keine Projektdaten des zuvor geöffneten Projekts.
- Messungen, PDF-Zuordnung, Maßstäbe, Panoramen, Prüfstatus, Zeichenzustand und Kalibrierwert werden zurückgesetzt.
- Mobile Raum-, Öffnungs-, Sonderflächen- und Skizzenentwürfe beginnen mit leeren Text- und Zahlenfeldern.
- Berechnete Summen beginnen bei `0`.
- Sichere Rechengrundlagen wie Rundung und unbestätigte VOB-Projektregel werden auf ihre definierten Grundeinstellungen zurückgesetzt und niemals aus dem Altprojekt übernommen.

### Projektanzeige

- Die seitliche horizontale Registerreihe wurde durch eine kompakte Projektwahl ersetzt.
- Beim Öffnen der Schnellwahl erscheinen alle aktiven Projekte in genau einer vertikalen Spalte untereinander.
- Die vollständige Projektablage, das Archiv und der Papierkorb bleiben ebenfalls einspaltig.

### Handskizzen

- Rechtecke, L-förmige Räume und weitere rechtwinklige Konturen werden anhand ihrer dominanten Raumachsen erkannt.
- Freihandabweichungen werden auf parallele und rechtwinklige Wandlinien projiziert.
- Die bereinigten Linien werden erneut zu einer geschlossenen, nicht überkreuzten Raumkontur zusammengesetzt.
- Zu große Verschiebungen, Selbstüberschneidungen und unplausible Flächen blockieren die automatische Begradigung.
- Die Oberfläche kennzeichnet sichtbar, wenn eine gerade Raumskizze automatisch erstellt wurde.
- Manuell verschobene Eckpunkte werden weiterhin als manuelle Korrektur ausgewiesen.

## Prüfungen

- `npm ci`: erfolgreich
- `npm run lint`: erfolgreich, keine Warnungen oder Fehler
- `npm test`: erfolgreich, Exit-Code 0
- Produktionsbuild und Sites-Artefaktprüfung: erfolgreich
- Neuer Reset-/Vertikallistentest: erfolgreich
- Erweiterter Freihandskizzentest: Rechteck, L-Raum, gekreuzte Kontur, automatische Begradigung und manuelle Korrektur erfolgreich
- Alle bisherigen VOB-, Mess-, Speicher-, Audit-, PDF-, Excel-, Mobil- und Regressionstests: erfolgreich

Die zusätzliche Prüfung `npx tsc --noEmit` meldet weiterhin die bereits im unveränderten V44-Ausgangsstand vorhandenen Typfehler in der PDF-Kandidatenunion, der Laufzeitvalidierung und den SQLite-Testadaptern. Ein direkter Vergleich beider Stände ergab keine neue TypeScript-Meldung durch V45. Der vorhandene Produktionsbuild führt diese eigenständige Typprüfung nicht aus. Diese geerbten Meldungen sollen in einem getrennten Bereinigungsauftrag behoben werden, damit fachliche Änderungen und reine Typkorrekturen nicht vermischt werden.

## Veröffentlichung

Das vorhandene Sites-Projekt ist über `.openai/hosting.json` eindeutig zugeordnet. Der übernehmende Account besitzt jedoch noch keinen Editorzugriff; Sites meldet für die Projektkennung `project not found`. Deshalb wurde keine neue Sites-Version gespeichert und die Live-Adresse nicht verändert.

Nach Editorfreigabe muss dieser exakte Quellstand in das bestehende Quellrepository übernommen, als eigener Git-Commit gespeichert, erneut getestet, als neue Sites-Version gespeichert und erst danach veröffentlicht werden.
