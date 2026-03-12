# xhs-openclaw-publisher

Use OpenClaw Chrome Relay to publish Xiaohongshu image posts from a logged-in Chrome session.

## Included

- `scripts/xhs-preflight.mjs` — preflight checks for relay / target tab / page state
- `scripts/xhs-publish.mjs` — publish single-image or multi-image Xiaohongshu posts
- `docs/xhs-publish.md` — setup, usage, deployment notes

## Requirements

- OpenClaw installed on the machine
- OpenClaw Browser Relay / Chrome extension available
- Chrome logged into Xiaohongshu Creator Platform
- Attached publish tab in Chrome relay
- Network access to Xiaohongshu domains

## Quick start

```bash
node scripts/xhs-preflight.mjs --open-if-missing

node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "OpenClaw 新能力：小红书自动发布正式可用" \
  --content "这里写正文" \
  --publish \
  --open-if-missing
```

## Notes

This project relies on an existing logged-in human Chrome session and does not implement login automation.
