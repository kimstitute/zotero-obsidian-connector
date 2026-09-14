# Validation

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
