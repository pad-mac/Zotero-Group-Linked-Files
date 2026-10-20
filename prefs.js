// Default preferences. Zotero loads this file automatically for plugins.

// Zotero group ID (as in zotero.org/groups/<ID>) whose files live in the shared folder.
// 0 = not configured.
pref("extensions.group-linked-files.groupID", 0);

// Absolute path of the shared folder on this computer (e.g. the synced HU-Box library).
// Set per computer in the plugin's settings pane.
pref("extensions.group-linked-files.basePath", "");

// Seconds an attachment must stay unchanged before it is copied to the shared folder.
// Gives Zotero time to rename new files from parent metadata first.
pref("extensions.group-linked-files.publishDelaySeconds", 60);

// Where "Report a problem" sends people. If reportEmail is set, an e-mail is opened;
// otherwise a prefilled GitHub issue.
pref("extensions.group-linked-files.reportEmail", "");
pref("extensions.group-linked-files.reportURL", "https://github.com/pad-mac/Zotero-Group-Linked-Files/issues/new");
