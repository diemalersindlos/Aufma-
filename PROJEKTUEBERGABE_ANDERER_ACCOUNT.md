# MalerAufmaß Pro – Übergabe an einen anderen ChatGPT-Account

Stand der Übergabe: 1. September 2026  
Zuletzt veröffentlichter Stand laut bisherigem Projektverlauf: Version 44  
Veröffentlichte Anwendung: https://maler-aufmass-pro.marcelbening.chatgpt.site

## 1. Diese Anweisung im neuen Account zuerst verwenden

Bitte lies diese Übergabedatei vollständig und behandle sie als verbindliche Projektvorgabe für die weitere Entwicklung von **MalerAufmaß Pro**.

Ich möchte kein neues Demonstrationsprogramm und keinen vollständigen Neubau. Arbeite am vorhandenen Projekt und Quellcode weiter. Prüfe zuerst, auf welche Projektdateien, Site-Versionen und Quellcodes du tatsächlich Zugriff hast. Behaupte niemals, eine Änderung sei umgesetzt, getestet oder veröffentlicht, solange du den vorhandenen Code nicht geöffnet, die Änderung nicht im Code vorgenommen, die vorgesehenen Tests nicht ausgeführt und die Bereitstellung nicht überprüft hast.

Falls nur diese Übergabedatei, aber kein Quellcode vorliegt, darfst du noch nichts neu programmieren. Bitte mich dann ausdrücklich um:

- den vollständigen aktuellen Quellcode beziehungsweise Projekt-Export,
- alle zugehörigen Konfigurations- und Datenbankmigrationsdateien,
- vorhandene Tests und Dokumentation,
- oder eine Freigabe des bestehenden Sites-Projekts als Editor.

Analysiere nach Erhalt des Codes zuerst:

A. Was funktioniert bereits?  
B. Welche Fehler sind vorhanden?  
C. Was fehlt für den Firmenbetrieb?  
D. Welche Sicherheits- und Speicherprobleme bestehen?  
E. Welche Berechnungen müssen fachlich geprüft werden?  
F. Welche Änderungen sind kritisch?  
G. Welche Architekturverbesserungen sind sinnvoll?  
H. In welcher Reihenfolge soll weiterentwickelt werden?

Behebe danach zuerst die kritischen Fehler. Vorhandene funktionierende Teile müssen erhalten bleiben.

## 2. Projektziel und Abgrenzung

MalerAufmaß Pro soll ein zuverlässiges, professionelles digitales Aufmaßprogramm für Maler- und Ausbauunternehmen werden. Es soll später im realen Baustellen- und Firmenalltag auf PC, Laptop, Smartphone und Tablet eingesetzt werden können.

Der Schwerpunkt liegt zunächst ausschließlich auf dem Aufmaß. Es soll keine vollständige Handwerker-Betriebssoftware werden. Angebote, Rechnungen und allgemeine Baustellenverwaltung werden nur durch spätere Schnittstellen vorbereitet. Eine separate Handwerker-App wird parallel von Marcus Schwan entwickelt.

Langfristig benötigt die Verbindung beider Programme:

- eindeutige Kunden-, Projekt-, Aufmaß- und Benutzer-IDs,
- dokumentiertes Datenmodell und Feldzuordnung,
- API und sichere Authentifizierung,
- Rollen und Berechtigungen,
- Synchronisation mit Konfliktlösung,
- Datei- und PDF-Übergabe,
- Import und Export als CSV, XLSX und PDF.

## 3. Verbindliche Prioritäten

1. Richtige und fachlich nachvollziehbare Berechnungen
2. Kein Datenverlust
3. Einfache Baustellenbedienung
4. Prüfbarkeit jeder Menge
5. Stabilität und Fehlerbehandlung
6. Geschwindigkeit
7. Zusätzliche KI-Funktionen
8. Optische Verbesserungen

Funktion und Zuverlässigkeit haben Vorrang vor Design. Bei Unsicherheit darf niemals still ein Wert geschätzt oder übernommen werden. Stattdessen muss beispielsweise angezeigt werden:

> Berechnung konnte nicht eindeutig durchgeführt werden. Bitte Eingabe kontrollieren.

## 4. Gewünschter Baustellenablauf

Ein Mitarbeiter soll mit Smartphone oder Tablet und später einem Bluetooth-Laser durch ein Gebäude gehen können:

1. Projekt öffnen
2. Raum auswählen oder anlegen
3. Bauteil auswählen
4. Maß erfassen
5. Nächstes Bauteil messen
6. Raum automatisch und manuell prüfen
7. Raum abschließen
8. Prüfbares Aufmaß, PDF, Excel und Materialmengen erzeugen

Die Bedienung muss große Touchflächen, klare Strukturen und möglichst wenige Klicks bieten.

## 5. Erforderliche Funktionen

### Projektverwaltung

Projekte anlegen, bearbeiten, automatisch speichern, duplizieren, archivieren, sperren, wieder öffnen, suchen und filtern. Ein Projekt enthält mindestens Projektnummer, Name, Kunde, Baustellenadresse, Ansprechpartner, Datum, Bearbeiter, Status, Räume, Grundrisse, Fotos, Aufmaße, Kommentare und Anhänge.

### Räume und Bauteile

Beliebig viele Räume mit Raumname, Raumnummer, Geschoss, Länge, Breite, Höhe, Boden, Decke, einzelnen Wänden, Sockelleisten, Türen, Fenstern, Laibungen, Nischen, Vorsprüngen, Pfeilern, Dachschrägen und sonstigen Bauteilen. Jedes Bauteil und jede Berechnung muss einzeln nachvollziehbar bleiben.

### Eingabe

- Manuelle Eingabe über Tastatur und Touch
- Spätere Bluetooth-Laser-Anbindung mit Zuordnung zum gewählten Bauteil
- Spracheingabe/KI-Sprachpilot mit sichtbarer Kontrolle vor dem Speichern
- Leere Zahlenfelder dürfen beim Löschen nicht automatisch zu `0` werden
- Alte Werte sollen beim Antippen einfach überschreibbar sein

### PDF und Grundriss

Mehrseitige PDFs importieren, Seite wählen, zuverlässig zoomen, scrollen und verschieben, Maßstab definieren, Messstrecken setzen, Räume und Bauteile markieren und Seiten zusammenrechnen.

### KI-Grundrisserkennung

Erkennen von Raumstempeln, Raumbezeichnungen, Maßen, Wänden, Türen, Fenstern, Flächen und Geschossen. Keine erfundenen Raumgrößen oder Konturen. Bei fehlender Eindeutigkeit:

> Maße nicht eindeutig bestimmbar – manuelle Kontrolle erforderlich.

Raumflächen aus eindeutig erkannten NRF-Angaben dürfen erhalten bleiben. Wandflächen, Umfang und Sockelleisten dürfen jedoch nur berechnet werden, wenn eine passende Raumkontur sicher erkannt oder manuell bestätigt wurde.

### Handskizzen und 360°

Fotografierte oder hochgeladene Handskizzen sollen später analysiert und anschließend manuell korrigiert werden können. Eine spätere Insta360-/360°-Integration ist vorzusehen; Fotos und Scans müssen Projekt und Raum zugeordnet werden können.

### VOB-Modul

VOB-Regeln müssen in einem eigenen, versionierten Regelmodul liegen. Öffnungen, Abzüge, Laibungen und Sonderfälle müssen fachlich nachvollziehbar und getestet sein. Keine VOB-Regel darf erfunden werden. Nicht eindeutig bestätigte Regeln sind zur fachlichen Prüfung zu kennzeichnen und dürfen keine unbemerkte Freigabe erhalten.

### Prüfbarkeit und Aufmaß-Prüfer

Jede Menge muss ihre Rechenkette zeigen, beispielsweise Raum → Wand → Länge × Höhe → Rohfläche → Öffnung → angewandte VOB-Regel → Abzug/Zulage → Laibung → Endmenge.

Der Prüfer soll unter anderem ungewöhnliche oder fehlende Maße, fehlende Wände, doppelte Fenster/Türen, unrealistische Raumhöhen, widersprüchliche Maße, Einheitenfehler, negative Flächen, größere Öffnungen als Wände und ungeprüfte KI-Ergebnisse melden. Warnungen dürfen Werte nicht automatisch überschreiben.

### Materialberechnung

Farbe, Grundierung, Spachtelmasse, Tapete, Bodenbelag und Sockelleisten. Verbrauch, Anstrichanzahl und Verschnitt müssen einstellbar sein. Tapeten benötigen Rollenbreite, Rollenlänge, Rapport, Versatz, Raumhöhe und Bahnenberechnung.

### Ausgabe

Eigener Bereich **„Prüfbares Aufmaß“** für Auftraggeber, Architekt, Bauleiter, Rechnungsprüfung und interne Kontrolle.

PDF mit Firmenlogo, Projektdaten, Räumen, Bauteilen, Einzelberechnungen, Summen, VOB- und Prüfhinweisen sowie sauberen Seitenumbrüchen.

XLSX mit Raum, Bauteil, Länge, Breite, Höhe, Anzahl, Rohfläche, Abzug, Zulage, Endmenge und Bemerkung. Die Ausgabe muss übersichtlich und prüfbar sein.

## 6. Datensicherheit und Firmenbetrieb

Erforderlich sind zentrale Datenbank, automatische Speicherung, Backups, geprüfte Wiederherstellung, Versionierung, Papierkorb, Schutz vor versehentlichem Löschen, sichere Authentifizierung, Rollen, Rechte und Änderungsprotokoll.

Vorgesehene Rollen: Administrator, Büro, Bauleiter, Mitarbeiter und Azubi. Rechte unter anderem für Ansehen, Erstellen, Bearbeiten, Löschen, Aufmaßänderung, Freigabe, PDF-Export und Benutzerverwaltung.

Wichtige Änderungen müssen Benutzer, Zeitpunkt sowie Vorher-/Nachher-Wert protokollieren.

Der Offline-Betrieb soll Messungen lokal sicher zwischenspeichern und später synchronisieren. Konflikte zwischen Geräten dürfen nie still Daten überschreiben.

Fehler müssen verständlich angezeigt und protokolliert werden. Bereits eingegebene Daten sollen erhalten bleiben; eine Wiederherstellung muss möglich sein.

## 7. Tests und Freigaberegel

Automatisierte Tests sind mindestens erforderlich für Wand, Boden, Decke, Fenster, Türen, Laibungen, VOB-Regeln, Rundungen, Materialberechnung, PDF und Excel. Für die wichtigen Rechenregeln sollen mindestens 50 bis 100 realistische Grenz- und Praxisfälle bestehen.

Bei jeder Änderung gilt:

1. Bestehenden Code analysieren
2. Fehlerursache belegen
3. Änderung möglichst klein und sicher implementieren
4. Berechnungslogik prüfen
5. Automatisierte Tests ausführen
6. Bestehende Funktionen erneut testen
7. Folgefehler prüfen
8. Erst danach eine neue Version speichern und veröffentlichen
9. Veröffentlichte Version direkt prüfen

Ein grüner Build allein ist kein Nachweis für fachlich richtige Berechnungen.

Das Programm bleibt **Pilotbetrieb**, bis Berechnungen und VOB-Regeln fachlich geprüft, Projekte sicher gespeichert, Backup und Wiederherstellung praktisch erprobt, Rollen/Rechte eingerichtet, PDF und Excel zuverlässig, Mobil- und Offline-Betrieb getestet, Fehlerprotokoll und Datenschutz berücksichtigt sowie reale Baustellenvergleiche erfolgreich abgeschlossen sind.

## 8. Bisheriger Entwicklungsstand laut bisherigem Verlauf

Der folgende Stand muss am echten Quellcode und an der veröffentlichten Anwendung überprüft werden; diese Liste ersetzt keine technische Prüfung:

- V40: Papierkorb mit Wiederherstellung, 30-tägige Schutzfrist und serverseitiges Änderungsprotokoll
- V41: Startfehler durch zu frühe Erzeugung einer Projekt-ID behoben
- V42: Automatische `0` beim Leeren von Zahlenfeldern korrigiert
- V44: PDF-Raumerkennung und Einzelraumanzeige überarbeitet
- Zentrale Datenbank, Dateispeicher, Projektversionen, Archiv sowie PDF-/Excel-Ausgabe sollen bereits vorhanden sein
- Offline-Zwischenspeicherung und Konflikterkennung sollen bereits begonnen worden sein
- Eigenes versioniertes VOB-Regelmodul und fachliche Projektbestätigung sollen vorhanden sein
- Genannt wurden 90 automatisierte VOB-Grenz-/Variantenfälle sowie PDF-, Excel-, Mobil-, Zoom-, Speicher- und Regressionstests

Diese Angaben dürfen im neuen Account nicht ungeprüft als erfolgreich übernommen werden. Tests sind nach Zugriff auf den echten Code erneut auszuführen.

## 9. Zuletzt gewünschte Bedienung der Raumerkennung

Die Raumerkennung ist weiterhin ein zentraler Verbesserungsbereich:

- Räume sollen genauer erkannt werden.
- Zunächst sollen Räume nur in der Seiten-/Raumliste erscheinen.
- Im Grundriss sollen nicht alle Räume gleichzeitig eingeblendet werden.
- Erst der Klick auf einen Raum in der Liste zeigt genau diesen Raum im Grundriss.
- Beim Raumwechsel muss die vorherige Markierung verschwinden.
- Die zugehörige PDF-Seite soll automatisch geöffnet werden.
- Unsichere Konturen werden markiert und müssen manuell gezeichnet oder bestätigt werden.
- Keine Wand-, Umfangs- oder Sockelmengen aus einer unsicheren Kontur berechnen.
- Höhere Analyseauflösung und mehrere Erkennungsläufe wurden für V44 beschrieben, müssen aber am echten Code geprüft werden.

## 10. Bekannte offene Punkte mit hoher Priorität

1. Tatsächliche Genauigkeit der Raum- und Konturerkennung an mehreren realen Grundrissen prüfen und verbessern
2. Fachliche Freigabe sämtlicher VOB-Regeln und Grenzfälle
3. Rollen- und Berechtigungssystem vollständig umsetzen
4. Automatische Backups und eine dokumentierte echte Wiederherstellungsprobe
5. Datenschutz, Zugriffsschutz und Sicherheitsprüfung
6. Konfliktlösung und Offline-Synchronisation mit mehreren echten Geräten testen
7. Reale Baustellen im Parallelbetrieb: klassisches gegen digitales Aufmaß vergleichen
8. Abweichungen dokumentieren, Ursachen analysieren und Grenzwerte festlegen
9. Bluetooth-Laser-Schnittstelle anhand eines festgelegten Gerätemodells umsetzen
10. Schnittstellenvertrag zur separaten Handwerker-App dokumentieren

## 11. Was bei der Übernahme nicht verwechselt werden darf

Diese Datei enthält die fachlichen Vorgaben und den dokumentierten Projektstand. Sie enthält nicht automatisch:

- den vollständigen Quellcode,
- Datenbankinhalte oder Kundendaten,
- Zugangsdaten oder geheime Schlüssel,
- Eigentums- oder Bearbeitungsrechte am bestehenden Sites-Projekt,
- Original-PDFs und Testgrundrisse,
- eine Garantie, dass jede früher genannte Funktion tatsächlich im aktuellen Code vorhanden ist.

Zugangsdaten oder geheime Schlüssel dürfen nicht in Chats oder in diese Datei kopiert werden. Sie sind über die sichere Projektkonfiguration einzurichten.

## 12. Erster konkreter Auftrag im neuen Account

Nachdem der aktuelle Quellcode oder die Editor-Freigabe vorliegt:

1. Projektstruktur und vorhandene Dokumentation vollständig erfassen.
2. Anwendung lokal beziehungsweise in einer sicheren Vorschau starten.
3. Alle vorhandenen Tests ausführen und Ergebnisse dokumentieren.
4. Aktuellen Live-Stand mit dem Quellcode abgleichen.
5. Raumerkennung mit den vorhandenen Originalgrundrissen reproduzieren.
6. Fehlerliste nach 🔴 Kritisch, 🟠 Wichtig, 🟡 Verbesserung und 🟢 Optional erstellen.
7. Zuerst kritische Datenverlust-, Berechnungs- und Sicherheitsfehler beheben.
8. Änderungen im bestehenden Code umsetzen, erneut vollständig testen und erst nach erfolgreicher Prüfung veröffentlichen.

Bitte antworte nach der Übernahme zuerst nur mit:

- welchem Projekt-/Quellcode du tatsächlich Zugriff hast,
- welche Version du eindeutig identifizieren kannst,
- was du als Nächstes technisch prüfst,
- und was noch von mir benötigt wird.
