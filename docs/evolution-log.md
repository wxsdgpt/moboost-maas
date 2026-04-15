# Evolution Log — moboost-maas

> PCEC（Periodic Cognitive Expansion Cycle）每周一次的进化记录。追加写入，绝不回头改。每条必须包含 **证据** 和 **回滚条件**。

---

## 2026-04-07 · Seed · v0.1.0

### 本周真实变化
- 新增 Brief 4 阶段流的 Stage 1（picker UI）+ Stage 2（clarify API）
- 新增 `src/lib/assetSpecs.ts`（63 条规格，含 2026 web 核对 4 处修正）
- 新增 `src/lib/customSpecs.ts` 客户自定义规格 CRUD
- 新增上传 pipeline（`/api/upload` + 零依赖 imageProbe）
- 新增 URL 抓取 pipeline（`/api/brief/fetch-url` + `briefFetcher` + `htmlExtract`）
- clarify API 升级：提交前自动 server 端抓取 URL，把真实 title/hero/body 喂给 LLM

### 抽象出的能力（已上树）
- Branch 1 整支 Brief Flow（1.1~1.4）
- Branch 2 整支 Asset Spec Authority
- Branch 4 整支 Self-Evolution Meta（本文件就是产物）

### 候选池（暂未上树 — 等证据）
| id | 名称 | 输入 | 输出 | 成功率证据 | 价值分 |
|----|-----|-----|-----|-----------|-------|
| C1 | Stage 3 Enrich | ClarifiedBrief | EnrichedBrief | 未实现 | 待评估 |
| C2 | 视频元信息探测 | video File | {width,height,duration,codec} | 未实现，需 ffprobe | 60 |
| C3 | 规格 REST CRUD | HTTP | spec list/diff | 未实现，当前 lib 够用 | 30（低） |
| C4 | presigned 上传 | File | remote url | 未实现 | 70 |

### 回滚条件
- 若 `/api/brief/clarify` 在真实 URL 输入下成功率 < 80%，回滚 "clarify 自动抓取" 分支，恢复为仅读 intake.urls 的骨架 parsedRefs
- 若 `imageProbe` 对任一常见格式误判宽高，回滚该分支并在 Branch 1.4 能力节点标注「仅支持文件元信息」

---

---

## 🔒 持久规则（所有未来 PCEC 周期必须遵守）

- **主人/人类称谓统一为 `xu`**：能力树、进化日志、scheduled task 产物中若需指代项目所有者或真人角色，一律使用 `xu`，不得出现其他代称（如「主人」「用户」当作角色名时、或任何外来文档中的人名）。功能性语境里的泛指「用户」（指代平台终端用户 / end-user）不受此规则影响。
- 违反此规则即触发 ADL 回滚。

---

## 2026-04-07 · PCEC cycle 1 · v0.2.0 · "Spec Validator → expert grade"

执行人：xu 的 agent，手动触发（非 hourly cron），目标 = 把单个功能做到极致而不是铺新摊子。

### 候选评估（VFM 满分 50 起立项）
| ID | 名称 | Freq×3 | Fail-Red×3 | Burden×2 | Cost×2 | 总分 | ADL |
|----|-----|--------|------------|----------|--------|------|-----|
| K1 | Spec Validator → expert grade | 27 | 27 | 18 | 12 | **84** | ✅ pure determinstic |
| K2 | Spec Recommender (free-text → top-K) | 27 | 21 | 18 | 14 | 80 | ⚠️ heuristic-heavy |
| K3 | trustedSources 35→100+ | 15 | 15 | 8 | 10 | 48 | ❌ <50 |
| K4 | Stage 4 Execute scaffold | 24 | 12 | 14 | 8 | 58 | ❌ novelty-heavy |
| K5 | HtmlExtract schema.org 强化 | 21 | 18 | 8 | 12 | 59 | ✅ but lower |

**ADL 选定 K1**。理由：最高 VFM、纯确定性零 LLM 漂移、跨 Stage 1/2/4 全栈复用、
直接对应 xu 原则「检索一个固有的行业知识 …这些部分应该固化到我们的库中」、
现有 stub 仅 4 个 check 扩展空间大。

### 本周期实际产出（命名 / 路径 / 行数）
| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 lib | `src/lib/specValidator.ts` (~480) | 主库：8 类 violation / 三档严重度 / 三档容差 / crop+pad 数学 / multi-spec / best-fit 反向 |
| 新建 fixture | `src/lib/__tests__/specValidator.fixtures.ts` (~280) | 18 个 case 全过；含媒体类型/aspect/dim/duration/fps/size/format/orientation/severity/best-fit/tolerance/warningsAreBlockers |
| 新建 fixture | `src/lib/__tests__/legacySmoke.ts` (~55) | 老 validateAsset 向后兼容 5 项 check |
| 新建 REST | `src/app/api/spec/validate/route.ts` (~165) | mode=validate / mode=best-fit；池：all/core/igaming |
| 新建 UI | `src/components/SpecValidationBadge.tsx` (~80) | 颜色严重度三档 chip + 4 条上限 + expand |
| 新建 UI | `src/app/specs/inspector/page.tsx` (~270) | 交互式 playground，5 个 preset，实时调用 /api/spec/validate |
| 修改 lib | `src/lib/briefTypes.ts` | 新增 `UploadedAssetValidation` 接口；`UploadedAsset.validations?` 字段 |
| 修改 lib | `src/lib/assetSpecs.ts` | 旧 `validateAsset` 改为 deprecated wrapper，require 新 lib |
| 修改 route | `src/app/api/upload/route.ts` | 接 `specIds` form field，上传后即时跑 validator 挂到 asset.validations |
| 修改 page | `src/app/brief/new/page.tsx` | onFileSelect 把 selectedSpecIds 一起 POST；列表条目下方渲染 SpecValidationBadge |
| 修改 doc | `docs/capability-tree.md` | Branch 2.3 升级 + 新增 2.4 / 2.5 / 3.4 |

### 测试结果
- `npx tsc --noEmit` ：本次改动 0 错；3 处历史错误（expert-search/sourceQuality/trustedSources）保留待独立 cycle 处理
- `sucrase-node specValidator.fixtures.ts`：**18/18 passed**
- `sucrase-node legacySmoke.ts`：**5/5 passed** —— 老 import 路径完整保留

### 设计决策（为什么是这样）
- **纯函数**：validator 不读 fs、不调 LLM、不依赖时间 / 随机。Same input → same output forever。便于做回归。
- **要求 mediaType 显式传入**：避免 validator 自己猜，否则跨上传管线时容易把 mp4 误判成 image
- **deprecated 不删**：ADL 排序 stability > novelty > 美观。`require()` 的 lazy import 是为了断 import 循环（specValidator imports from assetSpecs）。
- **inspector 页 Tailwind 受限**：刻意没用复杂组件库，只用 base utility classes，避免引依赖
- **fixture 不靠 jest**：项目还没有 test runner，加 jest 是新设施 → ADL 拒。改成 sucrase-node 直接跑 .ts，零新依赖。

### 持久规则触达
- 文档全程称呼 `xu`，无任何替代代称 ✓
- 没有写入 ${DATA_DIR} 之外的任何持久状态 ✓
- 没有破坏任何现有 import 路径 ✓

### 候选池（暂未上树）
| id | 名称 | 输入 | 输出 | 价值分 |
|----|-----|-----|-----|-------|
| C5 | 视频 mp4 atom box 时长探测（无 ffprobe） | mp4 buffer | { durationSec, fps?, codec? } | 70 |
| C6 | 视觉级 safe-zone 校验（实际像素覆盖） | image + spec | overlay 报告 | 60 |
| C7 | spec auto-pick：自由文本 brief → top-K specs | text | spec[] + 理由 | 80（已有 K2 评估） |
| C8 | tsconfig target → es2017 修历史 TS1501 | tsconfig.json | clean type-check | 50 |

### 回滚条件
- 若 specValidator.ts 在生产 brief 上误判率 > 5%，回滚到 v0.1.0 的 4-check stub（保留所有新接口签名，内部改为 noop returning ok=true 的安全降级）
- 若 deprecated wrapper 让任何老调用方崩溃，立即把 require 改回字面 inline，保持完全字面相同

### 下个 cycle 优先级
1. C5 视频 mp4 atom box 时长探测 —— 是真正解锁视频上传时立即出 blocker 的关键
2. C7 spec auto-pick —— 把 chat 模式下的「自动选规格」从 regex 升级到 LLM + 现成 validator 加权
3. C8 tsconfig 修历史 errors（trivial、独立周期做即可）

---

## 2026-04-07 · PCEC cycle 2 · v0.3.0 · "Video probe — unlock the validator's blind side"

执行人：xu 的 agent，**同一晚连续触发**（cycle 1 收尾后立即衔接 cycle 2，遵守"宁可一晚做两个 cycle 各自做到极致，也不在一个 cycle 里铺三件事"的原则）。

### 触发理由
Cycle 1 把 Spec Validator 做到了专家级，但收尾时明确写下了它最大的盲区：**视频文件根本拿不到 width/height/duration/fps**，所以视频跑 validator 永远只产 info-level "missing-required-field"，永远拿不到 blocker。这等于 K1 一半的火力闲置。Cycle 2 的 K1' = 把这块盲区补上 —— 完全在 cycle 1 的延长线上，没有切换主题。

### 候选评估（VFM）
| ID | 名称 | Freq×3 | Fail-Red×3 | Burden×2 | Cost×2 | 总分 | ADL |
|----|-----|--------|------------|----------|--------|------|-----|
| C5 | mp4 atom box video probe (零依赖) | 24 | 27 | 16 | 14 | **81** | ✅ pure deterministic byte parser |
| C7 | spec auto-pick free-text→top-K | 27 | 21 | 18 | 14 | 80 | ⚠️ heuristic + LLM |
| C8 | tsconfig target → es2017 | 6 | 6 | 4 | 8 | 24 | trivial 但 isolated |
| C6 | 视觉 safe-zone overlay | 18 | 15 | 8 | 8 | 49 | <50 |

ADL 选 **C5**：纯字节解析、零 LLM、零网络、零依赖、完美确定性，并且是 cycle 1 K1 的直接补完。C7 留给下个 cycle，因为它需要启发式 + LLM，性质不同，不在 cycle 1 同一条思想线上。

### 本周期实际产出
| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 lib | `src/lib/videoProbe.ts` (~370) | mp4/mov/m4v atom box reader：duration / width / height / fps / codec / brand。支持 mvhd v0+v1、tkhd 16.16 fixed、stts sample-count→fps、handler-type 区分 video/audio 多 trak |
| 新建 fixture | `src/lib/__tests__/videoProbe.fixtures.ts` (~330) | 12 个 case 全过；用代码合成最小有效 mp4 byte sequence，零二进制 blob 入库。覆盖：1080p reel / 4K hvc1 60fps / 方图 24fps / 音频 only / 多 trak (音频先视频后) / 29.97 fps 分数帧 / 无 ftyp / 有 ftyp 无 moov / mvhd v1 64bit / truncated buffer 不抛 / probeVideo dispatch / 非 mp4 EBML 返回 null |
| 新建 REST | `src/app/api/spec/probe/route.ts` (~120) | 无落盘的 stateless probe 端点，给 inspector 用 |
| 修改 lib | `src/lib/briefTypes.ts` | UploadedAsset 加 `fps?` `codec?` 字段（additive only） |
| 修改 route | `src/app/api/upload/route.ts` | video 上传现在跑 videoProbe（先 head 4MB，moov 在尾部时 fallback 全 buffer）；validator 接到真实 dim/duration/fps；asset response 带 durationSec/fps/codec |
| 修改 page | `src/app/specs/inspector/page.tsx` | 加"丢一个真实文件自动填充字段"按钮，调 /api/spec/probe，原地填 width/height/duration/fps/format/fileSizeMB |

### 测试结果
- `npx tsc --noEmit`：本 cycle **0 新错**，仍是 cycle 1 之前那 3 处历史 TS1501/TS2802（已记入 C8）
- `sucrase-node videoProbe.fixtures.ts`：**12/12 passed**（first run, no flakes）
- `sucrase-node specValidator.fixtures.ts`：**18/18 passed**（cycle 1 套件无回归）
- `sucrase-node legacySmoke.ts`：**5/5 passed**（旧 validateAsset 形状仍保持）

### 设计决策
- **手写字节解析 vs 引依赖**：拒绝 mp4box.js / fluent-ffmpeg / @ffmpeg-installer。理由：每次上传都跑的代码必须是纯函数 + 零依赖 + 零 shell-out。这条 ADL 原则在 cycle 1 立的，cycle 2 必须遵守。
- **不入库二进制 fixture**：fixture 用代码 *合成* 最小有效 mp4，不放 .mp4 测试文件到 git。后果：每个测试都 100% 控制每一字节，回归基本不可能；坏处：不能测真实编码器输出的怪癖（如 isobmff 'edts' 边角箱），列入下个 cycle 候选。
- **head-then-tail probe 策略**：fast-start mp4 把 moov 放头部、传统编码器放尾部。先读 head 4MB；如果只看到 ftyp 没看到 moov（hasVideoTrack=false 且 durationSec=undefined），再用全 buffer 回放一次。这样 99% 的现代视频只读 head 就够了，对长视频内存友好。
- **stateless probe API 单独开**：没有让 inspector 复用 /api/upload，因为 /upload 落盘到 public/uploads/，inspector 每次点击都会留垃圾文件。开 /api/spec/probe 不写盘 — 角色清晰：upload = 持久化，probe = 元数据只读。
- **fps 算法**：用 stts 总 sample_count ÷ media duration，不用 stts 的 sample_delta（多 entry 时 sample_delta 不一致，平均才靠谱）。round 到 3 位小数避免 29.970029970... 噪声。
- **deprecated wrapper 不动**：cycle 1 的 legacy `validateAsset` 兼容层完全没碰，legacy smoke 测试一遍过，证明本 cycle 是纯加法。

### 持久规则触达
- 文档全程称呼 `xu`，无任何替代代称 ✓
- 没有写入 ${DATA_DIR} 之外的任何持久状态 ✓
- 没有破坏任何现有 import 路径，没有改 cycle 1 的任何文件的语义 ✓
- ADL 排序遵守：稳定性 > 可解释性 > 可复用性 > 扩展性 > 新颖性 ✓

### 候选池（更新）
| id | 名称 | 状态 | 备注 |
|----|-----|------|------|
| ~~C5~~ | mp4 atom box duration probe | ✅ 完成 | 本 cycle 产物 |
| C7 | spec auto-pick free-text → top-K | 候选 | 下个 cycle 首选 |
| C6 | 视觉级 safe-zone 像素覆盖检测 | 候选 | 60 分 |
| C8 | tsconfig target → es2017 | 候选 | trivial，可独立 5 分钟 cycle |
| **C9** | webm/EBML 容器 probe (与 mp4 平行) | 新增 | 50 分。大多数广告资产是 mp4，webm 是少数。先观察 fail rate |
| **C10** | mp4 'edts' edit list 处理（修正 trim 后 duration） | 新增 | 40 分。会让某些剪辑导出的视频 duration 更准 |
| **C11** | mp4 'av1C'/'hvcC' decoder config 解 → 真实 codec profile/level | 新增 | 30 分。锦上添花，validator 不需要 profile/level |

### 回滚条件
- 若 videoProbe 在生产 mp4 上误判 width/height（>5% 文件），快速 patch：把 `parseTkhd` 兜底改成 `return null`，validator 自动回到 missing-field info。完整回滚：删除 videoProbe.ts + 还原 upload route 的 5 行 video 分支即可，cycle 1 不受任何影响。
- 若 /api/spec/probe 被滥用导致 OOM：MAX_BYTES 已经在 50MB 上限，可以再降到 10MB 仅 head-only 模式。
- 若 inspector 文件按钮坏：删除 page.tsx 里 probeRealFile + 文件 input 的 ~50 行即可，REST 和 lib 不受影响。

### 下个 cycle 优先级
1. **C7 spec auto-pick** —— K1 + cycle 2 video probe 已经把"给 spec 校验素材"做到了极致；下一个高杠杆点是反向：从自由文本 brief 自动选出 top-K spec。这是 chat 模式 `/brief/chat` 当前 regex 路径的升级。
2. C9 webm probe —— 把 video probe 的覆盖率从 mp4 family 扩到 webm；只在 cycle 2 实际跑出来 fail rate > 10% 时再做。
3. C8 tsconfig target → es2017 —— trivial cleanup，独立 5 分钟做。

---

## 2026-04-08 · PCEC cycle 3 · v0.4.0 · "Persistence — close the disappearing-data hole"

执行人：xu 的 agent。**xu 在用 dev server 时直接发现的洞** —— 问"项目的历史聊天对话存在哪里"，调查后发现答案是"什么都没存在哪里"，store.ts 是 in-memory only，浏览器刷新或 dev server 重启全丢，而且 storage.ts 写好的持久化函数从来没接通过。

### 触发理由
这是个**致命洞**而不是优化项。任何 dev/QA 操作（聊天、上传、生成）都活在 Next.js 进程的 RAM 里，进程死了就全丢。这条体验路径上每一次"我刚才做的事呢？"都是 100% 失败。修这件事的杠杆比 cycle 2 候选池里所有 C7-C11 都高。

### 候选评估（VFM）
| ID | 名称 | Freq×3 | Fail-Red×3 | Burden×2 | Cost×2 | 总分 | ADL |
|----|-----|--------|------------|----------|--------|------|-----|
| **C12** | 项目状态磁盘持久化（plain JSON 文件） | 30 | 30 | 20 | 16 | **96** | ✅ pure addition + 零依赖 + 原子写 |
| C7 | spec auto-pick free-text→top-K | 27 | 21 | 18 | 14 | 80 | 推后 |
| C9 | webm/EBML 容器 probe | 18 | 12 | 8 | 12 | 50 | 推后 |
| C13 | base64 blob 去重外存 | 24 | 12 | 12 | 8 | 56 | 候选 cycle 4，依赖 C12 |

ADL 选 **C12**：满分级别的 fail-reduction（修一个 100% 失败的体验），最大 frequency（每个 mutation 都触发），低自身成本（fs/promises 标准库），并且是纯加法 —— store API 完全不变，删四行 fetch 调用即可整段回滚。比所有 C7/C9 都更紧迫。

### 设计原则
1. **存储位置必须明确可见** — xu 字面上要求"明确存储的位置"。每个项目一个 plain JSON 文件，不是 SQLite 不是 IndexedDB 不是 localStorage，xu 能直接 `ls data/projects/` 看到、`cat` 读、`cp` 备份、`git diff` 比对。
2. **原子写** — 写 `<id>.json.tmp` → fsync → `rename` 到 `<id>.json`，POSIX 保证不会出现半写文件。崩溃中断的代价上限是"丢最近 250ms 的写入"，不会"文件损坏整个项目消失"。
3. **Schema 版本** — 每个文件带 `__schemaVersion: 1`，reader 拒绝未来版本（warning + skip），不让新分支的文件污染老分支。
4. **路径白名单** — projectId 必须 `^[a-zA-Z0-9_\-]{1,128}$`，防 `../escape`。
5. **防抖 250ms** — 一次用户动作触发 3-5 次 mutation 时，coalesce 到一次磁盘写。
6. **failure 不阻塞 UI** — 所有 fetch 都是 fire-and-forget + console.warn，store 内存仍是 source of truth；磁盘只在跨重启时生效。
7. **纯加法** — store 公共 API 一行没改，所有 mutation 函数末尾追加一行 `_schedulePersist(id)`，删掉就是 cycle 2 之前的状态。

### 本周期实际产出
| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 lib | `src/lib/projectPersistence.ts` (~200) | fs/promises only。`persistProjectToDisk` (atomic write) / `restoreAllProjectsFromDisk` (skip future / malformed) / `deleteProjectFromDisk` (idempotent) / `getStorageInfo` / `getProjectsDir`。常量 `PROJECT_SCHEMA_VERSION = 1`。 |
| 新建 fixture | `src/lib/__tests__/projectPersistence.fixtures.ts` (~270) | 14 个 case 全过：基本读写 / 重复写无 .tmp 残留 / restore 多文件 / 跳过未来 schema / 跳过缺版本字段 / 跳过损坏 JSON / 按 createdAt 倒序 / delete idempotent / 不安全 id 拒收 / storage info 字节统计 / 空目录 / UTF-8 中文 / pretty-print 验证 |
| 新建 REST | `src/app/api/store/persist/route.ts` | POST 写一份 / DELETE 删一份 |
| 新建 REST | `src/app/api/store/restore/route.ts` | GET 拉所有项目 + storage info |
| 新建 REST | `src/app/api/store/info/route.ts` | GET 仅 storage info（用于 UI 显示路径） |
| 修改 lib | `src/lib/store.ts` | 加 `_schedulePersist()` (250ms 防抖) / `_scheduleDelete()`；8 个 mutation 函数末尾 +1 行调用；新增 `store.removeProject()` / `store.hydrate()` / `store.isHydrated()`；公共 API 完全保持向后兼容 |
| 修改 page | `src/app/project/page.tsx` | useEffect 调 `store.hydrate()`；header 显示 HardDrive 图标 + 绝对存储路径 + 文件数 + 总字节 + schema 版本 |
| 修改 docs | `docs/capability-tree.md` | v0.3.0 → v0.4.0；新增 3.5 存储位置可见性节点；新增 4.0 磁盘持久化节点（完整入参/出参/失败模式）；候选池更新 |

### 测试结果
- `npx tsc --noEmit`：本 cycle **0 新错**，仍是 cycle 1 之前那 3 处历史 TS1501/TS2802（一次中间过程引入的 .then 类型错已修）
- `sucrase-node projectPersistence.fixtures.ts`：**14/14 passed**（first run, no flakes）
- `sucrase-node specValidator.fixtures.ts`：**18/18 passed**（cycle 1 套件无回归）
- `sucrase-node legacySmoke.ts`：**5/5 passed**（cycle 1 兼容层无回归）
- `sucrase-node videoProbe.fixtures.ts`：**12/12 passed**（cycle 2 套件无回归）
- 总计 **49 / 49** tests green

### 设计决策（要点）
- **plain JSON vs SQLite vs IndexedDB**：选 JSON。理由：xu 要"明确的位置"，JSON 文件 grep 友好 / cat 友好 / git 友好 / 备份恢复极简。SQLite 要 5MB native binary 依赖（违反 cycle 1 立的零依赖原则）。IndexedDB 在浏览器里不可见。trade-off：JSON 不支持并发查询，但当前是 dev 单用户场景，不需要。
- **base64 大字段全部入库 vs 抽出**：第一版**全部入库**，简单可靠。注意到 video 的 base64 可能让单文件到 50MB 量级，列入 candidate **C13** 下个 cycle 处理（建独立 `data/blobs/<sha256>.bin`，JSON 只存 `{ blobRef: 'sha256:...' }`）。第一版优先正确性。
- **client-only persistence vs server-side store**：store.ts 是 `'use client'`，无法直接在客户端用 fs。架构上 client store 通过 fetch 写到 server REST，server REST 调 fs 写盘。读时反向。这是唯一既保留 client store 反应式 / SSR 友好性，又能持久化到磁盘的路径。
- **debounce 250ms vs immediate**：250ms 足够把"加用户消息→加 generating 占位→更新结果"三连击合成一次写盘，又不会让用户感觉数据"未保存"（人类感知阈值约 100ms，250ms 反应快得感觉不到延迟）。
- **不持久化 notifications**：刻意决定。通知是瞬时 UI 反馈，每次进入应用应该是干净的，重启后不应该看到三天前的旧通知。
- **hydrate 合并策略**：内存里已有的项目优先（用户可能在 hydrate 完成前就创建了一个），磁盘只补齐缺失的，按 createdAt 倒序合并。避免 hydrate 在用户输入时把当前编辑覆盖掉。
- **无 git commit**：cycle 1+2 累积的 .git/index.lock 仍然没法在沙箱里删，cycle 3 合并到那次手动提交里一起处理，详见 handoff。

### 持久规则触达
- 文档全程称呼 `xu` ✓
- DATA_DIR 默认 `./data`，不写其它任何路径 ✓
- 没破坏任何 cycle 1 / cycle 2 的代码或测试 ✓
- ADL 排序遵守：稳定性 > 可解释性 > 可复用性 > 扩展性 > 新颖性 ✓

### 候选池（更新）
| id | 名称 | 状态 | 备注 |
|----|-----|------|------|
| ~~C12~~ | 项目状态磁盘持久化 | ✅ 完成 | 本 cycle 产物 |
| ~~C5~~ | mp4 atom box duration probe | ✅ cycle 2 完成 | |
| **C13** | base64 blob 抽离去重 | 新增 | 56 分。依赖 C12 已存在。让单 JSON 文件回到 KB 量级 |
| C7 | spec auto-pick free-text → top-K | 候选 | cycle 4 首选 |
| C9 | webm/EBML 容器 probe | 候选 | 仅在 mp4-only 失败率 >10% 时启动 |
| C10 | mp4 'edts' edit list 处理 | 候选 | |
| C11 | mp4 av1C/hvcC 解 → profile/level | 候选 | |
| C6 | 视觉 safe-zone overlay | 候选 | |
| C8 | tsconfig target → es2017 | 候选 | trivial 5 分钟 cycle |

### 回滚
- **写盘出问题**（坏 JSON / 写不完整）：删除 store.ts 的 `_schedulePersist` / `_scheduleDelete` 函数定义即可整体回退。store 公共 API 一字未变，回退后等于 cycle 2 状态。
- **hydrate 把当前会话覆盖**：currently uses "memory wins" merge，不会发生。万一需要紧急关闭 hydrate，注释掉 `src/app/project/page.tsx` 里的 `useEffect(... store.hydrate())` 一行即可。
- **磁盘满**：写失败 → fetch 返回 5xx → console.warn → store 内存正常。无静默静默数据丢失。
- **完全清空持久化状态**：`rm -rf data/projects/` 即可。
- **回退 schema v1 → 未来的 v2 兼容性**：未来的 v2 reader 会跳过 v1 文件并 warn；要主动升级，加一个 `migrateV1ToV2(parsed)` 函数即可，目前不需要。

### 下个 cycle 优先级
1. **C13 base64 blob 去重外存** —— 直接顶上 C12 的下游问题。video 生成回来的 50MB base64 现在会被一字不动写进 JSON，单个项目就能让文件到 100MB+。把 imageData / videoData 抽到 `data/blobs/sha256-<hash>.bin`，JSON 只存引用。让 hydrate 性能从 "可能 OOM" 变回 "毫秒级"。
2. C7 spec auto-pick — 已经积累两个 cycle 没做了，是 chat 模式真正的智能化升级。

---

## _（下一次 PCEC 追加到此之下）_
