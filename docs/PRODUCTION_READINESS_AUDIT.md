# Technische Prüfung zur Produktionsreife

Stand: 23.08.2026  
Bewertung: Pilotanwendung – noch nicht für ungeprüfte Abrechnung freigegeben

## A. Was bereits funktioniert

- Desktop-Anwendung und installierbare mobile Begleit-App
- Projekt-ID, Messpositions-IDs, zentrale D1-Projektablage und R2-Dateispeicher
- Eigentümerbezogene Trennung über das angemeldete Konto
- Projekt speichern, laden, archivieren, wiederherstellen und versionierte Stände öffnen
- mehrseitige PDF, Seitenauswahl, Kalibrierung, Auto-Erkennung, Zoom, Verschieben und getrennt scrollbare Aufmaßliste
- manuelles, Laser-, Sprach-, Skizzen-, Sonderflächen- und vorbereitetes Insta360-Aufmaß
- Wand, Decke, Boden, Sockelleiste, Öffnungen und dreiseitige Laibungsdarstellung
- Materialberechnung für wesentliche Malerleistungen
- prüfbare XLSX-/PDF-Ausgaben, Farbzuordnung, CSV, JSON und vorbereitete GAEB-/REB-Übergaben
- Freigabeworkflow, Prüfentscheidungen und Versionen
- automatisierte Smoke-Tests für Rechen-, PDF-, XLSX-, Mobil- und Eingabefunktionen

## B. Festgestellte Fehler und Risiken

| Priorität | Befund | Auswirkung | Status |
|---|---|---|---|
| 🔴 Kritisch | Fehlende Raumhöhe wurde still mit 2,50 m ersetzt. | Falsche Wandmenge ohne sichtbaren Fehler. | behoben in V39 |
| 🔴 Kritisch | VOB-Logik lag im allgemeinen Rechenmodul und die projektspezifische Regel war nicht fachlich bestätigt. | Nicht belastbar dokumentierte Abzugsentscheidung. | behoben in V39; fachliche Vertragsprüfung bleibt Pflicht |
| 🔴 Kritisch | Gleichzeitiges Speichern von PC und Mobilgerät konnte nach dem Prinzip „letzter Schreibvorgang gewinnt“ überschreiben. | Unbemerkter Datenverlust. | behoben in V39 durch optimistische Konflikterkennung |
| 🔴 Kritisch | Servervalidierung prüfte nur wenige Kopffelder und keine Größen-/Strukturgrenzen. | Beschädigte oder übergroße Projektzustände möglich. | behoben in V39 |
| 🔴 Kritisch | Die mobile App hatte keine haltbare Offline-Warteschlange. | Baustellendaten können vor Online-Speicherung verloren gehen. | Grundsicherung in V39; vollständige Mehrgeräte-Konfliktoberfläche noch offen |
| 🟠 Wichtig | Plausibilitätsprüfung erkannte fehlende Höhen, ungültige Raumgeometrie, Öffnung größer als Wand und Dubletten nicht vollständig. | Fehler können bis zur manuellen Prüfung unentdeckt bleiben. | Kernprüfungen in V39 ergänzt |
| 🟠 Wichtig | Dauerhaftes Löschen entfernte Projekt, Versionen und Anlagen endgültig. | Keine Wiederherstellung nach Fehlbedienung. | behoben in V40: 30-Tage-Schutzfrist, keine Löschung der D1-/R2-Nutzdaten, Wiederherstellung auf PC und Mobil |
| 🟠 Wichtig | Rollen, gemeinsame Firmenprojekte und fein abgestufte Rechte fehlen. | Noch keine vollständige Mehrbenutzer-Firmenanwendung. | offen |
| 🟠 Wichtig | Änderungsprotokoll auf Feldebene fehlte. | Wer/was/wann ist nicht vollständig nachvollziehbar. | Kernprotokoll in V40 umgesetzt; Rollen-/Geräte-ID und administrative Auswertung bleiben offen |
| 🟠 Wichtig | Projektstamm enthält noch keine explizite Kunden-ID, Aufmaß-ID, Benutzer-ID, Ansprechpartner und Projektdatum. | Schnittstelle und Firmenakte unvollständig. | offen |
| 🟡 Verbesserung | Projektduplikat, Volltextsuche und erweiterte Filter fehlen. | Langsamere Büroarbeit bei vielen Projekten. | offen |
| 🟡 Verbesserung | Fehlertelemetrie und administrative Wiederherstellungsansicht fehlen. | Support und Ursachenanalyse erschwert. | offen |
| 🟢 Optional | Produktive Insta360-Auswertung und direkte Laserprofile sind noch vorbereitete Integrationen. | Komfortfunktion, nicht Kernfreigabe. | später |

## C. Fehlende Funktionen für den Firmenbetrieb

- Firmen-/Mandantenmodell mit Rollen und Berechtigungen
- Geräte-ID, Rollenbezug und administrative Filter für das vorhandene Feldebene-Änderungsprotokoll
- kontrollierte endgültige Löschung nach Schutzfrist und dokumentierte Administratorfreigabe
- automatische lokale Offline-Sicherung samt Synchronisationswarteschlange
- bewusste Konfliktauflösung mit Vergleich von lokalem und Serverstand
- serverseitige Backups, Wiederherstellungsprobe und dokumentierte Aufbewahrung
- Projektduplikat, Suche, Filter und vollständiger Projektstamm
- versionierte API mit Kunden-, Projekt-, Aufmaß- und Benutzerkennungen
- Datenschutzkonzept, Löschkonzept, Auftragsverarbeitung und Betriebsüberwachung
- dokumentierter Pilotvergleich zwischen klassischem und digitalem Aufmaß

## D. Sicherheits- und Speicherprobleme

Die zentrale Speicherung besitzt inzwischen Konflikterkennung, mobile Offline-Haltbarkeit, Versionen, wiederherstellbares Löschen, ein Feldebene-Änderungsprotokoll und harte Servervalidierung. Für ein vollständiges Sicherheitskonzept fehlen weiterhin Firmenrollen, Gerätebezug, dokumentierte Backup-/Restore-Proben, administrierte Aufbewahrung und Datenschutzfreigabe. Die Oberfläche darf nur nach Anmeldung zugänglich sein; API-Daten müssen weiterhin kontobezogen isoliert bleiben.

## E. Zu überprüfende Berechnungen

- fehlende, null, negative, nicht endliche und ungewöhnliche Raummaße
- Wandbrutto aus Umfang × Höhe mit Menge und Faktor
- Öffnungsabzug genau an, unter und über dem Projektschwellenwert
- getrennte Behandlung von Türen, Fenstern, Laibungen und Sonderfällen
- Öffnung beziehungsweise Summe der Öffnungen größer als Wandbrutto
- Rundung erst am nachvollziehbaren Positionsende
- Boden, Decke, freie Flächen, Linien und Stückzahlen
- Materialverbrauch, Anstriche, Reserve, Gebinde und Tapetenrapport/Versatz
- identische Werte in Oberfläche, Prüfbericht, PDF und XLSX

Die konkrete Abzugsregel und Schwelle muss anhand der lizenzierten, vertraglich vereinbarten ATV-Ausgabe fachlich bestätigt werden. Die Software darf den eingestellten Wert nicht als automatisch normgeprüft darstellen.

## F. Kritische Änderungen

1. stille Raumhöhenannahme entfernen und unvollständige Räume blockieren
2. VOB-Regeln in ein versioniertes Modul auslagern und Projektbestätigung verlangen
3. umfassende Plausibilitätsprüfung in den Freigabegate integrieren
4. Projektdaten serverseitig tief validieren und begrenzen
5. optimistische Versionsprüfung gegen stille Geräteüberschreibung einführen
6. lokale, haltbare Offline-Warteschlange mit sichtbarem Synchronisationsstatus umsetzen
7. dauerhaftes Löschen durch Papierkorb und Wiederherstellung ersetzen – in V40 umgesetzt

## G. Sinnvolle Zielarchitektur

| Schicht | Verantwortlichkeit |
|---|---|
| UI Desktop/Mobil | Eingabe, Vorschau, Navigation, Warnungen; keine eigene Fachformel |
| Rechenkern | Einheiten, Geometrie, Mengen und Rundung als reine Funktionen |
| VOB-Regelmodul | versionierte Regelentscheidung mit Begründung und Bestätigungsstatus |
| Prüfmodul | technische und fachliche Plausibilitätsprobleme ohne automatische Korrektur |
| Projektdomäne | Kunden, Projekte, Räume, Bauteile, Aufmaße, Status und IDs |
| Speicherung | Transaktionen, Versionen, Audit-Log, Papierkorb, Backup und Anlagen |
| Synchronisation | lokale Operationen, Serverrevision, Konflikte und Wiederaufnahme |
| Export | ein gemeinsames, geprüftes Exportmodell für PDF/XLSX/CSV/JSON |
| Integrationen | versionierte API, Laser, Sprache, KI, Insta360 und Handwerker-App |

## H. Entwicklungsplan

1. **Rechenkern absichern:** VOB-Modul, keine Ersatzwerte, Plausibilitätsgate, 50–100 Testfälle.
2. **Datenverlust verhindern:** tiefe Servervalidierung, atomare Versionierung, Konflikterkennung, Offline-Warteschlange.
3. **Wiederherstellung:** Papierkorb und Audit-Log umgesetzt; Backup- und Restore-Probe als nächster kritischer Nachweis.
4. **Firmenmodell:** Mandant, Benutzer, Rollen, Rechte und gemeinsame Projektakte.
5. **Projektstamm/API:** vollständige IDs und Felder, Suche, Filter, Duplikat, API-Versionierung.
6. **Exporte vereinheitlichen:** ein kanonisches Prüfmodell und Cross-Export-Regressionstests.
7. **Geräteprüfung:** definierte Testmatrix für Windows, iOS/iPadOS und Android.
8. **Pilotbetrieb:** reale Parallelaufmaße dokumentieren, Abweichungen beheben und Freigabekriterien nachweisen.

## Umsetzungsnachweis V39

- Produktionsbuild und Artefaktvalidierung erfolgreich
- ESLint ohne Befund
- 90 automatisierte Grenzwert- und Variantenfälle im getrennten Öffnungs-/Laibungsregelmodul
- zusätzliche Plausibilitäts-, Struktur-, PDF-, XLSX-, Mobil-, Zoom-, Eingabe- und Regressionsprüfungen erfolgreich
- Anmeldung für Desktop und Mobil erzwungen
- Serverzeitpunkt und Basisrevision je Projekt gespeichert; parallele Änderungen liefern einen sichtbaren Konflikt statt stiller Überschreibung
- mobiler Projektentwurf bei jeder Änderung lokal haltbar; Offline-Speicherung und automatische Wiederübertragung umgesetzt

Die Kennzeichnung „Pilotbetrieb“ bleibt bestehen, weil Rollen/Rechte, Papierkorb, vollständiges Audit-Log, Backup-/Restore-Nachweis und reale Baustellenvergleiche noch nicht abgeschlossen sind.

## Umsetzungsnachweis V40

- „Löschen“ verschiebt Projekte nur noch in einen kontobezogenen Papierkorb mit mindestens 30 Tagen Schutzfrist.
- Projektzustand, sämtliche Revisionen, Original-PDF und 360°-Dateien werden beim Verschieben nicht gelöscht.
- Aktive Projekte, Archiv und Papierkorb sind in Hauptprogramm und Handy-App getrennt und vollständig wiederherstellbar.
- Papierkorbprojekte können weder geöffnet noch gespeichert oder über Anlagenendpunkte verändert werden, bevor sie bewusst wiederhergestellt wurden.
- Archivieren und Papierkorb sind bei einem aktuell geöffneten, noch nicht synchronisierten Stand blockiert; so kann die Sicherheitsaktion keine lokalen Änderungen verwerfen.
- Speichern, Archivieren, Wiederherstellen und Verschieben in den Papierkorb erzeugen serverseitige Audit-Ereignisse mit authentifiziertem Benutzer und Zeitpunkt.
- Fachlich wichtige Änderungen an Projektkopf, Raum, Kontur, Öffnung, Materialeinstellung und Prüfstatus werden als alter und neuer Wert protokolliert.
- Ein monoton fortgeschriebener Serverzeitpunkt verhindert auch bei sehr schnellen Folgespeicherungen identische Konflikttoken.
- Die echte SQLite-Integration prüft Migration, Anlegen, Aktualisieren, Audit, Papierkorb-Schreibsperre, Wiederherstellung und Versionserhalt; die vollständige Regression prüft alle vorhandenen Funktionen erneut.

Die Kennzeichnung „Pilotbetrieb“ bleibt bestehen, weil Firmenrollen und Rechte, Backup-/Restore-Nachweis, administrierte endgültige Löschung, Datenschutzfreigabe und reale Baustellenvergleiche noch nicht abgeschlossen sind.

## Hotfix-Nachweis V41

- Produktionsfehler beim Öffnen der Hauptseite anhand der Worker-Protokolle bis zum exakten Aufrufpfad zurückverfolgt.
- Ursache: Eine zufällige Projekt-ID wurde beim Laden des Worker-Moduls statt innerhalb eines Seitenaufrufs erzeugt; Cloudflare blockiert Zufallswerte im globalen Modulbereich.
- Projekt-ID-Erzeugung in den React-Laufzeitaufruf verschoben. Datenbank, gespeicherte Projekte und Berechnungslogik waren nicht betroffen.
- Neuer Regressionstest verhindert, dass die Initial-ID künftig erneut im globalen Worker-Bereich erzeugt wird.

## Eingabekorrektur V42

- Ursache der nicht löschbaren Null: Direkte Umwandlung eines leeren HTML-Zahlenfeldes mit `Number("")` in den Zahlenwert `0`.
- Gemeinsame Zahlenfeldeingabe mit getrenntem Bearbeitungsentwurf eingeführt. Ein leeres Feld bleibt während der Neueingabe sichtbar leer und wird nicht mehr sofort auf 0 zurückgesetzt.
- Bewusst eingegebene 0 bleibt weiterhin ein echter Wert; leere Eingabe und Zahlenwert 0 sind technisch getrennt.
- Hauptaufmaß, PDF-Automatik, Maßstab, Material, Öffnungen, Laibungen, Laser, Sonderflächen und Insta360 verwenden dieselbe korrigierte Eingabelogik.
- Regressionstest prüft leere Eingabe, Dezimalkomma, Dezimalpunkt, bewusste 0 und alle drei PC-Eingabeoberflächen.

## Eindeutige PDF-Raumkonturen V43

- Die digitale Probe-PDF wurde seitenweise geprüft: Raumbezeichnungen und NRF-Flächen werden korrekt aus den Raumstempeln gelesen; die fehlerhaften Ergebnisse entstanden bei der anschließenden Geometriezuordnung.
- Erkannte Konturen werden nicht mehr künstlich auf die NRF-Fläche skaliert. Dadurch können keine erfundenen Wandlängen oder übergroßen Polygone mehr entstehen.
- Eine Kontur gilt nur dann als zugeordnet, wenn genau ein Raumstempel enthalten ist, Flächenverhältnis und Erkennungswert plausibel sind und dieselbe Kontur keinem zweiten Raum zugeordnet wird.
- Bei fehlender oder mehrdeutiger Kontur bleibt die ausgelesene NRF-Fläche erhalten, der Raumumfang wird jedoch als „nicht bestimmt“ ausgewiesen. Angeforderte Wand- und Sockelmengen bleiben bis zur manuellen Konturbestätigung gesperrt.
- Unsichere Räume erscheinen im Plan als kompakte gelbe Prüfmarke. Über „Kontur zeichnen“ beziehungsweise „Kontur korrigieren“ kann der Benutzer die tatsächlichen Raumecken setzen; danach werden Umfang, Wandfläche und Sockelleiste neu berechnet.
- Bereits gespeicherte PDF-NRF-Konturen aus älteren Versionen werden beim Öffnen als ungeprüft markiert; ihre bisherigen Wand-/Sockelansätze sind bis zur erneuten Konturbestätigung gesperrt, während die Originalpunkte zur Korrektur erhalten bleiben.
- PDF- und Excel-Prüfnachweise weisen fehlende Konturen ausdrücklich aus. Qualitätsprüfung und Projektfreigabe behandeln einen noch offenen Wand-/Sockelansatz als Fehler.
- Ein eigener Regressionstest deckt eindeutige Treffer, Mehrraumkonturen, unplausible Flächenverhältnisse, fehlende Konturen und die Auswahl des besten Erkennungslaufs ab.

## Präzisere Einzelraumanzeige V44

- Die Rasteranalyse verkleinert digitale Pläne nicht mehr pauschal auf 1.000 Pixel. Auf dem Desktop wird die Grundrissgeometrie bis 1.600 Pixel Analysebreite ausgewertet; auf kleineren Geräten bleibt mindestens die vollständige 1.180-Pixel-Basis erhalten.
- Drei unterschiedliche Lückenschließungen werden weiterhin getrennt berechnet, ihre Kandidaten aber raumweise zusammengeführt. Dadurch kann jeder Raum die beste plausible Kontur seines Erkennungslaufs verwenden, statt die gesamte PDF-Seite auf nur einen Lauf festzulegen.
- Flächen- und Sicherheitsprüfung bleiben unverändert streng: Mehrraumkonturen, unplausible Flächenabweichungen und unsichere Ergebnisse werden weiterhin nicht als Wandumfang übernommen.
- Nach dem Auto-Aufmaß wird keine Raumkontur automatisch eingeblendet. Die rechte Aufmaßliste bleibt die führende Auswahl; ein Klick öffnet bei Bedarf die richtige PDF-Seite und zeigt ausschließlich den ausgewählten Raum.
- Beim Wechsel auf einen anderen Listeneintrag wird die vorherige Raumkontur ausgeblendet. Die Projektdaten und Berechnungen bleiben vollständig erhalten.
