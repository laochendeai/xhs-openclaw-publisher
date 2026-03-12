# Changelog

## 0.1.0 - 2026-03-12

Initial public release.

### Added
- `scripts/xhs-preflight.mjs` for relay / target tab / page-state checks
- `scripts/xhs-publish.mjs` for Xiaohongshu single-image and multi-image publishing
- noteId recovery after successful publish
- public URL generation and visibility polling
- `xhs-publisher/` OpenClaw skill packaging
- Chinese README and deployment docs

### Notes
- Relies on an already logged-in Chrome session attached to OpenClaw Browser Relay
- Does not automate login
