## v0.4.0 — ChatGPT sign-in for Korean abstract translation

Translate abstracts without entering an API key by delegating authentication and model requests to the official Codex CLI.

- Make Codex OAuth the default provider for newly enabled translation while preserving the v0.3.0 OpenAI-compatible API option.
- Add Zotero configuration and Tools-menu sign-in flows for ChatGPT.
- Keep OAuth credentials under Codex CLI control; the plugin does not read or store token files.
- Pass only the abstract through a short-lived temporary file to an ephemeral, read-only Codex run, then remove it.
- Cache translations by source text, provider, model, and prompt; run Codex translations sequentially and retain source-abstract fallback.
- Retain literature-note synchronization, the title dashboard, Obsidian new-tab opening, Zotero Markdown tabs, and conflict-safe shared editing.

Requires Zotero 9.0.x, a configured local Obsidian vault, and the official Codex CLI for ChatGPT translation. Codex requests use the signed-in account's available allowance.

## v0.3.0 — Optional Korean abstract translation

Create literature notes with Korean abstracts through a user-configured OpenAI-compatible endpoint. The fixed translation instruction keeps technical terms, method/model/dataset names, acronyms, equations, code identifiers, organizations, and proper nouns in English.

- Cache translations locally and translate again only when the source abstract, endpoint, model, or translation prompt changes.
- Continue synchronization with the source abstract if translation fails.
- Keep an optional Bearer key separate from the main connector configuration and require HTTPS for non-local endpoints.
- Retain the Zotero Markdown tabs, shared-file editing, draft recovery, and external-change handling introduced in v0.2.0.

## v0.2.0 — Read and edit your Obsidian notes inside Zotero

Right-click a paper or its PDF reader and choose **Open Obsidian note in Zotero tab**. A Markdown editor and preview open the same file used by Obsidian, using the connector's existing paper-to-note mapping.

### What's new

- Edit personal notes and frontmatter; bibliographic details remain managed by Zotero.
- Save with **Ctrl+S / ⌘S** or the **저장** button. Each changed file keeps its previous revision as `.bridge-bak`.
- Reuse the existing tab when reopening a paper, and follow renamed notes inside the configured folder.
- Detect external changes every two seconds, merge updated bibliographic details, and block saving when personal edits conflict.
- Recover unsaved drafts when reopening a note after closing its tab or disabling/restarting the connector. Drafts stay in local Zotero preferences until saved or explicitly discarded; tabs themselves do not reopen automatically.
- Continue using **Open in Obsidian** for the separate Obsidian application.

### 설치 및 사용

아래 `.xpi` 파일을 Zotero의 **도구 → 플러그인 → 톱니바퀴 → 파일에서 플러그인 설치**로 설치하세요. 기존 버전 위에 업데이트할 수 있습니다. 처음 설치한 경우 **Tools → Zotero–Obsidian Connector: Configure…**에서 vault와 노트 폴더를 설정하세요.

논문 우클릭 → **Open Obsidian note in Zotero tab** → 메모 편집 → **저장**으로 사용합니다. Obsidian에서도 같은 Markdown 파일을 사용합니다. 충돌 시 현재 파일 비교 화면과 저장 전 초안을 함께 보존합니다.

### Validation and limits

- 23 automated tests and 20 checks in an isolated Zotero 9.0.6 profile passed on Windows.
- The preview supports basic Markdown. Obsidian plugins, wikilink navigation, math, tables and embedded media require Obsidian. Raw note HTML is inert and remote images are not loaded automatically.
- External writes were simulated against the shared file; the actual Obsidian UI and full application restart were not retested for this version. macOS and Linux remain unverified. Keep vault backups: cross-application saves cannot be fully locked.

Requires Zotero 9.0.x and a configured local Obsidian vault. See [validation details](https://github.com/kimstitute/zotero-obsidian-connector/blob/v0.2.0/docs/VALIDATION.md) and the [Korean guide](https://github.com/kimstitute/zotero-obsidian-connector/blob/v0.2.0/docs/README.ko.md).
