# xhs-openclaw-publisher v0.1.0

首个公开版本，提供基于 OpenClaw Chrome Relay 的小红书图文自动发布能力。

## 包含能力

- 小红书发布前环境体检（preflight）
- 单图发布
- 多图发布
- 从目录批量读取图片发布
- 发布成功后回收 `noteId`
- 生成公开链接
- 轮询公开页是否可见
- OpenClaw skill 封装版本：`xhs-publisher/`

## 适用前提

- 机器已安装 OpenClaw
- Chrome 可用
- OpenClaw Browser Relay 已可用
- Chrome 中已登录小红书创作平台
- 发布页 tab 已 attach 到 relay

## 仓库结构

- `scripts/`：直接运行的脚本
- `docs/`：部署/使用说明
- `xhs-publisher/`：可封装/复用的 OpenClaw skill 目录

## 当前限制

- 依赖已登录的人类 Chrome 会话
- 不包含登录自动化
- 公开链接是否即时可见取决于小红书审核/同步状态
