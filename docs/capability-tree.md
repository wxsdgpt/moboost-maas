# Capability Tree — moboost-maas

> 本项目 agent 在 moboost-maas 上下文中的能力树。每个节点必须有：名称 / 输入 / 输出 / 成功前提 / 失败边界。只记录**已验证可稳定复用**的能力，未验证的放 `evolution-log.md` 候选池。

版本：v0.4.0（2026-04-08 PCEC cycle 3：项目持久化桥 — 修复"重启即丢数据"致命洞）

---

## 🌳 Branch 1: Brief Flow（4 阶段渐进式需求采集）

### 1.1 Stage 1 — Intake：规格选择 + 多模态采集
- **输入**：用户在 `/brief/new` 填写的文字 / URL / 上传文件 + 选中的 `targetSpecs`
- **输出**：`RawIntake` JSON
- **成功前提**：`src/lib/assetSpecs.ts` 目录已就绪（63 条 core/standard 规格）
- **失败边界**：文件 > 50MB、非 image/video/pdf MIME、上传接口 5xx

### 1.2 Stage 2 — Clarify：澄清（LLM + 启发式双路）
- **输入**：RawIntake
- **输出**：`ClarifiedBrief`（含 parsedRefs、targetSpecs、pendingQuestions）
- **成功前提**：`/api/brief/clarify` 可访问；有 OPENROUTER_API_KEY 则走 LLM，否则启发式
- **失败边界**：启发式最多产 5 条问题；LLM 返回非法 JSON 时自动降级

### 1.3 URL → ParsedReference 抓取
- **输入**：URL 字符串数组（≤20）
- **输出**：`ParsedReference[]`（title / heroImage / banners / videos / leadCopy / pageType）
- **成功前提**：`lib/briefFetcher.ts` + `htmlExtract.ts` 可用；目标站返回 HTML
- **失败边界**：10s 超时 / 8MB body / SSRF 黑名单（localhost、私网段）/ 非 HTML content-type

### 1.4 本地上传
- **输入**：multipart/form-data 的 `file` 字段（可选 `specIds=ig-reel,tiktok-video,…`）
- **输出**：`UploadedAsset`（含 url、mime、size、width/height、对视频还包括 durationSec/fps/codec、可选 validations[]）
- **成功前提**：`public/uploads/` 可写；MIME 在白名单
- **失败边界**：50MB 上限
- **图片尺寸探测**：`imageProbe`，仅支持 PNG/JPEG/GIF/WEBP
- **视频探测（2026-04-07 PCEC cycle 2 新增）**：`videoProbe` 零依赖 mp4/mov/m4v atom box reader，提取 duration / width / height / fps / codec / brand。先读 head 4MB，moov 在尾部时 fallback 全 buffer。webm/EBML 不在范围（返回 undefined → validator 退化为 info-level missing-field）

---

## 🌳 Branch 2: Asset Spec Authority（规格权威）

### 2.1 规格目录查询
- **输入**：spec id / platform / mediaType / category
- **输出**：`AssetSpec` 或数组
- **成功前提**：`src/lib/assetSpecs.ts` 最新
- **失败边界**：未命中返回 undefined

### 2.2 客户自定义规格 CRUD
- **输入**：customerId + spec draft
- **输出**：持久化到 `${DATA_DIR}/custom-specs/<customerId>.json`
- **成功前提**：customerId 仅含 `[a-zA-Z0-9_-]`（防路径穿越）
- **失败边界**：immutable 字段（id/source/customerId/createdAt）写入被静默忽略

### 2.3 规格与资产校验（专家级，2026-04-07 升级）
- **输入**：`ProducedAsset { width, height, mediaType?, durationSec?, fps?, format?, fileSizeMB? }` + 一条或多条 `AssetSpec`
- **输出**：`ValidationReport { ok, score 0-100, blockers, warnings, infos, violations[], summary }`
- **violation 八类**：media-type-mismatch / dimension-mismatch / aspect-mismatch / orientation-mismatch / duration-too-short / duration-too-long / fps-out-of-range / file-size-exceeded / format-not-accepted / safe-zone-overflow / missing-required-field
- **严重度三档**：blocker / warning / info；blocker = 不可发布、warning = 可发布但建议处理、info = 仅提示
- **修复建议含数值**：aspect 不匹配自动给出 center-crop 像素数 + 留白 padding 百分比；体积超限给出压缩比；时长越界给出裁剪/补足秒数；fps 越界给出重采样目标
- **三档容差**：strict (0% aspect / 0% dim) / standard (2% / 10%) / lenient (5% / 25%)
- **多 spec 一次性**：`validateAssetAgainstSpecs(asset, specs[])` 单次遍历，按 score 降序
- **成功前提**：`src/lib/specValidator.ts` 可访问；纯函数无 I/O 无随机
- **失败边界**：仍仅校验硬性指标（无视觉质量、无文字内容、无构图分析）
- **测试**：`src/lib/__tests__/specValidator.fixtures.ts` 18 个 case 全过 + `legacySmoke.ts` 5 项保留向后兼容
- **REST 入口**：`POST /api/spec/validate`（mode=validate / best-fit）
- **接入点**：`POST /api/upload?specIds=…` 上传时即时校验，结果挂到 `UploadedAsset.validations`
- **UI**：`<SpecValidationBadge>` 组件 + `/specs/inspector` 调试页（独立交互式 playground）

### 2.4 反向 best-fit 推荐
- **输入**：ProducedAsset + 候选池（all / core / igaming / 自定义 spec[]）
- **输出**：`BestFitReport { bestFits[], nearMisses[], totalChecked }`
- **bestFits**：所有 ok===true 且 score 最高的 top-K 规格
- **nearMisses**：score >= 50 但被 blocker 阻塞的"差一点就能用"的 top-K 规格
- **失败边界**：仅基于硬性指标排序；视觉适配 / 安全区 overlay 检测不在范围
- **REST 入口**：`POST /api/spec/validate { mode: 'best-fit' }`

### 2.6 视频元信息 atom-box 探测（2026-04-07 PCEC cycle 2 新增）
- **位置**：`src/lib/videoProbe.ts`
- **输入**：`Buffer`（mp4/mov/m4v 文件字节，可以是 head slice）
- **输出**：`VideoMetadata { durationSec?, width?, height?, fps?, codec?, brand?, hasVideoTrack }`
- **算法**：纯字节遍历 ISO/IEC 14496-12 box 树。mvhd v0/v1 → 影片 timescale + duration；遍历每条 trak，hdlr=='vide' 取第一条；tkhd 取 16.16 fixed-point width/height；mdia/minf/stbl/stsd 第一条 sample entry 的 fourcc 即 codec id；stsd 旁的 stts 总 sample_count ÷ 媒体时长 = fps
- **成功前提**：纯函数，无 fs / 网络 / 时间 / 随机；buffer 第 8 字节是 ftyp box 头
- **失败边界**：webm/EBML 容器返回 null（不抛）；moov 在尾部时需要全 buffer 而非 head；audio-only 文件 hasVideoTrack=false 但 durationSec 仍有效；'edts' edit list 不修正 duration（候选 C10）
- **测试**：`src/lib/__tests__/videoProbe.fixtures.ts` 12 个 case 用代码 *合成* mp4 byte sequence（零二进制 blob 入库），覆盖：1080p 30fps reel / 4K 60fps hvc1 / 方图 24fps / 音频 only / 多 trak / 29.97 分数帧 / 无 ftyp / 无 moov / mvhd v1 64bit duration / truncated buffer / probeVideo dispatch / EBML 拒识
- **REST 入口**：`POST /api/spec/probe`（stateless，无落盘）— 给 inspector 用
- **接入点**：`/api/upload` 上传视频时即时跑，结果挂到 `UploadedAsset.{durationSec, fps, codec}` 并送入 validator
- **下游收益**：cycle 1 K1 Spec Validator 现在对视频也能产出真正的 blocker（duration-too-long / fps-out-of-range / aspect-mismatch / file-size-exceeded），不再永远 missing-field info

### 2.5 旧 validateAsset 兼容层
- **输入**：legacy `{ width, height, durationSec?, fileSizeMB?, format? }` + AssetSpec
- **输出**：legacy `{ ok, errors[], warnings[] }`
- **实现**：内部直接 require 新 specValidator，把 ValidationReport 降级成 legacy 形状
- **存在理由**：ADL stability > novelty —— 不破坏任何已有 import 路径
- **fixture**：`legacySmoke.ts` 5 项

---

## 🌳 Branch 3: 前端 UX（Next.js App Router）

### 3.1 登录页 Three.js 粒子背景
- **已稳定**：GLSL ParticleFlow，速度调慢后验收通过

### 3.2 Brief Stage 1 双栏 UI
- **已稳定**：左栏规格选择器（搜索 + 媒体过滤 + 平台过滤 + AI auto-detect），右栏多模态采集
- **2026-04-07 增强**：上传素材时若已勾选 targetSpecs，自动随上传请求一起发到 /api/upload，
  返回的 UploadedAsset 带 validations[]，列表条目下方实时显示 SpecValidationBadge

### 3.3 Brief Stage 1 Chat 模式
- **已稳定**：`/brief/chat` —— 自然语言对话页，无 server session（prevBrief 走客户端回传），
  内联渲染 pendingQuestions chip 选项，可一键进入 enrich 阶段

### 3.4 Spec Validator Inspector
- **位置**：`/specs/inspector`
- **用途**：xu / qa 调试用 playground —— 输入 width/height/duration/format/size，
  实时看 catalog 内 best-fit 规格 + near-miss 规格 + 完整 violation + 修复建议
- **2026-04-07 cycle 2 新增**：「丢一个真实文件」按钮 — 调 `/api/spec/probe`，把 imageProbe / videoProbe 的真实输出原地回填到表单字段，零落盘
- **后端**：fetch /api/spec/validate (best-fit) + /api/spec/probe (file probe)
- **失败边界**：纯前端，无持久化

### 3.5 项目持久化 & 存储位置可见性（2026-04-08 PCEC cycle 3 新增）
- **位置**：`/project` 列表页头部
- **用途**：展示当前所有持久化项目所在的**绝对磁盘路径**、文件数、占用字节、schema 版本
- **触发**：页面 mount 时调用 `store.hydrate()` 一次，自动从 `<DATA_DIR>/projects/*.json` 拉回内存
- **后端**：`/api/store/info` 返回 StorageInfo
- **失败边界**：磁盘不可访问时显示 fileCount=0、exists=false，UI 仍可用（store 退化为内存模式）

---

## 🌳 Branch 4: 持久化层 + Self-Evolution Meta

### 4.0 项目状态磁盘持久化（C12 — PCEC cycle 3 新增）
- **位置**：`src/lib/projectPersistence.ts` + `src/app/api/store/{persist,restore,info}/route.ts`
- **磁盘路径**：`<DATA_DIR>/projects/<projectId>.json`，DATA_DIR 默认 `<repo>/data`，可通过 env 覆盖
- **数据形态**：每个项目一个 JSON 文件，pretty-printed，包含 `__schemaVersion` (current=1) 和 `__persistedAt` 元数据
- **写入策略**：原子写 — 先写 `.tmp` 再 `rename` 到 `.json`，POSIX 保证不会出现半写文件
- **读取策略**：启动时遍历目录，跳过未来 schema 版本 / 缺失版本字段 / 损坏 JSON 的文件并打 warning，不让坏文件污染整个 restore
- **触发**：store.ts 每个 mutation（createProject / addMessage / updateMessage / addJob / updateJob / addAsset / removeAsset / selectAsset）后调度一次 250ms 防抖的 fetch POST
- **路径白名单**：projectId 必须匹配 `^[a-zA-Z0-9_\-]{1,128}$`，防止 `../escape` 和路径注入
- **不持久化的字段**：notifications（瞬时） / sidebar collapsed flag（UI 状态） / activeProjectId（URL 已编码）
- **失败边界**：fetch 失败 → console.warn，store 内存状态保持不变；进程崩溃 → 最多丢失最近 250ms 的写入；schema 跳版 → 跳过坏文件，其余文件正常加载
- **测试**：`src/lib/__tests__/projectPersistence.fixtures.ts` 14 个 case 全过，覆盖：基本读写 / 重复写无 .tmp 残留 / restore 多文件 / 跳过未来 schema / 跳过缺版本字段 / 跳过损坏 JSON / 按 createdAt 倒序排 / delete idempotent / 不安全 id 拒收 / storage info 字节统计 / 空目录 / UTF-8 中文字符
- **回滚**：删除 `_schedulePersist()` 内部的 fetch 调用即可，store API 完全不变；删除 `data/` 目录可清空所有持久化状态

### 4.1 PCEC 周期性能力进化
- **协议**：scheduled-tasks 每周一早 9 点触发一次
- **输入**：`docs/evolution-log.md` + `git log` 最近 7 天
- **输出**：更新 `capability-tree.md` 和 `evolution-log.md`
- **成功前提**：工作区可读写；git 仓库可访问
- **失败边界**：单次 cycle 至多新增 3 个节点 / 修剪 3 个节点

### 4.2 ADL 反进化锁
- **排序**：稳定性 > 可解释性 > 可复用性 > 扩展性 > 新颖性
- **禁止**：无法描述输入/输出/失败模式的能力进入本树
- **回滚**：每次修改提交到 git，失败可 `git revert`

### 4.3 VFM 价值函数
每个候选能力评分（0-10，权重见下），总分 < 50 不予立项：
- 高频复用（×3）
- 降低失败率（×3）
- 降低用户心智负担（×2）
- 降低自身推理/工具成本（×2）

---

### 4.1 PCEC 周期性能力进化
- **协议**：scheduled-tasks 每周一早 9 点触发一次
- **输入**：`docs/evolution-log.md` + `git log` 最近 7 天
- **输出**：更新 `capability-tree.md` 和 `evolution-log.md`
- **成功前提**：工作区可读写；git 仓库可访问
- **失败边界**：单次 cycle 至多新增 3 个节点 / 修剪 3 个节点

### 4.2 ADL 反进化锁
- **排序**：稳定性 > 可解释性 > 可复用性 > 扩展性 > 新颖性
- **禁止**：无法描述输入/输出/失败模式的能力进入本树
- **回滚**：每次修改提交到 git，失败可 `git revert`

### 4.3 VFM 价值函数
每个候选能力评分（0-10，权重见下），总分 < 50 不予立项：
- 高频复用（×3）
- 降低失败率（×3）
- 降低用户心智负担（×2）
- 降低自身推理/工具成本（×2）

---

## 🪓 候选修剪（Prune Queue）
- 旧 `validateAsset` 字面定义（已经被 deprecated wrapper 取代，等所有调用迁移完后修剪）
  状态：保留至少 2 个 PCEC 周期，验证无新 bug 报告再删

## 🌱 待孵化（Candidate Pool → 详见 evolution-log.md）
- Stage 3 Enrich（三库 Item/User/Context 合并） — partial 已实现 `/api/brief/enrich`，待 UI 接入
- Stage 4 Execute（pipeline 路由 + 子任务生成）
- ~~视频时长 / fps 客户端探测~~ ✅ cycle 2 完成（src/lib/videoProbe.ts）
- ~~项目状态磁盘持久化（C12）~~ ✅ cycle 3 完成（src/lib/projectPersistence.ts）
- spec auto-pick：自由文本 brief → top-K specs（C7，下个 cycle 首选）
- C13: 持久化文件去重 base64 — 把 ChatMessage.imageData/videoData 抽到 blobs/，JSON 只存引用
- webm/EBML 容器 probe（C9，仅在 mp4-only 触达 fail rate >10% 时再启动）
- mp4 'edts' edit list 处理修正 trim 后 duration（C10）
- 视觉级 spec 校验（safe-zone 实际像素覆盖检测、文字 OCR 是否落在禁区）
- tsconfig target 升到 es2017+ 修掉 3 处历史 TS1501/TS2802（pre-existing，不阻塞 PCEC）
- presigned 上传 / S3
- /api/specs CRUD REST（当前 lib 直接 import 够用）
