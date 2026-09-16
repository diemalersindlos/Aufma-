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
- Hauptaufmaß, manuelles PDF-Aufmaß, Maßstab, Material, Öffnungen, Laibungen, Laser, Sonderflächen und Insta360 verwenden dieselbe korrigierte Eingabelogik.
- Regressionstest prüft leere Eingabe, Dezimalkomma, Dezimalpunkt, bewusste 0 und alle drei PC-Eingabeoberflächen.

## Manuelles PDF-Raumaufmaß V46

- Die automatische PDF-Raumerkennung einschließlich Rasterdetektor, Textmaskierung und Konturzuordnung wurde vollständig aus dem Programmablauf entfernt.
- Räume werden wie in einem PDF-Messwerkzeug durch Anklicken ihrer tatsächlichen Eckpunkte im Grundriss eingezeichnet.
- Ein vorhandener PDF-Planmaßstab wird nur als Messgrundlage gelesen; ist er nicht vorhanden, verlangt das Programm vor dem Zeichnen eine manuelle Kalibrierung.
- Während des Zeichnens werden Seitenlängen, Grundfläche und Umfang direkt angezeigt. Fehl gesetzte Punkte können einzeln zurückgenommen werden.
- Vor dem Speichern zeigt der Raumdialog das vollständige Aufmaß für Wände, Decke, Boden und Sockelleiste. Der Benutzer bestimmt selbst, welche Positionen übernommen werden.
- Gespeicherte Konturen können als Ganzes verschoben, an einzelnen Eckpunkten korrigiert oder vollständig neu gezeichnet werden; die Aufmaßwerte werden anschließend neu berechnet.
- Ein Regressionstest stellt sicher, dass kein automatischer PDF-Raumdetektor mehr ausgeführt wird und der manuelle Raumablauf vollständig verfügbar bleibt.
