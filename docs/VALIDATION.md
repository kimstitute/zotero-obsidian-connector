# Validation

## v0.2.0 internal Markdown tabs (2026-09-15)

- **23 automated tests** pass: shared-file edits, metadata merging, external-edit conflicts, rename tracking, missing files, stopped sessions, draft recovery, pending-save races, tab cleanup, and safe previews.
- **20 integration checks** pass in an isolated Zotero **9.0.6** profile and synthetic vault. The source add-on loads with a test-only startup hook, excluded from the production XPI.
- Real Zotero checks cover menus and tabs, tab reuse, visible editor dimensions, read-only metadata, inert raw HTML, writes and backups, external reload, close/reopen draft recovery, conflict comparison, explicit reload, metadata updates, rename tracking, and disable cleanup/draft retention.
- Build syntax and archive contents are checked separately. No real user vault or library is used. Obsidian-side writes are simulated through IOUtils; actual Obsidian UI interaction and application restart recovery have not been retested for this version. Unit tests recover drafts using a new editor manager and the same preferences.
- The preview implements basic Markdown only. Writes use the existing backup scheme and a final content comparison; another process can still write during the narrow interval after that check.

Windows integration verification (standard Zotero installation):

```powershell
node scripts/prepare-smoke.cjs
.\scripts\run-smoke.ps1
```

Read the reported `result.json`. Profiles, vaults, logs, and detailed results stay under ignored `work/` and must not be published.

## Earlier external-app validation

Validated on Windows with Zotero 9.0.6 and Obsidian 1.13.7.

- All 11 automated tests pass.
- The packaged XPI installs and runs in Zotero.
- Configuration dialogs render; configuration was submitted using Zotero's dialog API because desktop keyboard automation could not reliably focus the prompts.
- A complete local library synchronizes without errors. Repeated synchronization is idempotent.
- An item notification triggers another synchronization without changing bibliographic records.
- Handwritten content survives synchronization. Renaming a note with Korean characters, spaces and parentheses updates the dashboard target without recreating the old filename.
- The dashboard and a renamed paper note open in Obsidian using the connector's commands; the destination was checked in the application.
- Source and nested release archives pass a private-data scan. PNG metadata is stripped; builds are reproducible and release URL/hash generation is checked.

Not yet verified: physical keyboard completion of setup, clicking a dashboard title and the Obsidian-to-Zotero backlink end to end, full application restart, or macOS/Linux. Desktop input testing stopped when concurrent user input was detected. Mock tests cover generated links but do not establish operating-system behavior.

Validation used private local data that is excluded from this repository and release archives.
