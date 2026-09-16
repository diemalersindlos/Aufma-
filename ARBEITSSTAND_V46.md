# MalerAufmaß Pro – Arbeitsstand V46

Bearbeitet und geprüft: 16. September 2026  
Ausgangsstand: GitHub-Commit `529883f80fc858a41932a63b87dfee69bb47a185`  
Status: **V46-Entwicklungsstand für Pull-Request-Prüfung**

## Manuelles PDF-Raumaufmaß

- Die automatische PDF-Raumerkennung wurde vollständig entfernt.
- Räume werden im PDF durch Anklicken ihrer tatsächlichen Eckpunkte eingezeichnet.
- Ein vorhandener Planmaßstab wird gelesen; andernfalls wird die Seite über eine bekannte Strecke kalibriert.
- Während des Zeichnens werden einzelne Wandlängen, Grundfläche und Umfang angezeigt.
- Fehl gesetzte Punkte können sofort einzeln zurückgenommen werden.
- Vor dem Speichern zeigt der Raumdialog das fertige Aufmaß für Wände, Decke, Boden und Sockelleiste.
- Der Benutzer entscheidet selbst, welche Mengen übernommen werden.
- Gespeicherte Konturen können verschoben, an einzelnen Eckpunkten korrigiert oder neu gezeichnet werden.
- Excel, PDF-Prüfbericht und Prüferportal kennzeichnen die Herkunft als „Manuelle PDF-Kontur“.

## Kompatibilität

- Mehrfachauswahl und Zusammenführung von PDF-Dateien bleiben erhalten.
- Bestehende Projekte und ältere gespeicherte Messungen können weiterhin geöffnet werden.
- Projektverwaltung, VOB-Abzüge, Exporte, Laser, Skizze, Insta360 und Mobilfunktionen bleiben erhalten.
- `CLAUDE.md` beschreibt die verbindliche Produktentscheidung für die Zusammenarbeit mit einer zweiten KI.

## Prüfungen

- `npm run lint`: erfolgreich
- `npm test`: erfolgreich
- Produktionsbuild und Artefaktprüfung: erfolgreich
- Neuer Regressionstest für den manuellen PDF-Raumablauf: erfolgreich
- Alle bestehenden VOB-, Mess-, Speicher-, Export-, Mobil- und Oberflächentests: erfolgreich

## Veröffentlichung

Der Quellstand wird auf einem eigenen GitHub-Branch bereitgestellt. Das bestehende Sites-Projekt wird durch diesen Arbeitsstand nicht verändert oder veröffentlicht.
