# Group Linked Files for Zotero

Keep a Zotero **group library's PDFs in a shared folder** (for example a HU-Box/Seafile library) instead of Zotero Storage – and still **open and annotate them in Zotero's own reader**.

Zotero doesn't allow linked files in group libraries, and group files can only sync through the group owner's Zotero Storage quota. This plugin works around that without changing Zotero's data model:

| | Where it lives | Synced by |
|---|---|---|
| Items, notes, **annotations** | Zotero database | Zotero data sync (free, unlimited) |
| **PDF files** | Shared folder, e.g. HU-Box | Seafile / your sync client |

German team guide: [docs/ANLEITUNG.md](docs/ANLEITUNG.md)

## How it works

- Attachments in the group are ordinary *stored-file* attachments. Their **filename is the link**: `<shared folder>/<filename>`. Zotero syncs the filename; the file itself never goes to Zotero's servers.
- If Zotero can't find a stored file in its own storage folder, the plugin resolves it to the shared folder. The reader, full-text indexing and "Show File" all use that path.
- **Zotero file syncing is switched off for this one group only.** Other groups and My Library are unaffected, and nobody has to change Zotero settings.
- A PDF added to the group the normal way (drag & drop, Add File) is **copied into the shared folder** about a minute later, after Zotero has finished renaming it.
- Existing PDFs in the shared folder are attached with **right-click → "Attach File from Shared Folder…"** – nothing is copied.

## Guardrails

The plugin never renames, moves or deletes anything in the shared folder, and it stops Zotero from doing so:

- Renaming a shared file from Zotero (incl. "Rename File from Parent Metadata") is blocked.
- "Delete attachment file" is blocked. Deleting the *item* and emptying the trash only removes it from Zotero; the file stays.
- Rotating or deleting pages and moving annotations into the PDF are blocked – Zotero never writes into a shared PDF.
- Zotero's full-text cache is kept in Zotero's local storage, never in the shared folder.
- New files are copied in with *no-overwrite*. If the name is already taken by a different file, the new attachment gets a unique name (`… (2).pdf`) first.
- If the shared folder is missing (not synced, drive unplugged), the plugin does nothing.

Every one of these is covered by automated tests that run inside real Zotero builds (see below).

## Install

1. Download `group-linked-files-x.y.z.xpi` from the [latest release](https://github.com/pad-mac/Zotero-Group-Linked-Files/releases/latest).
2. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…** and choose the file.
3. **Settings → Group Linked Files**: choose the group and the shared folder on this computer.

Updates install automatically. Every team member needs the plugin; without it, the group's PDFs can't be opened in Zotero on that computer (they're still in the shared folder).

## Limitations

- **Flat folder**: files must be directly in the shared folder, not in subfolders.
- **Don't rename files in the shared folder.** That breaks the link for everyone. *Tools → Group Linked Files → Check Shared Folder Now* lists missing files.
- Desktop only: Zotero for iOS/Android and the web library don't get the PDFs.
- Metadata, notes and annotation text still sync through Zotero's servers. Only the files stay in the shared folder.
- Group files that were previously stored in Zotero Storage are no longer downloaded once the plugin is active. Files already on a computer are copied into the shared folder automatically.
- It relies on Zotero internals (`getFilePath`, `getFilePathAsync`, `Zotero.Sync.Storage.Local.getEnabledForLibrary`, …). These have been stable for years, but a Zotero update can break the plugin. If that happens, nothing is lost: the PDFs are in the shared folder and the annotations in Zotero.

## Development

```sh
npm test                 # unit tests (Node, no dependencies)
npm run build            # build/group-linked-files-<version>.xpi + update.json
npm run test:zotero      # run the plugin inside a real Zotero (Linux + Xvfb)
ZOTERO_CHANNEL=beta npm run test:zotero
ZOTERO_VERSION=7.0.24 npm run test:zotero
```

The integration test installs the built `.xpi` into a fresh Zotero profile, creates a group, and checks: attaching from the folder, opening in the reader, saving annotations, full-text indexing, every guardrail, the per-group sync switch, copying new files, trash handling, menus, localization and clean shutdown.

Tested with Zotero **7.0.24, 9.0.6, 10.0.6 and 11.0 beta 1**.

**CI** runs the unit tests and the Zotero tests (current release, beta, oldest supported 7.0) on every push and **every Monday**. If the weekly run fails, it opens an issue – usually before a new Zotero version reaches the team.

**Release**: bump `version` in `manifest.json`, then push a tag (`git tag v0.1.1 && git push --tags`). The workflow tests the built `.xpi` inside Zotero and publishes it with `update.json`; installed copies update themselves.

**Report a problem**: *Tools → Group Linked Files → Report a Problem…* opens a prefilled GitHub issue (or an e-mail, if `extensions.group-linked-files.reportEmail` is set).

## License

AGPL-3.0-or-later, like Zotero.
