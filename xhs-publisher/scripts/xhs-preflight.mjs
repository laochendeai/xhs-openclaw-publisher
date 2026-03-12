#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const DEFAULT_PORT = 18792;
const DEFAULT_CONFIG = '/home/leo-cy/.openclaw/openclaw.json';
const RELAY_TOKEN_CONTEXT = 'openclaw-extension-relay-v1';
const DEFAULT_MATCH_URL = 'creator.xiaohongshu.com/publish/publish';

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    config: DEFAULT_CONFIG,
    matchUrl: DEFAULT_MATCH_URL,
    openIfMissing: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const [rawKey, inlineValue] = part.split('=', 2);
    const key = rawKey.slice(2);
    if (key === 'open-if-missing') {
      options.openIfMissing = true;
      continue;
    }
    if (key === 'help') {
      options.help = true;
      continue;
    }
    const value = inlineValue ?? argv[i + 1];
    if (inlineValue === undefined) i += 1;
    if (value == null) throw new Error(`missing value for --${key}`);
    if (key === 'port') options.port = Number.parseInt(value, 10);
    else if (key === 'config') options.config = value;
    else if (key === 'match-url') options.matchUrl = value;
    else throw new Error(`unknown argument: --${key}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/xhs-preflight.mjs [options]\n\nOptions:\n  --port <n>          Relay/CDP port (default: ${DEFAULT_PORT})\n  --config <path>     OpenClaw config path\n  --match-url <text>  Target URL substring to find publish tab\n  --open-if-missing   Open publish page if no matching tab exists\n  --help              Show this message\n`);
}

function loadGatewayToken(configPath) {
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || process.env.CLAWDBOT_GATEWAY_TOKEN?.trim();
  if (envToken) return envToken;
  const json = JSON.parse(readFileSync(configPath, 'utf8'));
  const token = typeof json?.gateway?.auth?.token === 'string' ? json.gateway.auth.token.trim() : '';
  if (!token) throw new Error(`gateway.auth.token missing in ${configPath}`);
  return token;
}

function deriveRelayToken(gatewayToken, port) {
  return createHmac('sha256', gatewayToken).update(`${RELAY_TOKEN_CONTEXT}:${port}`).digest('hex');
}

class CdpClient {
  constructor({ wsUrl, timeoutMs = 20000 }) {
    this.wsUrl = wsUrl;
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', reject, { once: true });
      ws.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data.toString());
        if (typeof payload.id !== 'number') return;
        const entry = this.pending.get(payload.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(payload.id);
        if (payload.error) entry.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
        else entry.resolve(payload.result ?? {});
      });
    });
  }
  async send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(message));
    });
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

function evalParams(expression) {
  return { expression, awaitPromise: true, returnByValue: true, userGesture: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const gatewayToken = loadGatewayToken(options.config);
  const relayToken = deriveRelayToken(gatewayToken, options.port);
  const q = encodeURIComponent(relayToken);
  const baseUrl = `http://127.0.0.1:${options.port}`;

  const versionRes = await fetch(`${baseUrl}/json/version?token=${q}`);
  const versionOk = versionRes.ok;
  const version = versionOk ? await versionRes.json() : null;

  const tabsRes = await fetch(`${baseUrl}/json/list?token=${q}`);
  if (!tabsRes.ok) throw new Error(`/json/list failed with status ${tabsRes.status}`);
  const tabs = await tabsRes.json();
  let target = tabs.find((item) => typeof item.url === 'string' && item.url.includes(options.matchUrl));

  if (!target && options.openIfMissing) {
    const created = await fetch(`${baseUrl}/json/new?${new URLSearchParams({ token: relayToken, url: 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image' }).toString()}`);
    if (created.ok) target = await created.json();
  }

  let pageState = null;
  if (target?.webSocketDebuggerUrl) {
    const cdp = new CdpClient({ wsUrl: `${target.webSocketDebuggerUrl}?token=${q}` });
    try {
      await cdp.connect();
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.id, flatten: true });
      await cdp.send('Runtime.enable', {}, sessionId);
      pageState = (await cdp.send('Runtime.evaluate', evalParams(`(() => {
        const text = document.body?.innerText || '';
        const href = location.href;
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((el) => ({ accept: el.accept, multiple: !!el.multiple }));
        let pageKind = 'other';
        if (/\/publish\/publish/.test(href) && /上传图文|上传图片/.test(text)) pageKind = 'publish-entry';
        else if (/\/publish\/publish/.test(href) && /图片编辑|发布/.test(text)) pageKind = 'publish-editor';
        else if (/\/new\/note-manager/.test(href)) pageKind = 'note-manager';
        else if (/\/publish\/success/.test(href)) pageKind = 'publish-success';
        else if (href.startsWith('chrome-error://')) pageKind = 'error';
        return {
          href,
          title: document.title,
          pageKind,
          fileInputs,
          hasPublishPage: /上传图文|上传图片|图片编辑|发布笔记/.test(text),
          hasErrorPage: href.startsWith('chrome-error://') || /ERR_|页面不见了/.test(text),
          bodySnippet: text.slice(0, 1000),
        };
      })()`), sessionId)).result.value;
    } finally {
      cdp.close();
    }
  }

  const checks = {
    configReadable: true,
    relayVersionOk: versionOk,
    relayListOk: true,
    targetFound: !!target,
    publishPageReady: !!pageState?.hasPublishPage,
    noErrorPage: pageState ? !pageState.hasErrorPage : false,
    fileInputFound: !!pageState?.fileInputs?.length,
  };

  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    relay: { port: options.port, version },
    target: target ? { id: target.id, title: target.title, url: target.url } : null,
    pageState,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.stack || error) }, null, 2));
  process.exitCode = 1;
});
