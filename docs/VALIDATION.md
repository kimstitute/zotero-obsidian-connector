# Validation

## v0.5.0 graphical settings (2026-09-16)

- **44 automated tests** pass, including validating and saving configuration without running a sync, preserving API keys, and excluding secrets from the GUI settings snapshot.
- **47 native Zotero 9.0.6 / Windows integration checks** pass, covering settings-pane registration/loading, usable field layout, translation/provider switching, masked key entry, save without file generation, inline errors, explicit sync, and inline ChatGPT login/logout with synthetic server responses. Existing synchronization/editor checks remain included.
- Device authorization and account-access limitations documented for v0.4.2 still apply. The folder picker uses Zotero's native FilePicker; no user vault or account is touched by the isolated tests. macOS/Linux remain untested.

## v0.4.2 standalone ChatGPT OAuth (2026-09-16)

- **43 automated tests** pass. New coverage exercises fresh-install login without any filesystem/CLI dependencies, device-code polling/backoff/timeout/cancellation, connector-only persistence, automatic token rotation, concurrent refresh, one bounded 401 retry, logout races, and rejecting partial responses without leaking tokens.
- **36 isolated Zotero 9.0.6 / Windows checks** pass, exercising the actual password manager and encrypted file, native fetch adapter, login menu and code panel, browser destination, logout, and existing note/editor synchronization. OAuth responses are synthetic for repeatable full-flow testing; no AIdea plugin or shared auth file is used.
- An opt-in live probe successfully obtained a device code directly from OpenAI inside Zotero, then cancelled before authorization. This verifies the real device-code endpoint and transport, **not** a newly approved account's token exchange, refresh, or model access. Those remaining live steps require the user's browser approval.
- Run `node scripts/prepare-smoke.cjs` and `scripts/run-smoke.ps1` for offline OAuth fixtures. Add `--live-oauth` to preparation to opt in to device-code issuance/cancellation. No account credentials are needed by either test mode.
- macOS/Linux and accounts with organization-specific authentication restrictions remain untested.

## v0.4.1 shared Codex OAuth session (2026-09-16)

- **33 automated tests** pass across synchronization, shared-file editing, Zotero tabs, safe previews, API translation, and Codex OAuth translation.
- OAuth tests cover AIdea/Codex session discovery without a CLI executable, JWT expiry handling, account routing headers, request payload minimization, streamed response parsing, browser-login fallback, and preventing token copies in plugin-managed files.
- Expired or missing credentials fail before the abstract request. Only the source abstract and translation instruction are included in the Codex request.
- A live request using an existing AIdea/Codex OAuth session succeeded both from the standalone module and inside an isolated Zotero **9.0.6** profile. The test used a synthetic public sentence, not a library item.
- The standard **21-check** Zotero integration suite remains independent of account access and does not make a model request.
- The ChatGPT Codex backend is not a public third-party API and remains subject to upstream protocol changes.

## v0.4.0 Codex CLI translation (2026-09-16)

- **31 automated tests** pass across synchronization, shared-file editing, Zotero tabs, safe previews, API translation, and Codex CLI translation.
- Codex tests cover executable discovery, CLI-owned login, provider migration, provider-aware caching, ephemeral read-only execution, structured output parsing, temporary-file cleanup, and keeping abstract text out of process arguments.
- The plugin never opens or parses a Codex authentication file. Unit tests verify that login is delegated to the CLI process.
- **21 integration checks** pass in an isolated Zotero **9.0.6** profile. The suite includes the packaged Codex module and verifies its sign-in menu without making a live model request.
- Not yet verified: a complete live ChatGPT translation initiated from Zotero, or Codex executable discovery on macOS/Linux. API-service compatibility remains provider-specific.

## v0.3.0 Korean abstract translation (2026-09-16)

- **27 automated tests** pass across synchronization, shared-file editing, Zotero tabs, safe previews, and translation behavior.
- Four translation tests cover the OpenAI-compatible request body and Bearer header, Korean abstract output, English-term preservation instructions, cache reuse and invalidation, source-abstract fallback, HTTPS validation, separation of API credentials from the main configuration, and reuse from the Zotero Markdown tab.
- **20 integration checks** pass with the v0.3.0 source in an isolated Zotero **9.0.6** profile, covering plugin load, menus, Markdown tabs, shared-file saves, backups, external changes, conflicts, renamed notes, and shutdown cleanup.
- The production XPI builds reproducibly, contains the v0.2.0 Markdown-tab modules, and passes private-path and credential-pattern scans.
- Not yet verified: a live Ollama or cloud translation service inside Zotero. The translation service is mocked in automated tests, so service-specific compatibility remains to be checked.

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

- All 11 synchronization tests passed at the time of this validation.
- The packaged XPI installs and runs in Zotero.
- Configuration dialogs render; configuration was submitted using Zotero's dialog API because desktop keyboard automation could not reliably focus the prompts.
- A complete local library synchronizes without errors. Repeated synchronization is idempotent.
- An item notification triggers another synchronization without changing bibliographic records.
- Handwritten content survives synchronization. Renaming a note with Korean characters, spaces and parentheses updates the dashboard target without recreating the old filename.
- The dashboard and a renamed paper note open in Obsidian using the connector's commands; the destination was checked in the application.
- Source and nested release archives pass a private-data scan. PNG metadata is stripped; builds are reproducible and release URL/hash generation is checked.

Not yet verified: physical keyboard completion of setup, clicking a dashboard title and the Obsidian-to-Zotero backlink end to end, full application restart, or macOS/Linux. Desktop input testing stopped when concurrent user input was detected. Mock tests cover generated links but do not establish operating-system behavior.

Validation used private local data that is excluded from this repository and release archives.
