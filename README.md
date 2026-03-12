# xhs-openclaw-publisher

基于 OpenClaw Chrome Relay 的小红书图文自动发布工具。

它的核心思路不是“模拟登录”，而是：

- 复用一台 **已经登录小红书创作平台** 的 Chrome
- 通过 **OpenClaw Browser Relay** 接管该浏览器 tab
- 自动完成图文上传、标题正文填写、发布、`noteId` 回收，以及公开页可见性检查

---

## 包含内容

- `scripts/xhs-preflight.mjs`
  - 环境体检脚本
  - 检查 relay、目标 tab、页面状态、file input 等前置条件

- `scripts/xhs-publish.mjs`
  - 小红书发布脚本
  - 支持单图、多图、目录批量读取图片
  - 支持发布成功后回收 `noteId`
  - 支持公开链接可见性轮询

- `docs/xhs-publish.md`
  - 更完整的部署说明、使用方法、常见问题

---

## 适用场景

适合这些情况：

- 你已经在 Chrome 里登录了小红书创作平台
- 你希望在 OpenClaw 控制下自动发布图文笔记
- 你想把这条链路迁移到其他安装了 OpenClaw 的机器上

不适合这些情况：

- 想绕过登录态，纯脚本直接登录小红书
- 没有 OpenClaw Browser Relay / 没有 attach tab
- 目标机器网络无法访问小红书相关域名

---

## 前置要求

运行前请确保：

1. 目标机器已经安装 OpenClaw
2. Chrome 可用
3. OpenClaw Browser Relay / Chrome extension 可用
4. Chrome 已登录小红书创作平台
5. 发布页 tab 已 attach 到 relay
6. 网络可访问：
   - `creator.xiaohongshu.com`
   - `www.xiaohongshu.com`

---

## 快速开始

### 1）先跑环境体检

```bash
node scripts/xhs-preflight.mjs --open-if-missing
```

这一步会检查：

- relay 是否可用
- 是否能找到目标发布页 tab
- 页面是否处于可发布状态
- 当前页面是否存在 file input

---

### 2）发布多图笔记

```bash
node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "OpenClaw 新能力：小红书自动发布正式可用" \
  --content "这里写正文" \
  --publish \
  --open-if-missing
```

---

## 常见用法

### 单图发布

```bash
node scripts/xhs-publish.mjs \
  --file /path/to/image.jpg \
  --title "标题" \
  --content "正文" \
  --publish
```

### 多图发布（显式传文件）

```bash
node scripts/xhs-publish.mjs \
  --files /path/a.jpg,/path/b.jpg,/path/c.jpg \
  --title "标题" \
  --content "正文" \
  --publish
```

### 多图发布（从目录读取）

```bash
node scripts/xhs-publish.mjs \
  --files-from-dir ~/share/xhs-post-001 \
  --title "标题" \
  --content "正文" \
  --publish
```

---

## 自动化收尾能力

`--publish` 模式下，脚本不只会点击发布，还会继续做：

1. 等待发布成功页
2. 跳转笔记管理页
3. 回收 `noteId`
4. 生成公开链接
5. 持续轮询公开页是否可见

默认公开可见性轮询策略：

- 每 **3 分钟**检查一次
- 最长检查 **1 小时**

如果超时仍不可见，会返回明确状态，而不是静默失败。

---

## 设计原则

这个项目依赖的是：

> **一个已经登录、并且已 attach 到 OpenClaw Relay 的真人 Chrome 会话**

所以它解决的是：

- 小红书图文发布自动化
- relay 模式下文件上传
- noteId 回收
- 发布结果收尾

而不是：

- 自动注册/自动登录
- 绕过平台登录态
- 脱离浏览器会话的“纯 API 发布”

---

## 进一步阅读

更完整的说明见：

- `docs/xhs-publish.md`

---

## 当前状态

目前已经验证通过的链路包括：

- 单图发布
- 多图发布
- 发布成功确认
- `noteId` 回收
- 公开链接生成
- 公开页可见性轮询

这意味着它已经不只是“能演示”，而是具备了可复用的自动发布基础能力。
