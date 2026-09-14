<p align="center"><img src="assets/icon-256.png" width="128" alt="Interlocking red document and purple crystal"></p>

# Zotero–Obsidian Connector

**Your Zotero library, one literature note away.**

Automatically create Markdown literature notes in an Obsidian vault, browse papers by title in a dashboard, and move between a Zotero item and its note.

[한국어 안내](docs/README.ko.md) · [Release guide](docs/RELEASING.md) · [MIT license](LICENSE)

## Features

- One note per bibliographic item in personal and locally available group libraries.
- A `dashboard.md` with title links, first authors, and newest-year-first grouping.
- **Open in Obsidian** from a Zotero item's context menu; **Open in Zotero** inside each note.
- Automatic synchronization after item changes and on plugin startup.
- Stable item keys, duplicate protection, and support for renaming notes inside the configured folder.
- User-written content outside the generated block is preserved.
- No API key, cloud account, Obsidian community plugin, or AI service required at runtime.

## Requirements and status

Zotero **9.0.x**, Obsidian desktop, and an existing local vault. This is an early public release. Live synchronization, note preservation, renamed files, and opening Obsidian were verified on Windows. All 11 automated tests pass. Some UI interactions and macOS/Linux still need testing; see [validation details](docs/VALIDATION.md).

## Install and configure

1. Download `zotero-obsidian-connector-0.1.0.xpi` from [GitHub Releases](https://github.com/kimstitute/zotero-obsidian-connector/releases/latest), or build it below. Install the XPI, not GitHub's source-code ZIP.
2. In Zotero, select **Tools → Plugins → gear menu → Install Plugin From File**.
3. Select the XPI. Then select **Tools → Zotero–Obsidian Connector: Configure…**.
4. Enter your vault's full folder path (the folder containing `.obsidian`).
5. Enter a notes folder inside the vault, such as `Papers` or `Research/Papers`.
6. Open `dashboard.md` in that folder, or use **Tools → Open literature dashboard in Obsidian**.

Nothing is exported before configuration. Settings are stored in your local Zotero preferences, never in the plugin package. Changing the destination does not move or delete old notes. Disable any earlier custom connector before pointing this plugin at the same folder, to avoid two writers.

## Writing notes

For everyday use:

| Task | Action |
| --- | --- |
| Browse papers by title | Open the configured folder's `dashboard.md` and click a title in Obsidian reading mode. |
| Zotero → Obsidian | Right-click one paper in Zotero and select **Open in Obsidian**. |
| Obsidian → Zotero | Click **Open in Zotero** in the paper note. Allow the application link if prompted. |
| Refresh manually | Select **Tools → Sync literature notes to Obsidian** in Zotero. |
| Change the destination | Run **Tools → Zotero–Obsidian Connector: Configure…** again. |

Keep Zotero running for automatic synchronization. Obsidian does not need a separate connector plugin. In Obsidian editing mode, use Ctrl+click (Cmd+click on macOS) for links, or switch to reading mode.

The plugin owns only the block between `<!-- zotero-bridge:…:begin -->` and `<!-- zotero-bridge:…:end -->`. Write your thoughts under **My notes** or elsewhere outside that block. Keep the marker comments intact.

Filenames use stable Zotero keys. Use the dashboard to browse by title. Renaming a note inside the notes folder is supported; run a full sync to refresh dashboard links. Moving notes into another folder is not supported.

Trashed/deleted items disappear from the dashboard, but their Markdown files remain. Standalone attachments, Zotero notes, annotations, RSS feeds, and trash are excluded. PDFs and annotations are not exported. Your Markdown is not written back into Zotero.

## Development

Node.js 20+ for tests; Python 3.10+ for packaging. No package installation is needed.

```sh
npm test
python scripts/build.py
```

The XPI appears in `dist/`. Build with `--repository OWNER/REPOSITORY` to embed real GitHub release/update URLs; see the [release guide](docs/RELEASING.md).

## Privacy and recovery

The connector does not upload notes or metadata and includes no analytics. Zotero may contact GitHub for plugin update checks in published builds. Your vault's own sync services and other plugins operate independently.

Generated notes contain bibliographic metadata and item keys; local settings contain your vault path. The local status JSON may contain filesystem paths or error details. Do not publish these files in bug reports without reviewing them. The source package contains only synthetic test data and generic examples.

Each changed file keeps its preceding version as `.bridge-bak`. This is not full version history. Simultaneous external saves cannot be fully locked; keep normal vault backups. Disabling/removing the plugin stops synchronization and leaves notes in place.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This is an independent community project, not an official Zotero or Obsidian product. Product names belong to their respective owners.
