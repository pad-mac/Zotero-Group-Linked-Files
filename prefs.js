// Default preferences. Zotero loads this file automatically for plugins.

// Group links, set in the plugin's settings pane (per computer): a JSON list of
//   { id, groupID, basePath, naming: { enabled, template, authorSeparator, etAl,
//     maxAuthors, noYear, noAuthor, transliterate, lowercase } }
// groupID is the Zotero group ID (zotero.org/groups/<ID>); basePath is the shared
// folder on this computer. Default naming: {authors}_{year}, umlauts replaced,
// lowercase -> mueller_1987, mueller-schmidt_1990, weber-ua_2004; taken names get
// a, b, ...
pref("extensions.group-linked-files.groups", "[]");

// Seconds an attachment must stay unchanged before it is copied to the shared folder.
// Gives Zotero time to rename new files from parent metadata first.
pref("extensions.group-linked-files.publishDelaySeconds", 60);

// Where "Report a problem" sends people. If reportEmail is set, an e-mail is opened;
// otherwise a prefilled GitHub issue.
pref("extensions.group-linked-files.reportEmail", "");
pref("extensions.group-linked-files.reportURL", "https://github.com/pad-mac/Zotero-Group-Linked-Files/issues/new");
