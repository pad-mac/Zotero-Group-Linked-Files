glf-name = Group Linked Files

## Menüs

glf-menu-attach =
    .label = Datei aus gemeinsamem Ordner anhängen…
glf-menu-tools =
    .label = Group Linked Files
glf-menu-link =
    .label = Passende Dateien verknüpfen…
glf-menu-link-collection =
    .label = Passende Dateien aus gemeinsamem Ordner verknüpfen…
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

glf-webdav-password-prompt = WebDAV-Passwort für { $user } (Gruppe „{ $group }“):
glf-webdav-login-needed = Gruppe „{ $group }“: WebDAV-Anmeldung fehlt oder ist falsch, neue Dateien können nicht hochgeladen werden. Passwort unter Einstellungen → Group Linked Files eingeben.
glf-webdav-downloading = Lade { $name } …
glf-attached = Angehängt: { $name }
glf-confirm-duplicate =
    { $count ->
        [one] Ein anderer Eintrag verwendet diese Datei bereits.
       *[other] { $count } andere Einträge verwenden diese Datei bereits.
    } Trotzdem auch hier anhängen?

## Passende Dateien verknüpfen

glf-link-found = { $count ->
        [one] 1 passende Datei
       *[other] { $count } passende Dateien
    } für { $checked } Einträge ohne Datei gefunden:
glf-link-question = Jetzt verknüpfen? Es wird nichts kopiert oder umbenannt.
glf-link-none = Keine passenden Dateien für { $checked } Einträge ohne Datei gefunden.
glf-link-skipped = { $count ->
        [one] 1 Eintrag wurde übersprungen, weil schon ein anderer Eintrag mit gleichem Autor und Jahr diese Datei bekommt.
       *[other] { $count } Einträge wurden übersprungen, weil schon ein anderer Eintrag mit gleichem Autor und Jahr diese Datei bekommt.
    }
glf-link-done = { $count ->
        [one] 1 Datei verknüpft.
       *[other] { $count } Dateien verknüpft.
    }
glf-link-unmatched = Einträge weiterhin ohne Datei: { $count }

## Fehler

glf-error-no-folder = Auf diesem Computer ist kein gemeinsamer Ordner eingerichtet, oder er wurde nicht gefunden. Wähle ihn unter Einstellungen → Group Linked Files.
glf-error-not-group = Wähle zuerst genau einen Eintrag in der gemeinsamen Gruppenbibliothek aus.
glf-error-not-in-folder = Die Datei muss direkt im gemeinsamen Ordner liegen, nicht in einem Unterordner oder anderswo.
glf-error-invalid-name = Zotero kann diesen Dateinamen nicht verwenden. Bitte benenne die Datei im gemeinsamen Ordner um (ohne / \ : * ? " < > |) und versuche es erneut.
glf-error-choose-library = Wähle zuerst die Bibliothek oder eine Sammlung einer verknüpften Gruppe aus.
glf-config-no-group = Für diese Verknüpfung ist noch keine Gruppe gewählt.
glf-check-no-folder = Auf diesem Computer ist noch kein gemeinsamer Ordner gewählt.
glf-webdav-error-login = WebDAV-Anmeldung fehlt oder ist falsch. Bitte Benutzername und WebDAV-Passwort prüfen (HU-Box: in den HU-Box-Einstellungen im Abschnitt „WebDAV“ festlegen).
glf-webdav-error-network = Der WebDAV-Server ist nicht erreichbar.
glf-webdav-error-notfound = Diesen Ordner gibt es auf dem WebDAV-Server nicht.
glf-webdav-error-status = Der WebDAV-Server meldet einen Fehler (HTTP { $status }).
glf-webdav-empty = Der WebDAV-Ordner ist leer.
glf-error-file-missing = Die Datei ist nicht mehr auffindbar.
glf-error-generic = Etwas ist schiefgegangen: { $message }

## Status (Werkzeuge-Menü und Einstellungen)

glf-not-configured = Noch keine Gruppe verknüpft. Unter Einstellungen → Group Linked Files hinzufügen.
glf-group-not-found = Die gewählte Gruppe (ID { $id }) ist in diesem Zotero noch nicht vorhanden. Bitte zuerst synchronisieren.
glf-check-group = Gruppe: { $name }
glf-check-folder = Gemeinsamer Ordner: { $path }
glf-check-folder-missing = Gemeinsamer Ordner auf diesem Computer nicht gefunden: { $path }
glf-check-counts = { $total } Anhänge · { $found } gefunden · { $missing } fehlen
glf-check-published = Soeben in den gemeinsamen Ordner kopiert: { $count }
glf-check-renamed = Umbenannt, weil der Name schon vergeben war: { $list }
glf-check-errors = Konnten nicht kopiert werden: { $list }
glf-check-stranded = Im Zotero-Speicher statt im gemeinsamen Ordner (vermutlich ohne Plugin hinzugefügt): { $count }
glf-check-no-webdav = Auf diesem Computer ist noch kein WebDAV-Ordner eingerichtet.
glf-check-webdav = WebDAV-Ordner: { $url }
glf-check-webdav-error = WebDAV-Ordner { $url }: { $error }
glf-check-local = Auf diesen Computer geladen: { $count } von { $total }
glf-check-missing-list = Fehlende Dateien (auf diesem Computer nicht im gemeinsamen Ordner):
glf-check-more = …und { $count } weitere

## Einstellungen

glf-prefs-intro = Jede verknüpfte Gruppe speichert ihre Dateien in einem gemeinsamen Ordner (z. B. HU-Box) statt im Zotero-Speicher. Die Dateien öffnen sich trotzdem im Zotero-Reader, Anmerkungen werden wie gewohnt über Zotero synchronisiert. Die Zotero-Dateisynchronisierung ist nur für verknüpfte Gruppen ausgeschaltet. Jede Gruppe hat ihren eigenen Ordner und ihre eigene Dateibenennung.
glf-prefs-group = Gruppe
glf-prefs-group-none =
    .label = — Keine —
glf-prefs-folder = Gemeinsamer Ordner auf diesem Computer
glf-prefs-choose =
    .label = Wählen…
glf-prefs-status-title = Status
glf-prefs-check =
    .label = Jetzt prüfen
glf-prefs-naming-title = Dateinamen
glf-prefs-naming-enabled =
    .label = Neue Dateien nach diesem Schema benennen
glf-prefs-naming-help = Platzhalter: { $tokens }. Ist der Name schon vergeben, wird a, b, c … angehängt. „Passende Dateien verknüpfen“ nutzt dasselbe Schema.
glf-prefs-naming-template = Schema
glf-prefs-naming-separator = Zwischen Autoren
glf-prefs-naming-etal = Bei mehr Autoren
glf-prefs-naming-max = Max. Autoren im Namen
glf-prefs-naming-preview = Beispiele
glf-prefs-naming-transliterate =
    .label = Umlaute ersetzen (ü → ue, ß → ss)
glf-prefs-naming-lowercase =
    .label = Alles kleinschreiben
glf-prefs-links = Verknüpfte Gruppen
glf-prefs-add =
    .label = Gruppe hinzufügen…
glf-prefs-remove =
    .label = Entfernen
glf-prefs-empty = Noch keine Gruppe verknüpft. Mit „Gruppe hinzufügen…“ eine Gruppe mit einem gemeinsamen Ordner verknüpfen.
glf-prefs-config-nogroup = (keine Gruppe gewählt)
glf-prefs-config-nofolder = kein Ordner
glf-prefs-remove-confirm = Verknüpfung für „{ $name }“ entfernen? Dateien und Einträge bleiben, wie sie sind; nur die Einstellungen dieses Computers für die Gruppe werden entfernt, und die Zotero-Dateisynchronisierung gilt wieder für die Gruppe.
glf-prefs-same-folder = Eine andere verknüpfte Gruppe nutzt denselben Ordner. Das geht, aber die Dateinamen beider Gruppen teilen sich dann einen Ordner.
glf-prefs-mode = Wo die Dateien liegen
glf-prefs-mode-folder =
    .label = Lokaler Ordner (z. B. vom HU-Box-Client synchronisiert)
glf-prefs-mode-webdav =
    .label = WebDAV (HU-Box direkt, ohne Client)
glf-prefs-webdav-server = WebDAV-Adresse
glf-prefs-webdav-path = Ordner auf dem Server
glf-prefs-webdav-browse =
    .label = Durchsuchen…
glf-prefs-webdav-user = Benutzername
glf-prefs-webdav-password = WebDAV-Passwort
glf-prefs-webdav-save =
    .label = Speichern & testen
glf-prefs-webdav-help = HU-Box: Einmalig in der HU-Box-Weboberfläche ein WebDAV-Passwort festlegen (Einstellungen, Abschnitt „WebDAV“); dort steht auch der Benutzername. Das Passwort wird im Passwortspeicher von Zotero auf diesem Computer abgelegt. Dateien werden beim Öffnen heruntergeladen.
glf-prefs-webdav-ok = Verbunden: { $files } Dateien in diesem Ordner.
glf-prefs-webdav-browse-title = Ordner auf dem Server wählen
glf-prefs-webdav-browse-use = ✓ Diesen Ordner verwenden: { $path }
glf-prefs-webdav-browse-up = ↑ Eine Ebene höher
glf-prefs-download-all =
    .label = Alle Dateien herunterladen
glf-prefs-download-progress = Lade { $done } von { $total } …
glf-prefs-download-done = Heruntergeladen: { $count }
