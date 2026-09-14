# Contributing

Open an issue describing the expected behavior, actual behavior, Zotero/Obsidian versions, and operating system. Use invented paper titles and a minimal test vault whenever possible. Remove personal paths, library exports, credentials, and unpublished research from reports.

Keep synchronization idempotent and preserve text outside managed blocks. Never delete a user's notes automatically. Add focused tests for data preservation, identity mapping, and configuration validation when changing those behaviors.

Run `npm test` and `python scripts/build.py` before submitting changes. Keep the plugin dependency-free at runtime. Contributions are under the MIT license.
