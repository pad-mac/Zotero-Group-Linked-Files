glf-name = Group Linked Files

## Menus

glf-menu-attach =
    .label = Attach File from Shared Folder…
glf-menu-tools =
    .label = Group Linked Files
glf-menu-link =
    .label = Link Matching Files…
glf-menu-link-collection =
    .label = Link Matching Files from Shared Folder…
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

glf-webdav-password-prompt = WebDAV password for { $user } (group “{ $group }”):
glf-webdav-login-needed = Group “{ $group }”: WebDAV login missing or wrong, so new files can’t be uploaded. Enter the password under Settings → Group Linked Files.
glf-webdav-downloading = Loading { $name } …
glf-attached = Attached: { $name }
glf-confirm-duplicate =
    { $count ->
        [one] Another item already uses this file.
       *[other] { $count } other items already use this file.
    } Attach it here as well?

## Link matching files

glf-link-found = { $count ->
        [one] Found 1 matching file
       *[other] Found { $count } matching files
    } for { $checked } items without a file:
glf-link-question = Link them now? Nothing is copied or renamed.
glf-link-none = No matching files found for { $checked } items without a file.
glf-link-skipped = { $count ->
        [one] 1 item was skipped because another item with the same author and year already gets that file.
       *[other] { $count } items were skipped because another item with the same author and year already gets that file.
    }
glf-link-done = { $count ->
        [one] Linked 1 file.
       *[other] Linked { $count } files.
    }
glf-link-unmatched = Items still without a file: { $count }

## Errors

glf-error-no-folder = No shared folder is set up on this computer, or it can’t be found. Choose it under Settings → Group Linked Files.
glf-error-not-group = Select a single item in the shared group library first.
glf-error-not-in-folder = The file has to be directly in the shared folder, not in a subfolder or anywhere else.
glf-error-invalid-name = Zotero can’t use this filename. Please rename the file in the shared folder (avoid / \ : * ? " < > |) and try again.
glf-error-choose-library = Select the library or a collection of a linked group first.
glf-config-no-group = No group chosen for this link yet.
glf-check-no-folder = No shared folder chosen on this computer.
glf-webdav-error-login = WebDAV login missing or wrong. Check the user name and the WebDAV password (HU-Box: set it in the HU-Box web settings under “WebDAV Access”).
glf-webdav-error-network = The WebDAV server can’t be reached.
glf-webdav-error-notfound = This folder doesn’t exist on the WebDAV server.
glf-webdav-error-status = The WebDAV server reported an error (HTTP { $status }).
glf-webdav-empty = The WebDAV folder is empty.
glf-error-file-missing = The file can’t be found anymore.
glf-error-generic = Something went wrong: { $message }

## Status (Tools menu and settings)

glf-not-configured = No group linked yet. Add one under Settings → Group Linked Files.
glf-group-not-found = The selected group (ID { $id }) isn’t in this Zotero library yet. Sync first.
glf-check-group = Group: { $name }
glf-check-folder = Shared folder: { $path }
glf-check-folder-missing = Shared folder not found on this computer: { $path }
glf-check-counts = { $total } attachments · { $found } found · { $missing } missing
glf-check-published = Copied to the shared folder just now: { $count }
glf-check-renamed = Renamed because the name was taken: { $list }
glf-check-errors = Could not be copied: { $list }
glf-check-stranded = In Zotero Storage instead of the shared folder (probably added without the plugin): { $count }
glf-check-no-webdav = No WebDAV folder set up on this computer yet.
glf-check-webdav = WebDAV folder: { $url }
glf-check-webdav-error = WebDAV folder { $url }: { $error }
glf-check-local = Downloaded to this computer: { $count } of { $total }
glf-check-missing-list = Missing files (not in the shared folder on this computer):
glf-check-more = …and { $count } more

## Settings pane

glf-prefs-intro = Each linked group keeps its files in a shared folder (for example HU-Box) instead of Zotero Storage. Files still open in Zotero’s reader, and annotations sync through Zotero as usual. Zotero file syncing is turned off for linked groups only. Each group has its own folder and file naming.
glf-prefs-group = Group
glf-prefs-group-none =
    .label = — None —
glf-prefs-folder = Shared folder on this computer
glf-prefs-choose =
    .label = Choose…
glf-prefs-status-title = Status
glf-prefs-check =
    .label = Check Now
glf-prefs-naming-title = File Names
glf-prefs-naming-enabled =
    .label = Name new files with this scheme
glf-prefs-naming-help = Placeholders: { $tokens }. If the name is taken, a, b, c … is added. “Link Matching Files” uses the same scheme.
glf-prefs-naming-template = Scheme
glf-prefs-naming-separator = Between authors
glf-prefs-naming-etal = For more authors
glf-prefs-naming-max = Max. authors in name
glf-prefs-naming-preview = Examples
glf-prefs-naming-transliterate =
    .label = Replace umlauts (ü → ue, ß → ss)
glf-prefs-naming-lowercase =
    .label = All lowercase
glf-prefs-links = Linked groups
glf-prefs-add =
    .label = Add Group…
glf-prefs-remove =
    .label = Remove
glf-prefs-empty = No group linked yet. Click “Add Group…” to link a group with a shared folder.
glf-prefs-config-nogroup = (no group chosen)
glf-prefs-config-nofolder = no folder
glf-prefs-remove-confirm = Remove the link for “{ $name }”? Files and items stay as they are; only this computer’s settings for the group are removed, and Zotero file syncing applies to the group again.
glf-prefs-same-folder = Another linked group uses the same folder. That works, but file names of both groups then share one folder.
glf-prefs-mode = Where the files are
glf-prefs-mode-folder =
    .label = Local folder (e.g. synced by the HU-Box client)
glf-prefs-mode-webdav =
    .label = WebDAV (HU-Box directly, without the client)
glf-prefs-webdav-server = WebDAV address
glf-prefs-webdav-path = Folder on the server
glf-prefs-webdav-browse =
    .label = Browse…
glf-prefs-webdav-user = User name
glf-prefs-webdav-password = WebDAV password
glf-prefs-webdav-save =
    .label = Save & Test
glf-prefs-webdav-help = HU-Box: set a WebDAV password once in the HU-Box web interface (Settings → WebDAV Access); the user name is shown there too. The password is kept in Zotero’s password storage on this computer. Files are downloaded when you open them.
glf-prefs-webdav-ok = Connected: { $files } files in this folder.
glf-prefs-webdav-browse-title = Choose the folder on the server
glf-prefs-webdav-browse-use = ✓ Use this folder: { $path }
glf-prefs-webdav-browse-up = ↑ Up
glf-prefs-download-all =
    .label = Download All Files
glf-prefs-download-progress = Downloading { $done } of { $total } …
glf-prefs-download-done = Downloaded: { $count }
