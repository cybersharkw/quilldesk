# QuillDesk 0.3.0

A private Windows writing application with original branding and implementation. Electron, React and Tiptap provide a local writing desk with a chapter/scene binder, rich text, corkboard, outline and recovery tools. No account, server, subscription or network connection is required to use the packaged app.

This is a tested early release for personal use, not a claim of Scrivener feature parity or independently certified production readiness. No files from FantasybuchProjekt were read or modified.

## Run the Windows application

Open `../releases/0.3.0/QuillDesk-win32-x64/QuillDesk.exe`. Keep the entire `QuillDesk-win32-x64` directory together; the executable depends on its adjacent files. The package is Windows x64 and is not code-signed. There is no installer or automatic updater. Node.js is not needed for the packaged application.

Choose **Neues Buch beginnen**, enter a working title, and choose a new `.quill` filename in a local folder you control. Use **Projekt → Öffnen** for an existing project. The last successfully opened project is remembered. A sample project is available from the welcome screen; it does not become a saved project until you choose a location.

Use a local disk for active writing. Network shares and third-party synchronized folders have not been tested. Projects, exports, and backups are unencrypted files accessible to your Windows account and anyone with access to those files.

## Writing and organization

- **Schreibmappe:** The four permanent collections are Manuskript, Recherche, Figuren, and Welt & Schauplätze. Add scenes, notes, or folders with the plus button. Folders may contain nested chapters and scenes.
- **Reordering:** Drag an entry to the top/bottom edge of another entry to insert before/after it. Drop in the middle of a folder to move inside it. The inspector's parent-folder selector and up/down buttons provide a keyboard-friendly alternative. Moves into the item's own descendants are rejected.
- **Text:** Tiptap provides bold, italic, underline, highlighting, headings, lists, blockquotes, undo and redo. Undo history belongs to the currently mounted document and resets when switching documents, views or restoring a snapshot. Unicode and German prose are preserved. Bundled German and English dictionaries check spelling offline. Right-click an underlined word, or use Nächster, for suggestions and project-specific learned words. Language and personal dictionary are saved per project. There is no grammar checker.
- **Pinnwand / Gliederung:** These show the direct children of the selected folder, or siblings of the selected scene. Synopsis and status are shared with the inspector. Open a card/document title to write its text. The separate Manuskript tab displays the whole manuscript recursively; click an entry to edit it in place. Export-excluded entries remain visible and are labeled.
- **Split editor:** The two-column toolbar button opens an independent second text pane. Choose any other scene or note in Zweiter Text. Each pane saves to its own document; the same document cannot be opened twice. The inspector initially hides to make room.
- **Inspector:** Rename documents, set status/color, write synopsis and private notes, move documents, set word goals, opt individual entries into export, and manage text snapshots.
- **Search:** Searches titles, prose, synopsis and notes throughout the project, excluding trash. This is case-insensitive plain substring search, with no regex or replace-all.
- **Goals:** Manuscript progress counts included documents in the manuscript collection. Session progress is net word growth since opening the project; deleting words reduces that figure. Session targets/counters are temporary, not a daily statistics history.
- **Focus:** F11 hides the binder and inspector; Escape restores them. Ctrl+Plus/Minus changes interface zoom through the native View menu.
- **Trash:** Removing a folder moves its whole subtree to trash. Restore the group from Papierkorb. There is deliberately no permanent-delete operation for manuscript documents in this version.

## Automatic reopening (0.2.1)

The last successfully opened project reopens automatically. Startup shows a loading screen until that attempt finishes. The last-project location is recorded on open, save and normal close; a second session record recovers a missing or malformed primary preference file. If the manuscript is temporarily unavailable, the welcome screen keeps a **Weiter an …** button that retries its saved location without a file picker. This session record contains a path and title, not a backup of the book itself.

## Reader view and writing position (0.3.0)

**Buch lesen** shows the complete included manuscript in binder order, with the same content and heading rules as export. Chapter headings appear by default; scene names are internal by default. Green names and an **intern** badge identify a hidden heading. The prose still appears. The inspector's **Titel im Buch anzeigen** controls the heading separately from **Text in Buchausgabe aufnehmen**, which controls that entry's prose. Excluding a folder affects its own content, not its selected descendants. Notes, synopsis, research and trash never appear in the book. A heading typed directly into the prose is part of that prose and is not hidden by the title checkbox.

Publication settings are now stored in the project, including title page, fonts and heading defaults. Individual title choices override the scene default; the global headings checkbox can hide all generated headings. The reader is a continuous view, not a pagination preview: inspect exported PDF for final page breaks and page numbers.

The app remembers the selected chapter or scene, cursor/selection, scroll, view, split editor and inspector, including the active combined-manuscript editor and reader scroll. These preferences are stored separately under the local app profile's `workspaces` folder and flushed on normal close. They do not change the book text. Preferences are per project path and computer, so moving a book or using another computer starts a fresh workspace. Existing positions from versions before 0.3 cannot be recovered retrospectively. Changed window sizes or fonts can shift the visual scroll position. Invalid/deleted document references safely fall back to a live document.

This follows the separate-sections, whole-manuscript and compile workflow described in [Scrivener's official overview](https://www.literatureandlatte.com/scrivener/overview). It remains an independent application with a smaller feature set.

## Saving and recovery

The `.quill` file is UTF-8 JSON, format `quilldesk`, schema version 1. It contains the project hierarchy, metadata, Tiptap documents, trash and text snapshots. You can move a project between local folders while QuillDesk is closed.

1. Autosave runs after approximately 400 ms without changes; continuous typing triggers a save after approximately two seconds. A blue/green **Gespeichert** indicator is shown only after successful disk writing. Ctrl+S also flushes changes.
2. Each update is schema-validated, serialized to a sibling temporary file, flushed with `fsync`, then renamed over the live file. All persistence operations are serialized in the main process. Initial creation uses an exclusive new file and never overwrites an existing project.
3. Before replacing the live file, the prior valid file is written atomically to `<project>.quill.previous`.
4. When changes are saved, at most once per minute the prior revision is also stored in `<project>.quill.backups`. The latest **120 automatic** revisions are retained. Manual checkpoints and pre-restore safety copies are not pruned automatically. No backup is created merely because time passes without editing.
5. **Projekt → Sicherungen** lists the previous revision and versioned copies. **Jetzt sichern** records the current saved project. Restoring first creates a `before-restore` copy of the current project, then replaces the project with the selected version.
6. **Momentaufnahmen** are per-document text-only revisions. They do not restore title, metadata or hierarchy. Restoring first preserves current text in another snapshot. There is a maximum of 30 snapshots per document; the app asks you to remove one instead of silently discarding history.
7. Closing normally flushes outstanding edits. On failure the window stays open and offers a route back to saving; closing without saving requires a separate explicit selection. A process crash or power failure can lose input that had not reached the saved state. Filesystem/hardware power-loss guarantees cannot be established by this application alone.
8. If another program changes or removes the project file, QuillDesk refuses to overwrite it. **Als neue Datei sichern / Speichern unter** preserves your in-memory version in a separate file. It does not merge conflicting changes.
9. If a project is corrupt, use **Projekt → Öffnen**, select its `.previous` file or a `.quill` file from its `.backups` folder, then **Speichern** to create a new live project. Opening these recovery files does not autosave over them.

Copy the project and its backup folder to a separate drive regularly. Backups beside the project do not protect against disk loss. Keep the application directory separate from the folder holding your actual book projects. The application's session preference is stored in `%APPDATA%\quilldesk\session.json`; this records the last project path, not a cloud copy of your manuscript.

## Google Drive and versioned external copies

Click the cloud icon, then **Sicherungsordner wählen**, and select a folder already synced by Google Drive for desktop. No Google account login or direct Google API integration is built into QuillDesk. This destination setting belongs to the Windows application profile, applies to projects opened there, and is remembered across restarts. Your actual Drive folder has not been selected automatically.

The live project remains local. After changes, QuillDesk writes complete dated copies under **QuillDesk-Sicherungen / project-ID-hash**, approximately once a minute and when closing. Each copy includes all project text, metadata, trash, personal dictionary and snapshots. Writes use temporary files, flush and rename, then checksum and schema verification. Existing copies are never overwritten or automatically pruned. Storage grows over time. A missing sync root is not silently recreated; pending changes are retried when it returns. Local autosaving continues independently. Closing warns if the extra copy could not be confirmed.

**In Sicherungsordner kopiert** confirms a verified local file, not a completed Google upload. Check Drive’s sync status yourself. Google Drive for desktop uploads the selected folder; keep it available offline as appropriate. See [Google’s stream/mirror guidance](https://support.google.com/drive/answer/13401938?hl=en-PA). No software can guarantee that data can never be lost. A separate backup and occasional restore check are still useful.

To recover, open a generated .quill copy from its QuillDesk-Sicherungen subfolder, then save it as a new working project. QuillDesk treats those generated files as recovery drafts, preserving the original. If you move a backup elsewhere, copy it before editing. Turning off extra copies does not delete existing files. Copies are unencrypted; choose a private folder. Test coverage uses a local simulated sync folder, including disconnection/retry; actual Google Drive upload, account settings and cloud restore have not been tested.

## Import and export

**Projekt → Texte importieren** accepts UTF-8 TXT/Markdown, UTF-16 with a byte-order marker, and DOCX. Up to 20 files can be selected together. Each becomes a new document in the selected folder (or beside the selected scene). Originals are read only. The whole batch is read before it is added, so a rejected file does not leave a partial batch.

Import takes plain paragraph text. Markdown stays literal text. DOCX formatting, images, comments, footnotes, headers, tracked changes and other complex features are not preserved. Deleted tracked-change text is omitted. ZIP expansion is bounded before parsing; XML entity declarations are rejected. Limits: 10 MB compressed/input per file, 25 MB aggregate DOCX uncompressed size, 2,000 archive entries, five million imported text characters.

**Exportieren** compiles only checked entries under **Manuskript**, recursively in binder order. Research, characters, world notes and trash are excluded. An unchecked folder skips that folder's own title/text, not its individually checked descendants. Select title/author front matter, chapter headings, optional scene titles and chapter page breaks. Scene titles are omitted by default, so internal planning labels stay out of the manuscript. PDF and DOCX can be opened without QuillDesk; follow each publisher’s submission rules. For example, [Piper requests PDF and rejects Word files](https://www.piper.de/service/manuskripteinsendungen).

- **DOCX:** Editable Word document with headings, bold/italic/underline/strike/highlight, lists and alignment. A4, 25 mm margins, configurable Times New Roman / Georgia / Courier New, 10–14 pt options and 1 / 1.5 / 2 line spacing. Defaults: Times New Roman 12 pt, 1.5 spacing. Optional page-number fields. Some complex list nesting/blockquotes use simpler formatting.
- **PDF:** Local Chromium printing, A4 with 25 mm margins. Same font/size/line-spacing choices and optional page numbers. Text formatting and chapter breaks are supported. No cloud conversion.
- **TXT:** UTF-8, optional titles/author and scene separators; no rich formatting or page breaks.

There are no EPUB/MOBI/Fountain exports, custom compile templates, footnotes, citations, custom running headers, print dialog, or Scrivener `.scriv` importer. Exports are separate files and cannot replace the currently open project. Save dialogs ask before replacing an existing export.

## Known scope and limits

- One project/window per application profile; no collaboration, live multi-device editing, timeline, annotations/comments, revision comparison, plugins or embedded research PDFs/media.
- Basic hierarchy/metadata editing has no global undo; use trash, snapshots or project backups. Text editor undo is document-local.
- Project limit: 50 MB serialized JSON, 10,000 documents, hierarchy depth 80. Very large projects close to these limits and day-long writing sessions have not been performance-tested. Whole-project JSON saving trades simplicity and inspectability for greater I/O on large projects.
- One Windows x64 machine was used for verification. Installer behavior, other Windows configurations, touch input, screen readers, USB/network/removable storage and power-loss behavior were not independently tested.
- The supplied package is unsigned. It is a functional early release, with the limitations above, rather than an exact Scrivener clone.

## Development

Use Node.js 22.18 or newer compatible with the locked dependencies. From this directory:

```powershell
npm.cmd ci
node node_modules/electron/install.js
npm.cmd run build
npm.cmd start
```

Electron 44 downloads its runtime on installation/first use; the second command explicitly ensures it is present. Building from source requires network access for dependency downloads. Runtime operation is offline.

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run package
```

`test` runs Node tests for integrity, failure injection, backups, hierarchy, import and export. `test:ui` launches the real Electron application through Playwright using an isolated test profile and projects under `../../work/ui-tests`. It replaces native file-dialog return values inside that test process; it exercises the actual renderer, preload, IPC, main process and files. Tests do not touch your writing projects. The test-only profile override is disabled in packaged builds.

`package` builds an unpacked portable Windows x64 application in `../releases/0.3.0/QuillDesk-win32-x64`. Source modules are in `src` (interface), `shared/model.mjs` (project schema and hierarchy), and `electron` (trusted filesystem/import/export layer). The renderer is sandboxed, has no Node API, and receives only a narrow validated IPC bridge. A custom local protocol serves bundled assets. External network requests and permissions are denied; external navigation/window creation is blocked.

## Workflow references and licenses

The workflow scope was researched from Literature & Latte's official documentation, including the [Windows manual](https://www.literatureandlatte.com/docs/Scrivener_Manual-Win.pdf), [binder/corkboard/outliner overview](https://www.literatureandlatte.com/blog/integrating-scriveners-binder-corkboard-and-outliner), [inspector](https://www.literatureandlatte.com/blog/get-to-know-the-scrivener-inspector), and [snapshots](https://www.literatureandlatte.com/blog/use-snapshots-in-scrivener-to-save-versions-of-your-projects). Implementation follows [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and uses [Tiptap](https://tiptap.dev/docs/editor/getting-started/install/react). No proprietary code, logos or assets were copied. QuillDesk is not affiliated with Literature & Latte.

QuillDesk source: MIT, see `LICENSE`. Third-party software retains its own licenses, present in `node_modules` in the source distribution and inside the packaged `resources/app.asar` archive. Electron/Chromium license files are supplied with the runtime. The bundled German dictionary (igerman98 / dictionary-de) is GPL-2.0-or-3.0; dictionary-en includes its SCOWL/Hunspell notices. Their exact license files are preserved with the dictionaries, and copies are in third-party-licenses. These dictionary licenses are separate from QuillDesk’s MIT source license. nspell is MIT. UI icons are Lucide (ISC); the application icon is an original geometric feather asset.

## Codex project registration

This chat has its own independent workspace, but no named QuillDesk sidebar project was registered automatically. Add an existing local folder as a project using Codex's Projects sidebar, and select:

`C:\Users\jansc\Documents\Codex\2026-10-14\quilldesk`

Name it **QuillDesk**. The editable source is in `outputs\QuillDesk-source` inside that workspace. No private Codex state was modified to register it. This location is separate from `FantasybuchProjekt`.
