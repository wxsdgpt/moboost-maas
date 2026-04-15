> 此文件指向最新 Session 摘要，每次会话结束时更新。

**最新 Session：** [2026-04-08 PCEC Cycle 03 — 项目持久化桥（C12，让刷新不丢数据）](./2026-04-08-pcec-cycle-03.md)
（上一份：[2026-04-07 PCEC Cycle 02 — Video Atom-Box Probe（解锁 K1 视频侧）](./2026-04-07-pcec-cycle-02.md)；更早：[2026-04-07 PCEC Cycle 01 — Spec Validator 升级到专家级](./2026-04-07-pcec-cycle-01.md) / [2026-04-07 Session 01](./2026-04-07-session-01.md)）

**当前最重要的待办：**
- [ ] 推送代码到 GitHub remote（先在 Mac 终端 `gh repo create moboost-maas --private --source=. --push`）
- [ ] 中间画布 Edit 按钮功能
- [ ] 视频完成后同步更新聊天消息
- [ ] 删除 debug API 路由（`/api/debug-generate`, `/api/debug-video`）
- [ ] VC Demo 准备（截止 2026-04-20）

**季度回顾清单（每季度第一周 review 一次）：**
- [ ] `src/lib/assetSpecs.ts` — 各平台素材规格会变（TikTok 时长上限、IG Reels 画幅、IAB 新增尺寸等），每季度按 Meta / TikTok / YouTube / X / LinkedIn / Google Display 官方文档逐项核对，更新 `width / height / maxDurationSec / maxFileSizeMB / acceptedFormats`。下次 review：2026-07 第一周
- [ ] 走查 `custom-specs/` 目录下的客户自定义规格，确认没有成为事实标准、可以回收进 builtin 的条目
