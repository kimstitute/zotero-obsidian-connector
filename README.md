<a id="top"></a>

<p align="center">
  <img src="assets/icon-256.png" width="160" alt="Zotero–Obsidian Connector logo">
</p>

<h1 align="center">Zotero–Obsidian Connector</h1>

<p align="center">
  <strong>Your papers. Your notes. Connected.</strong><br>
  Turn your Zotero library into a browsable collection of Obsidian literature notes.
</p>

<p align="center">
  <a href="https://github.com/kimstitute/zotero-obsidian-connector/releases/latest"><img src="https://img.shields.io/github/v/release/kimstitute/zotero-obsidian-connector?style=flat-square&amp;color=8b5cf6&amp;label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748b?style=flat-square" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Zotero-9.0.x-cc2936?style=flat-square" alt="Requires Zotero 9.0.x">
  <img src="https://img.shields.io/badge/Obsidian-desktop-7c3aed?style=flat-square" alt="Obsidian desktop">
</p>

<p align="center">
  <a href="https://github.com/kimstitute/zotero-obsidian-connector/releases/latest"><strong>Download plugin</strong></a>
  &nbsp;·&nbsp; <a href="#quick-start">Quick start</a>
  &nbsp;·&nbsp; <a href="docs/README.ko.md">한국어</a>
  &nbsp;·&nbsp; <a href="https://github.com/kimstitute/zotero-obsidian-connector/issues">Report an issue</a>
</p>

---

## Overview

Keep references in Zotero and your thinking in Obsidian. The connector creates one Markdown note per paper, keeps bibliographic details up to date, and builds a dashboard where you can browse by **paper title**.

**Zotero library → Markdown notes → Title dashboard**

Open a note from Zotero, or follow its backlink to the original item. The core connector needs no API key, AI service, or Obsidian community plugin. Korean abstract translation is optional; the default translation path uses ChatGPT sign-in through the official Codex CLI, with an OpenAI-compatible endpoint retained as an advanced option.

Opening a paper or dashboard from Zotero uses a **new Obsidian tab**, keeping your current tab in place.

You can also **read and edit a paper's Markdown note in a Zotero tab**. Both apps use the same file in your configured vault.

<p align="center">
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#quick-start">Installation</a> &nbsp;·&nbsp;
  <a href="#everyday-use">Usage</a> &nbsp;·&nbsp;
  <a href="#questions">FAQ</a> &nbsp;·&nbsp;
  <a href="#development">Development</a>
</p>

## Features

| | What you get |
| :--- | :--- |
| **📄 Literature notes** | One Markdown file per bibliographic item in personal and locally available group libraries. |
| **🗂️ Title dashboard** | A `dashboard.md` with paper titles, first authors, and newest-year-first grouping. |
| **🔗 App-to-app navigation** | **Open in Obsidian** from Zotero; **Open in Zotero** from each note. |
| **📝 Notes inside Zotero** | A Markdown editor and basic preview, with draft recovery and external-change detection. |
| **🔄 Automatic updates** | Synchronization on startup and after Zotero item changes. |
| **🌐 Korean abstracts** | Optionally translate abstracts while keeping technical terms, model and dataset names, acronyms, and proper nouns in English. |
| **✍️ Your notes stay yours** | Handwritten content outside the generated block is preserved. |
| **🏷️ Rename support** | Rename files inside the configured notes folder; the next sync updates dashboard links. |

## Quick start

### 1. Install

You need **Zotero 9.0.x**, **Obsidian desktop**, and an existing local Obsidian vault.

Download the `.xpi` file from **[the latest release](https://github.com/kimstitute/zotero-obsidian-connector/releases/latest)**. In Zotero, open:

**Tools → Plugins → ⚙ → Install Plugin From File**

Select the downloaded XPI. GitHub's “Source code” ZIP is for development, not installation.

### 2. Choose your vault

Open **Tools → Zotero–Obsidian Connector: Configure…** and enter:

| Setting | What to enter |
| :--- | :--- |
| **Vault path** | The full path to your existing vault—the folder containing `.obsidian`. |
| **Notes folder** | A folder inside that vault, such as `Papers` or `Research/Papers`. |

Settings remain in your local Zotero preferences. No files are generated before configuration.

### 3. Open your dashboard

Select **Tools → Open literature dashboard in Obsidian**, then click a paper title in reading mode to open its note.

Your vault will contain a structure like this:

```text
Your vault/
└── Papers/
    ├── dashboard.md          # Browse by paper title
    ├── library-ABCD1234.md   # Bibliographic details + your notes
    └── library-EFGH5678.md
```

*Illustrative filenames; no personal library data is included.*

> [!NOTE]
> This is an early release. Live synchronization, note preservation, renaming, and opening Obsidian were verified on Windows. Some UI interactions and macOS/Linux remain unverified. See [validation details](docs/VALIDATION.md).

## Everyday use

| I want to… | Do this |
| :--- | :--- |
| **Browse my papers** | Open `dashboard.md` and choose a title. |
| **Open a paper's note** | Right-click one Zotero paper → **Open in Obsidian**. |
| **Edit inside Zotero** | Right-click a paper → **Open Obsidian note in Zotero tab**. Also available in the PDF reader. |
| **Return to Zotero** | Click **Open in Zotero** in the Markdown note. |
| **Refresh everything** | Zotero **Tools → Sync literature notes to Obsidian**. |
| **Change the destination** | Run **Tools → Zotero–Obsidian Connector: Configure…** again. |

Keep Zotero running for automatic updates. In Obsidian editing mode, use **Ctrl+click** (**Cmd+click** on macOS) for links, or switch to reading mode. Allow the application link if your system prompts you.

### A place for your own thinking

Each note includes a title, authors, date, publication, DOI, tags, abstract, and Zotero backlink. Write your own thoughts under **My notes** and connect ideas under **Related notes**.

The connector updates only the section enclosed by `<!-- zotero-bridge:…:begin -->` and `<!-- zotero-bridge:…:end -->`. Keep these comments intact and write outside them.

### Read and edit inside Zotero (v0.2.0)

Choose **Open Obsidian note in Zotero tab** from a paper or its PDF reader. The connector uses the existing identity mapping, including notes renamed inside the configured folder. If the note does not exist, normal synchronization creates it first. Reopening a paper selects its existing tab.

- Edit **내 노트 · Markdown** on the left; the right pane previews the whole note. Bibliographic metadata remains managed by Zotero. Expand **문서 앞부분 · 속성 편집** to edit frontmatter or text before the generated block.
- **저장** or **Ctrl+S / ⌘S** saves to the same `.md` file Obsidian uses. **Obsidian에서 열기** opens the last saved file in the app. **읽기 / 편집** toggles the editor pane.
- External changes are checked every two seconds. Clean tabs reload them. Metadata changes can merge with your draft; overlapping personal edits show the current file for comparison and block saving.
- On a conflict, copy the parts of your draft you need, then use **현재 파일 불러오기** and reconcile your edits. Reloading a dirty tab asks before discarding its draft. There is no force-overwrite button.
- Unsaved drafts are stored in local Zotero preferences and restored when that paper is reopened after closing the tab or restarting/disabling the connector. Tabs themselves are not restored automatically. Drafts contain note text, are not synchronized across devices, and stay associated with the original notes folder until saved or explicitly discarded.

This is a basic Markdown editor, not the embedded Obsidian application. The preview supports headings, bullets, bold text, code, and HTTP/Zotero links. Wikilink navigation, math, tables, embedded media, and Obsidian plugins require Obsidian. Raw HTML is displayed as text; previews do not load remote images or execute note code. Saves retain the previous revision as `.bridge-bak`; keep normal vault backups because cross-application writes cannot be fully locked.
### Optional Korean abstract translation

Run **Tools → Zotero–Obsidian Connector: Configure…** and enable abstract translation. Choose one of two providers. The translation instruction keeps technical terms, methods, model and dataset names, acronyms, equations, code identifiers, organizations, and proper nouns in English.

#### ChatGPT sign-in through Codex CLI (default)

1. Install the official [Codex CLI](https://developers.openai.com/codex/cli).
2. In the connector configuration, choose **1 = ChatGPT sign-in through Codex CLI**.
3. If needed, the connector starts the Codex browser sign-in. You can also run **Tools → Zotero–Obsidian Connector: Sign in to ChatGPT…** later.
4. Leave the model override blank to use the Codex CLI default.

The plugin never reads or stores Codex OAuth tokens. It asks the installed CLI to check sign-in and perform each translation. The abstract is written to a short-lived temporary file, translated in an ephemeral read-only Codex run, and removed afterward. Usage counts against the limits of the ChatGPT/Codex account used to sign in.

#### OpenAI-compatible endpoint (advanced)

Choose **2 = OpenAI-compatible endpoint**, then enter a `chat/completions` URL and model. This keeps the v0.3.0 workflow available for Ollama and compatible cloud services.

For a fully local setup with [Ollama](https://ollama.com/):

```sh
ollama pull qwen2.5:7b
```

Use these values in the connector:

| Setting | Local Ollama value |
| :--- | :--- |
| **Endpoint** | `http://127.0.0.1:11434/v1/chat/completions` |
| **Model** | `qwen2.5:7b` |
| **API key** | Leave blank |

Cloud services must use an HTTPS endpoint. If the service requires a Bearer key, enter it during configuration. The key is kept separately in local Zotero preferences and is never written to a Markdown note, status file, translation cache, or this repository.

Translations are cached in `.zotero-bridge-translations.json` inside the configured notes folder. An unchanged abstract is not sent again. Changing the source abstract, provider, endpoint, model, or translation prompt invalidates its cached translation. If the provider is unavailable or returns invalid data, synchronization continues with the original abstract and records a translation fallback in the status file.

## Questions

<details>
<summary><strong>Why do filenames contain item keys instead of titles?</strong></summary>

Stable keys keep each file tied to the same Zotero item when a title changes. The dashboard displays readable paper titles. You can rename a note inside the configured folder and run a full sync to refresh links. Moving notes to another folder is not supported.

</details>

<details>
<summary><strong>What happens when I delete a paper or change folders?</strong></summary>

Trashed or deleted papers disappear from the dashboard, but their Markdown files remain. Changing the destination does not move or delete old files. Disabling or removing the plugin stops synchronization and leaves notes in place.

If another connector already writes to the same folder, disable it before using this one there.

</details>

<details>
<summary><strong>Does this export PDFs, annotations, or my Obsidian edits?</strong></summary>

The connector exports bibliographic metadata and abstracts. Standalone attachments, Zotero notes, annotations, RSS feeds, and trash are excluded. PDFs are not copied, and Markdown edits are not written back into Zotero.

</details>

<details>
<summary><strong>Where does my data go?</strong></summary>

Notes are written to your selected local vault. The connector includes no analytics. When Korean translation is disabled, it does not send library metadata to a translation service. When translation is enabled, each uncached abstract is sent either through the signed-in Codex CLI to OpenAI or to the endpoint you configured. No title, author list, PDF, personal note, or vault file is added to the translation request. Published builds may contact GitHub to check for plugin updates. Your vault's sync services and other plugins operate independently.

Generated notes, the translation cache, local settings, and status/error files can contain item keys, metadata, translations, and filesystem paths. Review them before attaching them to public issue reports. Do not include an API key in a bug report.

Each changed file keeps its previous version as `.bridge-bak`. This is not full version history, and concurrent external saves cannot be fully locked. Keep normal vault backups.

</details>

## Development

**Node.js 20+** runs the tests; **Python 3.10+** builds the XPI. No package installation is needed.

```sh
git clone https://github.com/kimstitute/zotero-obsidian-connector.git
cd zotero-obsidian-connector
npm test
python scripts/build.py --repository kimstitute/zotero-obsidian-connector
```

Build artifacts appear in `dist/`. The suite covers synchronization, identity handling, handwritten content, renamed files, dashboard links, and configuration validation.

<details>
<summary><strong>Explore the project structure</strong></summary>

```text
src/          Plugin lifecycle, synchronization, and manifest
assets/       Original logo and plugin icons
tests/        Dependency-free automated tests
scripts/      Reproducible XPI builder
docs/         Korean guide, validation scope, and release instructions
.github/      Release workflow
```

</details>

See the **[release guide](docs/RELEASING.md)** for versioning, update URLs, and publishing.

## Contributing

Bug reports, documentation improvements, and platform testing are welcome. Read the [contribution guide](CONTRIBUTING.md), then [open an issue](https://github.com/kimstitute/zotero-obsidian-connector/issues) or submit a pull request. Include app versions and reproducible steps, with personal data removed.

## License

Released under the **[MIT License](LICENSE)**. This is an independent community project; Zotero and Obsidian names belong to their respective owners.

---

<p align="center">
  <a href="#top">Back to top ↑</a>
</p>
