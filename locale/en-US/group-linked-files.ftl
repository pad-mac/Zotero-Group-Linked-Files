glf-name = Group Linked Files

## Menus

glf-menu-attach =
    .label = Attach File from Shared Folder…
glf-menu-tools =
    .label = Group Linked Files
glf-menu-check =
    .label = Check Shared Folder Now
glf-menu-settings =
    .label = Settings…
glf-menu-report =
    .label = Report a Problem…

glf-picker-title = Choose a file from the shared folder

## Guardrail notices

glf-blocked-title = Shared file left unchanged
glf-blocked-rename = Files in this group live in the shared folder. Zotero doesn’t rename them, so the link keeps working for everyone.
glf-blocked-delete = The file stays in the shared folder. Zotero doesn’t delete shared files.
glf-blocked-modify = Zotero doesn’t change shared PDFs (rotating or deleting pages, moving annotations into the file). Your annotations are saved in Zotero as usual.

## Attach

glf-attached = Attached: { $name }
glf-confirm-duplicate =
    { $count ->
        [one] Another item already uses this file.
       *[other] { $count } other items already use this file.
    } Attach it here as well?

## Errors

glf-error-no-folder = No shared folder is set up on this computer, or it can’t be found. Choose it under Settings → Group Linked Files.
glf-error-not-group = Select a single item in the shared group library first.
glf-error-not-in-folder = The file has to be directly in the shared folder, not in a subfolder or anywhere else.
glf-error-invalid-name = Zotero can’t use this filename. Please rename the file in the shared folder (avoid / \ : * ? " < > |) and try again.
glf-error-file-missing = The file can’t be found anymore.
glf-error-generic = Something went wrong: { $message }

## Status (Tools menu and settings)

glf-not-configured = Not set up yet. Choose the group and the shared folder under Settings → Group Linked Files.
glf-group-not-found = The selected group (ID { $id }) isn’t in this Zotero library yet. Sync first.
glf-check-group = Group: { $name }
glf-check-folder = Shared folder: { $path }
glf-check-folder-missing = Shared folder not found on this computer: { $path }
glf-check-counts = { $total } attachments · { $found } found · { $missing } missing
glf-check-published = Copied to the shared folder just now: { $count }
glf-check-renamed = Renamed because the name was taken: { $list }
glf-check-errors = Could not be copied: { $list }
glf-check-missing-list = Missing files (not in the shared folder on this computer):
glf-check-more = …and { $count } more

## Settings pane

glf-prefs-intro = The selected group keeps its files in a shared folder (for example HU-Box) instead of Zotero Storage. Files still open in Zotero’s reader, and annotations sync through Zotero as usual. Zotero file syncing is turned off for this group only.
glf-prefs-group = Group
glf-prefs-group-none =
    .label = — None —
glf-prefs-folder = Shared folder on this computer
glf-prefs-choose =
    .label = Choose…
glf-prefs-status-title = Status
glf-prefs-check =
    .label = Check Now
