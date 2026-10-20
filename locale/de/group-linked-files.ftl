glf-name = Group Linked Files

## Menüs

glf-menu-attach =
    .label = Datei aus gemeinsamem Ordner anhängen…
glf-menu-tools =
    .label = Group Linked Files
glf-menu-check =
    .label = Gemeinsamen Ordner jetzt prüfen
glf-menu-settings =
    .label = Einstellungen…
glf-menu-report =
    .label = Problem melden…

glf-picker-title = Datei aus dem gemeinsamen Ordner wählen

## Schutzhinweise

glf-blocked-title = Gemeinsame Datei unverändert gelassen
glf-blocked-rename = Die Dateien dieser Gruppe liegen im gemeinsamen Ordner. Zotero benennt sie nicht um, damit die Verknüpfung für alle funktioniert.
glf-blocked-delete = Die Datei bleibt im gemeinsamen Ordner. Zotero löscht keine gemeinsamen Dateien.
glf-blocked-modify = Zotero verändert keine gemeinsamen PDFs (Seiten drehen oder löschen, Anmerkungen in die Datei übertragen). Deine Anmerkungen werden wie gewohnt in Zotero gespeichert.

## Anhängen

glf-attached = Angehängt: { $name }
glf-confirm-duplicate =
    { $count ->
        [one] Ein anderer Eintrag verwendet diese Datei bereits.
       *[other] { $count } andere Einträge verwenden diese Datei bereits.
    } Trotzdem auch hier anhängen?

## Fehler

glf-error-no-folder = Auf diesem Computer ist kein gemeinsamer Ordner eingerichtet, oder er wurde nicht gefunden. Wähle ihn unter Einstellungen → Group Linked Files.
glf-error-not-group = Wähle zuerst genau einen Eintrag in der gemeinsamen Gruppenbibliothek aus.
glf-error-not-in-folder = Die Datei muss direkt im gemeinsamen Ordner liegen, nicht in einem Unterordner oder anderswo.
glf-error-invalid-name = Zotero kann diesen Dateinamen nicht verwenden. Bitte benenne die Datei im gemeinsamen Ordner um (ohne / \ : * ? " < > |) und versuche es erneut.
glf-error-file-missing = Die Datei ist nicht mehr auffindbar.
glf-error-generic = Etwas ist schiefgegangen: { $message }

## Status (Werkzeuge-Menü und Einstellungen)

glf-not-configured = Noch nicht eingerichtet. Wähle Gruppe und gemeinsamen Ordner unter Einstellungen → Group Linked Files.
glf-group-not-found = Die gewählte Gruppe (ID { $id }) ist in diesem Zotero noch nicht vorhanden. Bitte zuerst synchronisieren.
glf-check-group = Gruppe: { $name }
glf-check-folder = Gemeinsamer Ordner: { $path }
glf-check-folder-missing = Gemeinsamer Ordner auf diesem Computer nicht gefunden: { $path }
glf-check-counts = { $total } Anhänge · { $found } gefunden · { $missing } fehlen
glf-check-published = Soeben in den gemeinsamen Ordner kopiert: { $count }
glf-check-renamed = Umbenannt, weil der Name schon vergeben war: { $list }
glf-check-errors = Konnten nicht kopiert werden: { $list }
glf-check-missing-list = Fehlende Dateien (auf diesem Computer nicht im gemeinsamen Ordner):
glf-check-more = …und { $count } weitere

## Einstellungen

glf-prefs-intro = Die gewählte Gruppe speichert ihre Dateien in einem gemeinsamen Ordner (z. B. HU-Box) statt im Zotero-Speicher. Die Dateien öffnen sich trotzdem im Zotero-Reader, Anmerkungen werden wie gewohnt über Zotero synchronisiert. Die Zotero-Dateisynchronisierung ist nur für diese Gruppe ausgeschaltet.
glf-prefs-group = Gruppe
glf-prefs-group-none =
    .label = — Keine —
glf-prefs-folder = Gemeinsamer Ordner auf diesem Computer
glf-prefs-choose =
    .label = Wählen…
glf-prefs-status-title = Status
glf-prefs-check =
    .label = Jetzt prüfen
