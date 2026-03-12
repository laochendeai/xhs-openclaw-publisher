#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { basename, extname, resolve, join } from 'node:path';

const DEFAULT_PORT = 18792;
const DEFAULT_SELECTOR = 'input[type="file"][accept*=".jpg"][accept*=".png"]';
const DEFAULT_TARGET_ID = '69624EA8F880E3CC427DFE92C1BAF0BE';
const DEFAULT_FILE = '/tmp/openclaw/uploads/xhs-diary-2026-03-11.png';
const DEFAULT_CONFIG = '/home/leo-cy/.openclaw/openclaw.json';
const RELAY_TOKEN_CONTEXT = 'openclaw-extension-relay-v1';

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    selector: DEFAULT_SELECTOR,
    targetId: DEFAULT_TARGET_ID,
    matchUrl: 'creator.xiaohongshu.com/publish/publish',
    openIfMissing: false,
    file: DEFAULT_FILE,
    files: [],
    filesFromDir: null,
    config: DEFAULT_CONFIG,
    timeoutMs: 20000,
    settleMs: 8000,
    chunkSize: 6000,
    publicCheckEveryMs: 180000,
    publicCheckTimeoutMs: 3600000,
    title: 'OpenClaw 自动发布链路验证',
    content: '这是一条由 OpenClaw Chrome relay + 页面分块注入上传链路完成的自动化验证笔记。\n\n已确认图片进入 uploader，并推进到站点真实上传阶段。',
    publish: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) continue;
    const [rawKey, inlineValue] = part.split('=', 2);
    const key = rawKey.slice(2);
    if (key === 'help') {
      options.help = true;
      continue;
    }
    if (key === 'publish') {
      options.publish = true;
      continue;
    }
    if (key === 'open-if-missing') {
      options.openIfMissing = true;
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value == null) throw new Error(`missing value for --${key}`);
    if (key === 'port') options.port = Number.parseInt(value, 10);
    else if (key === 'selector') options.selector = value;
    else if (key === 'target-id') options.targetId = value;
    else if (key === 'match-url') options.matchUrl = value;
    else if (key === 'file') options.file = value;
    else if (key === 'files') options.files = value.split(',').map((item) => item.trim()).filter(Boolean);
    else if (key === 'files-from-dir') options.filesFromDir = value;
    else if (key === 'config') options.config = value;
    else if (key === 'timeout-ms') options.timeoutMs = Number.parseInt(value, 10);
    else if (key === 'settle-ms') options.settleMs = Number.parseInt(value, 10);
    else if (key === 'chunk-size') options.chunkSize = Number.parseInt(value, 10);
    else if (key === 'public-check-every-ms') options.publicCheckEveryMs = Number.parseInt(value, 10);
    else if (key === 'public-check-timeout-ms') options.publicCheckTimeoutMs = Number.parseInt(value, 10);
    else if (key === 'title') options.title = value;
    else if (key === 'content') options.content = value;
    else throw new Error(`unknown argument: --${key}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/xhs-publish.mjs [options]\n\nOptions:\n  --file <path>                  Single local file path to upload\n  --files <a,b,c>                Comma-separated local file paths for multi-image posts\n  --files-from-dir <dir>         Load all image files from a directory\n  --title <text>                 Note title\n  --content <text>               Note content/body\n  --publish                      Actually click publish button\n  --target-id <id>               CDP target id (optional when auto-discovery is enough)\n  --match-url <text>             Target URL substring for auto-discovery\n  --open-if-missing              Open publish page if no matching tab is found\n  --selector <css>               Hidden file input selector\n  --port <n>                     Relay/CDP port (default: ${DEFAULT_PORT})\n  --config <path>                OpenClaw config path\n  --chunk-size <n>               Base64 chunk size per Runtime.evaluate (single-file mode)\n  --timeout-ms <n>               CDP command timeout in ms\n  --settle-ms <n>                Wait time after major steps in ms\n  --public-check-every-ms <n>    Public visibility poll interval (default: 180000)\n  --public-check-timeout-ms <n>  Public visibility overall timeout (default: 3600000)\n  --help                         Show this message\n\nBehavior:\n  - draft-only: upload + fill + report page state\n  - --publish: publish, recover noteId, then poll public visibility until visible or timeout\n`);
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

function guessMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function splitBase64(base64, chunkSize) {
  const chunks = [];
  for (let index = 0; index < base64.length; index += chunkSize) chunks.push(base64.slice(index, index + chunkSize));
  return chunks;
}

function isImageFile(filePath) {
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(filePath).toLowerCase());
}

function collectInputFiles(options) {
  const files = [];
  if (options.filesFromDir) {
    const dir = resolve(options.filesFromDir);
    const entries = readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((fullPath) => statSync(fullPath).isFile() && isImageFile(fullPath))
      .sort();
    files.push(...entries);
  }
  if (options.files?.length) files.push(...options.files.map((item) => resolve(item)));
  if (options.file) files.push(resolve(options.file));
  const unique = [...new Set(files)].filter(Boolean);
  if (unique.length === 0) throw new Error('no input files specified');
  for (const filePath of unique) {
    if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
  }
  return unique;
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

class CdpClient {
  constructor({ wsUrl, timeoutMs }) {
    this.wsUrl = wsUrl;
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.pending = new Map();
    this.eventHandlers = new Set();
    this.ws = null;
  }

  async connect() {
    await new Promise((resolvePromise, rejectPromise) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolvePromise(), { once: true });
      ws.addEventListener('error', (error) => rejectPromise(error), { once: true });
      ws.addEventListener('close', (event) => {
        const error = new Error(`websocket closed (${event.code}) ${event.reason || ''}`.trim());
        for (const { reject, timer } of this.pending.values()) {
          clearTimeout(timer);
          reject(error);
        }
        this.pending.clear();
      });
      ws.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data.toString());
        if (typeof payload.id === 'number') {
          const entry = this.pending.get(payload.id);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.pending.delete(payload.id);
          if (payload.error) entry.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
          else entry.resolve(payload.result ?? {});
          return;
        }
        for (const handler of this.eventHandlers) handler(payload);
      });
    });
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP timeout for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function evalParams(expression, { returnByValue = true } = {}) {
  return { expression, awaitPromise: true, returnByValue, userGesture: true };
}

async function uploadFiles(cdp, sessionId, options, filePaths, networkEvents) {
  const files = filePaths.map((filePath) => {
    const fileBuffer = readFileSync(filePath);
    return {
      path: filePath,
      name: basename(filePath),
      mimeType: guessMimeType(filePath),
      size: fileBuffer.length,
      base64: fileBuffer.toString('base64'),
    };
  });

  const before = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const input = document.querySelector(${JSON.stringify(options.selector)});
    return {
      readyState: document.readyState,
      href: location.href,
      found: !!input,
      accept: input?.accept ?? null,
      multiple: !!input?.multiple,
      filesLen: input?.files?.length ?? 0,
    };
  })()`), sessionId);
  if (!before?.result?.value?.found) throw new Error(`selector not found: ${options.selector}`);

  const injectResult = await cdp.send('Runtime.evaluate', evalParams(`(async () => {
    const input = document.querySelector(${JSON.stringify(options.selector)});
    if (!input) return { ok: false, reason: 'missing-input' };
    const transfer = new DataTransfer();
    const payloads = ${JSON.stringify(files.map((item) => ({ name: item.name, mimeType: item.mimeType, base64: item.base64, size: item.size })))};
    for (const payload of payloads) {
      const bin = atob(payload.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      transfer.items.add(new File([bytes], payload.name, { type: payload.mimeType, lastModified: Date.now() }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    let dropTarget = input.parentElement;
    while (dropTarget && dropTarget !== document.body) {
      const className = String(dropTarget.className || '');
      if (/(upload|drag|drop)/i.test(className)) break;
      dropTarget = dropTarget.parentElement;
    }
    let dropTriggered = false;
    if (dropTarget) {
      for (const name of ['dragenter', 'dragover', 'drop']) {
        dropTarget.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer }));
      }
      dropTriggered = true;
    }
    const assigned = Array.from(input.files || []).map((item) => ({ name: item.name, size: item.size, type: item.type }));
    return { ok: true, filesLen: input.files?.length ?? 0, assigned, dropTriggered };
  })()`), sessionId);

  await sleep(options.settleMs);

  const after = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const input = document.querySelector(${JSON.stringify(options.selector)});
    const bodyText = document.body?.innerText || '';
    const previewArea = document.querySelector('.img-preview-area');
    const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]')).map((item) => ({
      className: item.className || '', src: item.getAttribute('src') || '', width: item.naturalWidth || 0, height: item.naturalHeight || 0,
    }));
    return {
      filesLen: input?.files?.length ?? 0,
      fileNames: Array.from(input?.files || []).map((item) => item.name),
      hints: {
        hasUploadingText: /上传中|上传|处理中|图片|发布/.test(bodyText),
        previewCount: document.querySelectorAll('img, [class*="preview"], [class*="cover"]').length,
        previewAreaText: (previewArea?.innerText || '').trim(),
        blobImgCount: blobImgs.length,
        blobImgs: blobImgs.slice(0, 5),
      }
    };
  })()`), sessionId);

  const uploadRelatedRequests = networkEvents
    .filter((item) => item.type === 'request' && typeof item.url === 'string')
    .filter((item) => /(upload|image|creator|xiaohongshu|oss|cos|file|sns)/i.test(item.url))
    .slice(-30);

  return {
    files: files.map(({ path, name, size, mimeType }) => ({ path, name, size, mimeType })),
    before: before.result.value,
    inject: injectResult.result.value,
    after: after.result.value,
    uploadRelatedRequests,
  };
}

async function sendKey(cdp, sessionId, params) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params }, sessionId);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, sessionId);
}

async function setTitleAndContent(cdp, sessionId, options) {
  const titleFocus = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const titleInput = document.querySelector('input[placeholder*="标题"], input.d-text');
    if (!titleInput) return { ok: false, reason: 'missing-title-input' };
    titleInput.focus();
    titleInput.select?.();
    return { ok: true, active: document.activeElement === titleInput, existingValue: titleInput.value || '' };
  })()`), sessionId);
  if (!titleFocus.result.value?.ok) return titleFocus.result.value;

  for (let i = 0; i < 80; i += 1) {
    await sendKey(cdp, sessionId, { windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, code: 'Backspace', key: 'Backspace' });
  }
  await cdp.send('Input.insertText', { text: options.title }, sessionId);

  const editorFocus = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const editor = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"].tiptap, [contenteditable="true"].ProseMirror');
    if (!editor) return { ok: false, reason: 'missing-editor' };
    editor.focus();
    return { ok: true, active: document.activeElement === editor, existingText: (editor.innerText || '').trim() };
  })()`), sessionId);
  if (!editorFocus.result.value?.ok) return editorFocus.result.value;

  await sendKey(cdp, sessionId, { windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, code: 'KeyA', key: 'a', modifiers: 2 });
  await sendKey(cdp, sessionId, { windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, code: 'Backspace', key: 'Backspace' });
  await cdp.send('Input.insertText', { text: options.content }, sessionId);

  const result = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const titleInput = document.querySelector('input[placeholder*="标题"], input.d-text');
    const editor = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"].tiptap, [contenteditable="true"].ProseMirror');
    const counter = document.body.innerText.match(/(\d+)\/1000/);
    return {
      ok: true,
      titleValue: titleInput?.value || '',
      editorText: (editor?.innerText || '').trim(),
      editorHtml: editor?.innerHTML || '',
      bodyCount: counter ? Number(counter[1]) : null,
      titleLength: (titleInput?.value || '').length,
      editorLength: (editor?.innerText || '').trim().length,
    };
  })()`), sessionId);
  return result.result.value;
}

async function publishIfRequested(cdp, sessionId, shouldPublish) {
  const result = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => /发布/.test(item.innerText || item.textContent || ''));
    if (!button) return { ok: false, reason: 'missing-publish-button' };
    const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
    const text = (button.innerText || button.textContent || '').trim();
    if (${shouldPublish ? 'true' : 'false'} && !disabled) button.click();
    return { ok: true, text, disabled, clicked: ${shouldPublish ? '(!disabled)' : 'false'} };
  })()`), sessionId);
  return result.result.value;
}

async function collectFinalState(cdp, sessionId, networkEvents) {
  const page = await cdp.send('Runtime.evaluate', evalParams(`(() => {
    const titleInput = document.querySelector('input[placeholder*="标题"], input.d-text');
    const editor = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"].tiptap, [contenteditable="true"].ProseMirror');
    const publishButton = Array.from(document.querySelectorAll('button')).find((item) => /发布/.test(item.innerText || item.textContent || ''));
    const previewText = document.body?.innerText || '';
    return {
      url: location.href,
      title: titleInput?.value ?? null,
      content: (editor?.innerText || '').trim(),
      contentHtml: editor?.innerHTML || '',
      publishButton: publishButton ? {
        text: (publishButton.innerText || publishButton.textContent || '').trim(),
        disabled: !!publishButton.disabled || publishButton.getAttribute('aria-disabled') === 'true'
      } : null,
      hasSuccessHint: /成功|已发布|发布成功|审核中/.test(previewText),
      bodySnippet: previewText.slice(0, 1200),
    };
  })()`), sessionId);

  return {
    page: page.result.value,
    recentRequests: networkEvents.slice(-50),
  };
}

async function resolveTarget(targets, options, baseUrl) {
  if (options.targetId) {
    const byId = targets.find((item) => item.id === options.targetId);
    if (byId) return byId;
  }
  const byUrl = targets.find((item) => typeof item.url === 'string' && item.url.includes(options.matchUrl));
  if (byUrl) return byUrl;
  if (!options.openIfMissing) return null;
  const response = await fetch(`${baseUrl}/json/new?${new URLSearchParams({ token: deriveRelayToken(loadGatewayToken(options.config), options.port), url: 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image' }).toString()}`);
  const created = await response.json();
  return created;
}

async function waitForPublishSuccess(cdp, sessionId, { timeoutMs = 120000, pollMs = 3000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await cdp.send('Runtime.evaluate', evalParams(`(() => {
      const text = document.body?.innerText || '';
      return {
        url: location.href,
        hasSuccessText: /发布成功|已发布|审核中/.test(text),
        bodySnippet: text.slice(0, 1200),
      };
    })()`), sessionId);
    const value = state.result.value;
    if (/\/publish\/success/.test(value.url) || value.hasSuccessText) return value;
    await sleep(pollMs);
  }
  return null;
}

async function recoverNoteMeta(cdp, sessionId, title, { attempts = 8, waitMs = 3000 } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    await cdp.send('Page.navigate', { url: 'https://creator.xiaohongshu.com/new/note-manager' }, sessionId);
    await sleep(waitMs + index * 500);
    const expression = "(() => { const title = " + JSON.stringify(title) + "; const items = Array.from(document.querySelectorAll('[data-impression]')).map((el) => { const text = (el.innerText || '').trim(); const impression = el.getAttribute('data-impression') || ''; const noteIdMatch = impression.match(/\\\"noteId\\\":\\\"([^\\\"]+)\\\"/); return { text, noteId: noteIdMatch ? noteIdMatch[1] : null, impression: impression.slice(0, 800) }; }).filter((item) => item.text); const exactWithNoteId = items.find((item) => item.noteId && item.text.includes(title)); const exact = items.find((item) => item.text.includes(title)); const firstWithNoteId = items.find((item) => item.noteId) || null; const first = items[0] || null; const chosen = exactWithNoteId || firstWithNoteId || exact || first; return { found: !!chosen, exact: !!exact, exactWithNoteId: !!exactWithNoteId, noteId: chosen?.noteId || null, titleText: chosen?.text || null, publicUrl: chosen?.noteId ? ('https://www.xiaohongshu.com/explore/' + chosen.noteId) : null, items: items.slice(0, 5), bodySnippet: (document.body?.innerText || '').slice(0, 1000) }; })()";
    const result = await cdp.send('Runtime.evaluate', evalParams(expression), sessionId);
    const value = result.result.value;
    if (value?.noteId) return value;
  }
  return { found: false, noteId: null, publicUrl: null };
}

async function verifyPublicNoteVisible(publicUrl) {
  if (!publicUrl) return { checked: false, visible: false, reason: 'missing-public-url' };
  try {
    const response = await fetch(publicUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    const html = await response.text();
    const finalUrl = response.url;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const blocked404 = /\/404\?|error_code=300031|页面不见了|当前笔记暂时无法浏览|Page Isn\'t Available Right Now/i.test(finalUrl + '\n' + html);
    const visible = response.ok && !blocked404;
    return {
      checked: true,
      status: response.status,
      visible,
      finalUrl,
      title,
    };
  } catch (error) {
    return { checked: true, visible: false, reason: String(error?.message || error), publicUrl };
  }
}

async function waitForPublicVisibility(publicUrl, { everyMs = 180000, timeoutMs = 3600000 } = {}) {
  if (!publicUrl) return { checked: false, visible: false, reason: 'missing-public-url' };
  const startedAt = Date.now();
  let attempt = 0;
  let lastResult = null;
  while (Date.now() - startedAt <= timeoutMs) {
    attempt += 1;
    const result = await verifyPublicNoteVisible(publicUrl);
    lastResult = {
      ...result,
      attempt,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      publicUrl,
    };
    if (lastResult.visible) return lastResult;
    if (Date.now() - startedAt + everyMs > timeoutMs) break;
    await sleep(everyMs);
  }
  return {
    ...(lastResult || { checked: true, visible: false }),
    visible: false,
    timedOut: true,
    timeoutMs,
    everyMs,
    publicUrl,
    reason: lastResult?.reason || 'not-visible-before-timeout',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const inputFiles = collectInputFiles(options);

  const gatewayToken = loadGatewayToken(options.config);
  const relayToken = deriveRelayToken(gatewayToken, options.port);
  const q = encodeURIComponent(relayToken);
  const baseUrl = `http://127.0.0.1:${options.port}`;
  const targets = await (await fetch(`${baseUrl}/json/list?token=${q}`)).json();
  const target = await resolveTarget(targets, options, baseUrl);
  if (!target) throw new Error(`target not found: id=${options.targetId || '(auto)'} matchUrl=${options.matchUrl}`);

  const cdp = new CdpClient({ wsUrl: `${target.webSocketDebuggerUrl}?token=${q}`, timeoutMs: options.timeoutMs });
  const networkEvents = [];
  await cdp.connect();
  cdp.onEvent((payload) => {
    if (payload.method === 'Network.requestWillBeSent') {
      networkEvents.push({
        type: 'request',
        url: payload.params?.request?.url,
        method: payload.params?.request?.method,
        postDataLength: payload.params?.request?.postData?.length ?? 0,
      });
    }
    if (payload.method === 'Network.responseReceived') {
      networkEvents.push({
        type: 'response',
        url: payload.params?.response?.url,
        status: payload.params?.response?.status,
        mimeType: payload.params?.response?.mimeType,
      });
    }
  });

  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: options.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('DOM.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    const upload = await uploadFiles(cdp, sessionId, options, inputFiles, networkEvents);
    const draft = await setTitleAndContent(cdp, sessionId, options);
    await sleep(1500);
    const publish = await publishIfRequested(cdp, sessionId, options.publish);
    let publishSuccess = null;
    let noteMeta = null;
    let publicVisibility = null;
    if (options.publish && publish?.ok && publish?.clicked) {
      publishSuccess = await waitForPublishSuccess(cdp, sessionId, { timeoutMs: Math.max(options.settleMs, 120000), pollMs: 3000 });
      noteMeta = await recoverNoteMeta(cdp, sessionId, options.title, { attempts: 10, waitMs: 3000 });
      publicVisibility = await waitForPublicVisibility(noteMeta?.publicUrl, {
        everyMs: options.publicCheckEveryMs,
        timeoutMs: options.publicCheckTimeoutMs,
      });
    } else {
      await sleep(1000);
    }
    const finalState = await collectFinalState(cdp, sessionId, networkEvents);

    console.log(JSON.stringify({
      ok: true,
      mode: options.publish ? 'publish' : 'draft-only',
      target: { id: target.id, title: target.title, url: target.url },
      upload,
      draft,
      publish,
      publishSuccess,
      noteMeta,
      publicVisibility,
      finalState,
    }, null, 2));
  } finally {
    cdp.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.stack || error) }, null, 2));
  process.exitCode = 1;
});
