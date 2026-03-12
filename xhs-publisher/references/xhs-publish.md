# XHS Publish via OpenClaw Chrome Relay

把小红书图文自动发布链路迁移到任意安装了 OpenClaw 的机器上，最低要求不是“复制脚本”，而是满足以下前提：

- 机器已安装 OpenClaw
- 机器本地 Chrome 可用
- OpenClaw Browser Relay / Chrome extension 可用
- Chrome 中已登录小红书创作平台
- 目标发布页 tab 已 attach 到 relay
- 当前网络可访问 `creator.xiaohongshu.com` / `www.xiaohongshu.com`

---

## 1. 文件

- `scripts/xhs-preflight.mjs`：环境体检脚本
- `scripts/xhs-publish.mjs`：发布脚本

---

## 2. 用户侧准备

在目标机器上：

1. 打开 Chrome
2. 登录小红书创作平台
3. 打开：
   - `https://creator.xiaohongshu.com/publish/publish?from=menu&target=image`
4. 确保 OpenClaw Browser Relay 已 attach 当前 tab

如果没有 attach，这条链路不会成立。

---

## 3. 先跑 preflight

```bash
node scripts/xhs-preflight.mjs
```

可选参数：

```bash
node scripts/xhs-preflight.mjs \
  --port 18792 \
  --config ~/.openclaw/openclaw.json \
  --match-url creator.xiaohongshu.com/publish/publish \
  --open-if-missing
```

### preflight 主要检查

- relay `/json/version` 可访问
- relay `/json/list` 可访问
- 能找到目标发布页 tab
- 页面不是错误页
- 页面存在 file input
- 页面文本处于“上传图文 / 图片编辑 / 发布笔记”相关状态

---

## 4. 发布单图

```bash
node scripts/xhs-publish.mjs \
  --file /path/to/image.jpg \
  --title "标题" \
  --content "正文"
```

只做上传+填充，不点击发布。

### 真正发布

```bash
node scripts/xhs-publish.mjs \
  --file /path/to/image.jpg \
  --title "标题" \
  --content "正文" \
  --publish
```

---

## 5. 发布多图

### 方式 A：直接传多个文件

```bash
node scripts/xhs-publish.mjs \
  --files /path/a.jpg,/path/b.jpg,/path/c.jpg \
  --title "标题" \
  --content "正文" \
  --publish
```

### 方式 B：从目录加载图片

```bash
node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "标题" \
  --content "正文" \
  --publish
```

目录内会自动读取常见图片格式：

- png
- jpg
- jpeg
- webp
- gif

---

## 6. 自动找 tab

默认会优先按以下方式找目标页：

1. `--target-id`（如果显式给了）
2. `--match-url` URL 子串匹配
3. `--open-if-missing` 自动新开发布页

示例：

```bash
node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "标题" \
  --content "正文" \
  --publish \
  --match-url creator.xiaohongshu.com/publish/publish \
  --open-if-missing
```

---

## 7. 发布后收尾

`--publish` 模式下，脚本会自动做这些事情：

1. 等待发布成功页
2. 跳到笔记管理页
3. 按标题回收 `noteId`
4. 生成公开链接：
   - `https://www.xiaohongshu.com/explore/<noteId>`
5. 持续检查公开页是否可见

---

## 8. 公开可见性轮询

默认：

- 每 3 分钟检查一次
- 最长检查 1 小时

可通过参数覆盖：

```bash
node scripts/xhs-publish.mjs \
  --file /path/to/image.jpg \
  --title "标题" \
  --content "正文" \
  --publish \
  --public-check-every-ms 180000 \
  --public-check-timeout-ms 3600000
```

如果公开页仍不可见，脚本会返回：

- `visible: false`
- `timedOut: true`
- `reason`

常见原因：

- 审核中
- 小红书公开侧同步延迟
- 当前笔记暂时无法浏览

---

## 9. 常见问题

### Q1. `/json/list` Unauthorized
说明 relay token 没带对，或者 config/gateway token 不对。

### Q2. 找不到 target
说明：
- 发布页没打开
- tab 没 attach
- `--match-url` 不对

### Q3. 页面掉到 `chrome-error://chromewebdata/`
这通常是：
- 网络问题
- 代理问题
- 小红书侧连接断开

### Q4. 图片一直处理中
说明图片已进入 uploader，但平台内部处理未完成。不要只看按钮是否可点，要看处理状态是否真正清掉。

### Q5. 发布成功但公开链接打不开
这是正常可能情况。后台 noteId 已存在，不代表公开页立刻可见。

---

## 10. 迁移到别的 OpenClaw 机器的最短步骤

1. 复制脚本与文档
2. 在目标机器安装 / 配置 OpenClaw
3. 确保 Chrome relay 可用
4. 登录小红书创作平台
5. attach 发布页 tab
6. 先跑 `xhs-preflight.mjs`
7. 再跑 `xhs-publish.mjs`

---

## 11. 推荐流程

```bash
node scripts/xhs-preflight.mjs --open-if-missing
node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "OpenClaw 新能力：小红书自动发布正式可用" \
  --content "这里写正文" \
  --publish \
  --open-if-missing
```

这套流程适合先在单机稳定跑通，再封装成 skill。
