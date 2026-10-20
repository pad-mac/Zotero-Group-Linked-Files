# Anleitung fürs Team

Unsere PDFs liegen im gemeinsamen HU-Box-Ordner. Mit dem Plugin öffnen sie sich trotzdem direkt im Zotero-Reader, und alle sehen die Anmerkungen der anderen.

## Einmal einrichten (pro Computer)

1. **HU-Box-Ordner synchronisieren**: Der gemeinsame Ordner muss mit dem Seafile-Client auf deinem Computer synchronisiert sein.
2. **Plugin installieren**: Die Datei `group-linked-files-….xpi` aus dem [neuesten Release](https://github.com/pad-mac/Zotero-Group-Linked-Files/releases/latest) herunterladen. In Zotero: **Werkzeuge → Plugins → Zahnrad ⚙ → „Add-on aus Datei installieren…“** und die Datei wählen.
3. **Einstellen**: Zotero-Einstellungen → **Group Linked Files** → Gruppe wählen → gemeinsamen Ordner wählen. Unter „Status“ sollte stehen, wie viele Dateien gefunden wurden.

Updates kommen danach automatisch.

## Im Alltag

- **PDF öffnen**: Doppelklick wie gewohnt. Es öffnet sich im Zotero-Reader.
- **Anmerkungen**: Markieren und kommentieren wie gewohnt. Sie werden über Zotero synchronisiert, die anderen sehen sie mit deinem Namen.
- **Neues PDF hinzufügen**: Einfach wie gewohnt in Zotero auf den Eintrag ziehen. Nach etwa einer Minute benennt das Plugin die Datei nach unserem Schema um und kopiert sie in den HU-Box-Ordner:
  - ein Autor: `mueller_1987.pdf`
  - zwei Autoren: `mueller-schmidt_1990.pdf`
  - mehr als zwei: `weber-ua_2004.pdf`
  - gleicher Autor und gleiches Jahr schon vorhanden: `mueller_1987a.pdf`, `mueller_1987b.pdf`
  - alles klein, Umlaute als ae/oe/ue/ss; ohne Autoren zählen die Herausgeber, ohne Jahr steht `oj` im Namen.
- **PDF, das schon im HU-Box-Ordner liegt, verknüpfen**: Rechtsklick auf den Eintrag → **Datei aus gemeinsamem Ordner anhängen…** → Datei wählen. Es wird nichts kopiert.
- **Viele PDFs auf einmal verknüpfen**: **Werkzeuge → Group Linked Files → Passende Dateien verknüpfen…** (ganze Gruppe) oder Rechtsklick auf eine Sammlung. Das Plugin sucht für jeden Eintrag ohne Datei eine Datei mit passendem Namen (`mueller_1987`; Groß-/Kleinschreibung und ü/ue sind dabei egal), zeigt die Liste und verknüpft nach Bestätigung. Gibt es mehrere Einträge mit gleichem Autor und Jahr, bekommt nur der älteste die Datei; `…a`/`…b`-Dateien bitte von Hand anhängen.

## Bitte nicht

- **Dateien im HU-Box-Ordner nicht umbenennen oder in Unterordner verschieben.** Der Dateiname ist die Verknüpfung, sonst findet Zotero die Datei bei niemandem mehr.
- Seiten drehen oder löschen geht bei gemeinsamen PDFs nicht. Das ist Absicht, damit niemand versehentlich die gemeinsame Datei verändert.

## Wenn etwas nicht klappt

- **Werkzeuge → Group Linked Files → Gemeinsamen Ordner jetzt prüfen** zeigt, welche Dateien fehlen – und welche im Zotero-Speicher statt im HU-Box-Ordner gelandet sind (passiert, wenn jemand ohne Plugin PDFs hinzufügt).
- **Werkzeuge → Group Linked Files → Problem melden…**
- Falls das Plugin einmal gar nicht funktioniert: Alle PDFs liegen weiterhin im HU-Box-Ordner, und die Anmerkungen bleiben in Zotero erhalten. Es geht nichts verloren.

Auf dem Handy (Zotero für iOS/Android) und in der Web-Bibliothek sind die PDFs nicht verfügbar, nur die Einträge.
