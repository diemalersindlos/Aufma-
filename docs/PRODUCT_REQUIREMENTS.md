# Produktauftrag: MalerAufmaß Pro

Stand: 23.08.2026  
Status: verbindliche Leitlinie für die weitere Entwicklung

## 1. Produktziel und Abgrenzung

MalerAufmaß Pro wird als professionelles digitales Aufmaßprogramm für Maler- und Ausbauunternehmen entwickelt. Es muss im Baustellenalltag auf Smartphone, Tablet und PC zuverlässig funktionieren und aus nachvollziehbar erfassten Raum- und Bauteilmaßen ein vollständiges, prüfbares Aufmaß, Materialmengen sowie PDF- und XLSX-Ausgaben erzeugen.

Das Produkt bleibt zunächst auf Aufmaß, Prüfung, Materialermittlung, Projektakte und Austauschformate begrenzt. Angebote, Rechnungen und eine vollständige Betriebsverwaltung gehören nicht in diesen Entwicklungsschritt. Schnittstellen zur separaten Handwerker-App werden vorbereitet.

## 2. Unveränderliche Prioritäten

1. richtige Berechnungen
2. kein Datenverlust
3. einfache Baustellenbedienung
4. vollständige Prüfbarkeit
5. Stabilität
6. Geschwindigkeit
7. zusätzliche KI-Funktionen
8. optische Verbesserungen

Funktion, Sicherheit und Nachvollziehbarkeit haben Vorrang vor Gestaltung oder Funktionsumfang.

## 3. Sicherheitsregeln für Berechnungen

- Es gibt keine stillen Schätzungen oder Ersatzwerte für fehlende Maße.
- Nicht eindeutige Ergebnisse werden als „Maße nicht eindeutig bestimmbar – manuelle Kontrolle erforderlich“ gekennzeichnet.
- Fehlerhafte, fehlende, negative oder nicht endliche Werte dürfen nicht als gültige Menge ausgegeben werden.
- KI-Ergebnisse, Spracheingaben, PDF-Erkennung, Skizzen und 360°-Auswertungen bleiben bis zur Benutzerprüfung als unbestätigt gekennzeichnet.
- Der Aufmaß-Prüfer warnt und blockiert nötigenfalls eine Freigabe; er überschreibt keine Eingabe selbsttätig.
- Jeder Rechenweg bleibt vom Projekt über Raum und Bauteil bis zu Rohmenge, Abzug, Zulage und Endmenge nachvollziehbar.

## 4. VOB-Regelwerk

- VOB-/ATV-Regeln liegen in einem getrennten, versionierten Regelmodul.
- Regelsatz, Vertragsgrundlage, Schwellenwerte, Rundung und fachliche Bestätigung werden je Projekt gespeichert.
- Keine Regel wird frei angenommen. Nicht zweifelsfrei verifizierte Regeln werden zur fachlichen Prüfung gekennzeichnet und verhindern die Freigabe.
- Öffnungen und Laibungen bleiben Einzelbauteile. Türen, Fenster und sonstige Öffnungen werden getrennt behandelt.
- Jede Änderung am Regelmodul benötigt automatisierte Grenzwert-, Sonderfall- und Regressionstests.

## 5. Projekt- und Datenmodell

Jede Firmenakte erhält mindestens eindeutige Kunden-, Projekt-, Aufmaß- und Benutzerkennungen. Ein Projekt enthält Projektnummer, Name, Kunde, Baustelle, Ansprechpartner, Datum, Bearbeiter, Status, Räume, Grundrisse, Fotos, Aufmaße, Kommentare und Anhänge.

Projekte können angelegt, bearbeitet, gespeichert, dupliziert, gesucht, gefiltert, archiviert, gesperrt und wieder geöffnet werden. Löschen erfolgt nur wiederherstellbar über einen Papierkorb beziehungsweise nach ausdrücklicher endgültiger Löschung. Wichtige Änderungen werden mit Benutzer, Zeitpunkt, altem und neuem Wert protokolliert.

## 6. Räume und Eingabewege

Ein Projekt unterstützt beliebig viele Räume. Länge, Breite, Höhe, Boden, Decke, Wände, Sockelleisten, Türen, Fenster, Laibungen, Nischen, Vorsprünge, Pfeiler, Dachschrägen und weitere Bauteile bleiben einzeln nachvollziehbar.

Eingabewege:

- Tastatur und Touch
- Bluetooth-Laser mit kontrollierbarer Messfolge und Zielzuordnung
- Spracheingabe/KI-Sprachpilot mit Vorschau vor Übernahme
- mehrseitige PDF mit Seitenwahl, Zoom, Scrollen, Verschieben, Kalibrierung und Messgeometrie
- korrigierbare Freihandskizze, einschließlich Apple Pencil
- vorbereitete Insta360-/360°-Zuordnung mit bestätigtem Referenzmaß

## 7. Prüfung, Materialien und Exporte

Der Aufmaß-Prüfer erkennt unter anderem fehlende oder ungewöhnliche Maße, unvollständige Räume, doppelte Öffnungen, Öffnungen größer als die Wand, Einheitenfehler, nicht geprüfte KI-Ergebnisse und widersprüchliche Geometrien.

Materialmengen für Farbe, Grundierung, Spachtelmasse, Tapete, Bodenbelag und Sockelleisten verwenden änderbare Verbrauchs- und Gebindewerte. Tapeten berücksichtigen Rollenmaße, Raumhöhe, Rapport, Versatz, Bahnen und Verschnitt.

„Prüfbares Aufmaß“ erzeugt professionell strukturierte PDF- und XLSX-Dateien für Auftraggeber, Architekt, Bauleiter, Rechnungsprüfung und interne Kontrolle. Farben verbinden Raumkontur, Aufmaßzeile und Export eindeutig. CSV, PDF, XLSX und ein versioniertes JSON-Übergabeformat stehen für Schnittstellen bereit.

## 8. Speicherung, Rechte und Synchronisation

- Die zentrale Datenbank ist die maßgebliche Datenquelle; Browserdaten sind nur ein lokaler Entwurf beziehungsweise eine Offline-Warteschlange.
- Automatisches Speichern, Versionen, Backups, Wiederherstellung und Schutz vor versehentlichem Löschen sind Pflicht.
- Sichere Authentifizierung sowie Rollen Administrator, Büro, Bauleiter, Mitarbeiter und Azubi werden mit fein abgestuften Rechten vorgesehen.
- Offline-Änderungen werden lokal haltbar gespeichert und später synchronisiert.
- Gleichzeitige Änderungen dürfen nicht still überschrieben werden. Konflikte werden erkannt, angezeigt und bewusst aufgelöst.
- Dateiübertragung, API, Authentifizierung, Berechtigungen und Feldzuordnung sind für die spätere Handwerker-App versioniert.

## 9. Qualitäts- und Freigabekriterien

Für Rechenlogik werden mindestens 50–100 realistische Testfälle aufgebaut. Kritische Regeln erhalten zusätzlich Grenzwert- und Fehlertests. PDF, XLSX, Rundung, Speicherung, Synchronisation, mobile Bedienung, Fehlerbehandlung und Wiederherstellung werden regressionsgeprüft.

Das Produkt wird erst als produktionsreif bezeichnet, wenn Berechnungen und VOB-Regeln fachlich bestätigt und getestet sind, Speicherung und Backups funktionieren, Benutzer und Rechte vorhanden sind, PDF/XLSX auf allen Zielgeräten geprüft sind, Offline-Synchronisation und Konfliktlösung funktionieren, Datenschutz und Fehlerprotokoll umgesetzt sind und reale Baustellen im Parallelbetrieb erfolgreich verglichen wurden.

Bis dahin trägt die Anwendung sichtbar den Status „Pilotbetrieb“.

## 10. Vorgehen bei jeder Änderung

1. bestehenden Code und Datenmodell analysieren
2. vorhandene Funktion schützen
3. Fehler und Risiken identifizieren
4. kleinste tragfähige Änderung implementieren
5. Berechnungslogik prüfen
6. automatisierte Tests ausführen
7. bestehende Funktionen erneut testen
8. Folgefehler, Datenmigration und Rückwärtskompatibilität prüfen
9. Benutzerhandbuch und technische Dokumentation aktualisieren

