# Arbeitsregeln für Claude

## Produktentscheidung V46

- PDF-Räume werden ausschließlich manuell durch gesetzte Eckpunkte erfasst.
- Keine automatische Wand-, Raum-, Kontur- oder NRF-Erkennung wieder einführen.
- Ein PDF-Planmaßstab darf gelesen werden; ohne Maßstab muss der Benutzer kalibrieren.
- Fläche und Umfang entstehen aus der Benutzerkontur. Wandfläche ist Umfang × Raumhöhe.
- Der Benutzer wählt selbst Wände, Decke, Boden und Sockelleiste.
- Jede gespeicherte PDF-Raumkontur muss verschiebbar und an einzelnen Eckpunkten korrigierbar bleiben.

## Zusammenarbeit

- Änderungen auf einem eigenen Branch vornehmen und als Pull Request gegen `main` einreichen.
- `main` nicht ungeprüft überschreiben.
- Vor einem Pull Request `npm run lint` und `npm test` ausführen.
- Das Sites-Projekt nur verändern oder veröffentlichen, wenn der Benutzer das ausdrücklich verlangt.
- Bestehende VOB-, Projekt-, Export-, Mobil-, Laser-, Skizzen- und Insta360-Funktionen erhalten.
