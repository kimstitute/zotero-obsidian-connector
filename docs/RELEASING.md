# Releasing on GitHub

This repository includes `.github/workflows/release.yml`. Pushing a `vVERSION` tag runs the tests, checks that the tag matches both version fields, builds for this repository, and publishes the XPI, checksum, and update manifest to GitHub Releases. GitHub Actions must be enabled. The following steps also describe manual release preparation.

1. Create an empty public repository named `zotero-obsidian-connector` (or choose another name).
2. Upload this source directory only. Do not upload a vault, Zotero profile, local settings, old custom builds, or generated notes.
3. Run tests and build for the actual repository:

```sh
npm test
python scripts/build.py --repository OWNER/REPOSITORY
```

4. Create a release tag such as `v0.3.0` matching `src/manifest.json` and `package.json`.
5. Attach the generated XPI, its `.sha256` file, and `updates.json` from `dist/` to that release. Mark it as the latest release if you want the latest-download update endpoint to resolve to it.

The build script writes the correct versioned XPI URL and SHA-256 hash into `updates.json`. It includes no filesystem paths, local preferences, credentials, or library exports. Archive entries have fixed timestamps and permissions.

Without `--repository`, the build is for local testing. Zotero requires an HTTPS update URL, so local builds use a reserved `.invalid` placeholder; update checks cannot succeed until you rebuild with your real repository. Do not publish that local-testing XPI as a release.

When changing versions, update both version fields, rerun tests, rebuild, and use the corresponding `vVERSION` tag. Test setup, startup, note creation, dashboard links, and both URI directions on each operating system claimed in release notes.

If using git, select the author name and email you intend to make public (for example a GitHub-provided no-reply email). This source package contains no git history or author email.
