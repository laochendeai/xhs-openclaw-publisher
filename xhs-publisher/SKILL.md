---
name: xhs-publisher
description: Publish Xiaohongshu image posts through an already logged-in Chrome tab attached to OpenClaw Browser Relay. Use when the user wants to post single-image or multi-image Xiaohongshu notes, run preflight checks, recover noteId/public links after publish, or verify public visibility from an OpenClaw-enabled machine.
---

# XHS Publisher

用这个 skill 处理：

- 发布小红书图文笔记
- 单图 / 多图发布
- 发布前环境体检
- 发布后回收 `noteId`
- 检查公开链接是否可见
- 把这条链路迁移到其他 OpenClaw 机器

## 前提

先确保：

1. 机器已安装 OpenClaw
2. Chrome 可用
3. OpenClaw Browser Relay 已工作
4. 用户已在 Chrome 登录小红书创作平台
5. 目标 tab 已 attach 到 relay

如果用户只是说“发一篇小红书”，先默认走这个 skill；若 preflight 失败，再根据结果告诉用户缺什么。

## 工作流

### 1. 先跑 preflight

优先执行：

```bash
node scripts/xhs-preflight.mjs --open-if-missing
```

如果失败：
- `targetFound=false`：说明没有 attach 的发布页 tab
- `fileInputFound=false` 且 `pageKind=note-manager`：当前 tab 不在上传入口页
- `hasErrorPage=true`：网络/代理/站点连接有问题

### 2. 再跑发布脚本

单图：

```bash
node scripts/xhs-publish.mjs --file /path/to/image.jpg --title "标题" --content "正文" --publish --open-if-missing
```

多图：

```bash
node scripts/xhs-publish.mjs --files /path/a.jpg,/path/b.jpg,/path/c.jpg --title "标题" --content "正文" --publish --open-if-missing
```

目录发图：

```bash
node scripts/xhs-publish.mjs --files-from-dir ~/share/xhs-post-001 --title "标题" --content "正文" --publish --open-if-missing
```

### 3. 读取结果

重点看：

- `publishSuccess`
- `noteMeta.noteId`
- `noteMeta.publicUrl`
- `publicVisibility`

如果 `publicVisibility.visible=false`，不要说发布失败，要明确区分：

- 发布成功
- noteId 已回收
- 公开侧暂不可见 / 审核中 / 同步延迟

## 参数习惯

常用参数：

- `--open-if-missing`：找不到匹配 tab 时自动打开发布页
- `--match-url`：按 URL 自动找 tab
- `--public-check-every-ms`：公开可见性轮询间隔
- `--public-check-timeout-ms`：公开可见性轮询超时

默认公开可见性轮询：

- 每 3 分钟一次
- 最长 1 小时

## 何时读参考文档

当你需要：

- 跨机器部署说明
- 常见问题排查
- 参数完整说明

再读：

- `references/xhs-publish.md`

## 何时直接用脚本，不要重写逻辑

以下情况优先直接调用 skill 内脚本，而不是现场重写自动化逻辑：

- 正常发布流程
- 迁移到新机器
- 公开链接回收 / 校验
- preflight 故障诊断

脚本路径：

- `scripts/xhs-preflight.mjs`
- `scripts/xhs-publish.mjs`
