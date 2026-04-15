# Onboarding + Pricing Spec

**版本**：v1.0
**日期**：2026-04-08
**作者**：claude (w/ xu 决策)
**状态**：approved, ready for Phase 1
**Owner**：xu

这份文档是 Moboost AI MAAS 「注册 + 付费 + credit 计费」整套产品形态的 **唯一真实来源** (single source of truth)。所有后续开发都应以此为准，若实现时发现与本文档冲突，先改文档再改代码。

---

## 1. 决策汇总（xu 已拍板）

| ID | 决策 | 选中方案 |
|----|------|---------|
| Q1 | Signup-first vs Anonymous-first | **Anonymous-first**（登录页旁放试用入口，0 注册先用） |
| Q2 | Demo 阶段成本考量 | **不考虑**，目标最大化首批注册 |
| Q3 | 收费模式 | **订阅制**（产品使用权 + 月度 credit 配额）+ **按量充值**（额外 credit top-up）|
| D1 | Credit 滚存策略 | **订阅 credit 月度清零** + **赠送/补偿 credit 永不过期** |
| D2 | 消耗优先级 | **FIFO by expiry** —— 先用快过期的（订阅 → 赠送 → top-up）|
| D3 | Anonymous → paywall 路径 | **点击解锁 → 先注册 → 再看 pricing** |
| D4 | Demo 期 Free tier 额度 | **50 credits**（一次性，上线后降到 20）|

---

## 2. 架构总览

### 2.1 用户漏斗

```
   [Landing Page /]
         │
         ├─→ [登录入口]（老用户）→ /project
         │
         └─→ [试用入口：输入产品 URL](anonymous)
                   │
                   ▼
            [Lite Report Pipeline]
              ├─ 抓取 URL (fallback: 手填)
              ├─ 自动检测语言 / 市场 / 产品名
              └─ 生成 lite 版报告 (30-60s 带进度条)
                   │
                   ▼
            [Report Viewer]
              ├─ 前 2 section 全开（免费展示）
              └─ 后 5-7 section 预览 + 锁定遮罩
                   │
                   ├─→ 点 "解锁完整版" / "保存" / "导出"
                   │        │
                   │        ▼
                   │   [注册 Gate]
                   │     ├─ Email magic link (主路径)
                   │     └─ Google SSO (次路径)
                   │        │
                   │        ▼
                   │   [Anonymous 状态迁移]
                   │     ├─ 生成的 lite report 绑定到新 user
                   │     ├─ 发放 50 demo free credits (non-expiring)
                   │     └─ 跳转 /pricing
                   │        │
                   │        ▼
                   │   [Pricing Page]
                   │     ├─ 直接用 free credits 解锁 (10 credit)
                   │     └─ 或升级 Pro/Max 进入 checkout
                   │
                   └─→ 点 "关闭 / 返回"
                        └─ retargeting: 如已留邮箱，进 retention 邮件序列
```

### 2.2 关键架构原则

1. **Anonymous 阶段不收集任何表单**：URL 是唯一输入，其它字段（产品名 / 市场 / 语言）全部自动推断
2. **Report 生成与账号解耦**：anonymous user 生成的 report 存在一个 `anonymous_session_id` 下，注册后 migration 到 `user_id`
3. **Credit 消耗是原子动作**：每个可计费动作 = 一次事务 = credit ledger 写一条记录
4. **前端永远信任后端的 credit 余额**：不要在前端缓存余额做决策，每次动作前从后端拉最新值
5. **所有 credit 变动可审计**：ledger 是 append-only，永不 update/delete，用户可以 export 自己的 credit 历史

---

## 3. 用户状态机

```
                      ┌──────────────┐
                      │  Anonymous   │
                      │ (no account) │
                      └──────┬───────┘
                             │ 点解锁/保存/导出
                             ▼
                      ┌──────────────┐
                      │   Signing    │◄── email / Google SSO
                      └──────┬───────┘
                             │ 邮箱验证通过
                             ▼
                      ┌──────────────┐
                      │  Free User   │── 50 demo credits（非续）
                      │ (no plan)    │
                      └──────┬───────┘
                             │ 点升级 or credit 用完
                             ▼
              ┌──────────────────────┐
              │     Checkout         │── LemonSqueezy hosted
              └──────┬──────┬────────┘
                     │      │
            success  │      │ cancel
                     ▼      ▼
            ┌──────────┐  ┌───────────┐
            │Paid User │  │Free User  │
            │Pro/Max/Ent│  │(unchanged)│
            └──────────┘  └───────────┘
                  │
                  │ subscription cancelled / payment failed
                  ▼
            ┌──────────┐
            │ Past Due │── grace period 14 天 → 降级 Free
            └──────────┘
```

---

## 4. 数据模型（Postgres via Supabase）

```sql
-- Users（Clerk 接管 auth，这里只存 app 特有字段）
users (
  id              uuid PK (matches Clerk user_id)
  email           text unique
  created_at      timestamptz
  signup_source   text  -- 'anonymous-trial' | 'direct-signup' | 'google-sso'
  signup_during_demo boolean  -- 用于上线后的 loyalty bonus
  current_plan    text  -- 'free' | 'pro' | 'max' | 'enterprise'
  plan_period_end timestamptz  -- 当前计费周期结束时间
  total_credits_earned  int  -- 累计获得
  total_credits_spent   int  -- 累计消耗
)

-- Products（用户注册的产品，1 user 可有多个）
products (
  id              uuid PK
  user_id         uuid FK
  url             text
  name            text
  market          text  -- 'US' | 'CN' | 'JP' ... default 'US'
  language        text  -- 'en' | 'zh' | 'ja' ... default 'en'
  created_at      timestamptz
  last_analyzed_at timestamptz
)

-- Reports（市场分析报告）
reports (
  id              uuid PK
  product_id      uuid FK  -- nullable, for anonymous reports
  anonymous_session_id text  -- 匿名态绑定，注册后清空
  user_id         uuid FK  -- 注册后绑定
  type            text  -- 'lite' | 'full' | 'competitive' | 'seo' | ...
  status          text  -- 'generating' | 'ready' | 'failed'
  content         jsonb  -- 完整报告 JSON
  free_sections   text[]  -- ['positioning', 'value-prop'] 免费展示的 section id
  credits_consumed int
  created_at      timestamptz
)

-- Credit Ledger（append-only，所有 credit 变动记录）
credit_ledger (
  id              uuid PK
  user_id         uuid FK
  amount          int  -- 正数=获得, 负数=消耗
  balance_after   int  -- 本次操作后的总余额（冗余，方便审计）
  source          text -- 'subscription' | 'topup' | 'demo_bonus' | 'loyalty' | 'refund' | 'consumption'
  action          text -- 当 source=consumption 时，具体是哪个动作 ('report_full', 'competitive', ...)
  expires_at      timestamptz  -- 订阅发放的有 expires_at, 赠送/topup 的为 NULL
  related_entity  text  -- 'report:uuid' | 'invoice:xxx' | NULL
  created_at      timestamptz
)

-- Subscriptions（LemonSqueezy webhook 写入）
subscriptions (
  id              uuid PK
  user_id         uuid FK
  lemonsqueezy_subscription_id text unique
  plan            text  -- 'pro' | 'max' | 'enterprise'
  status          text  -- 'active' | 'past_due' | 'cancelled' | 'expired'
  current_period_start timestamptz
  current_period_end   timestamptz
  credits_per_period int  -- 该 plan 每月发放多少
  cancel_at_period_end boolean
  created_at      timestamptz
  updated_at      timestamptz
)
```

**关键不变量**：
- `users.current_plan` 永远反映最新的 active subscription（没有 active 订阅时为 `'free'`）
- `credit_ledger` 是唯一的 credit 真实来源，`users.total_credits_*` 只是冗余缓存
- 计算当前可用余额：`SELECT sum(amount) FROM credit_ledger WHERE user_id = ? AND (expires_at IS NULL OR expires_at > now())`

---

## 5. Credit 系统

### 5.1 Credit 消耗表

| 动作 | Credit | 触发 skill | 说明 |
|------|--------|-----------|------|
| Lite market report | 3 | (内部 pipeline) | anonymous 试用送的起始报告 |
| **Full market report** | **10** | (内部 pipeline) | 主力消耗点 |
| Competitive brief | 8 | `marketing:competitive-brief` | 竞品分析 |
| Campaign plan | 5 | `marketing:campaign-plan` | 营销计划 |
| SEO audit | 5 | `marketing:seo-audit` | SEO 审计 |
| Email sequence (5-7 封) | 5 | `marketing:email-sequence` | Onboarding / drip |
| Performance report | 3 | `marketing:performance-report` | 复盘报告 |
| Brand review | 3 | `marketing:brand-review` | 品牌一致性检查 |
| Add competitor to tracking | 2/月 | — | 每月自动 refresh |
| Ad copy / creative variant | 1 | `marketing:draft-content` | 单条文案 |
| Re-run existing report (24h refresh) | 5 | — | 旧报告数据刷新 |

**心理定价锚**：用户对"10 credits 生成一份完整报告"有直觉感知；1 credit ≈ 一次小动作；Pro $39/100credits ≈ **$0.39/credit**，Max $119/400credits ≈ **$0.30/credit**（越升越便宜，符合直觉）。

### 5.2 Credit 发放规则

| 来源 | 数量 | 过期 | 备注 |
|------|------|------|------|
| **Demo 期 signup bonus** | 50 | **永不过期** | 上线后降到 20，老用户保留 |
| **Loyalty bonus**（上线后给 demo 老用户）| 一次性 100 | 永不过期 | 补偿 demo 期不确定性 |
| **Pro 订阅** | 100/月 | **月末清零** | 每月续订时重新发放 |
| **Max 订阅** | 400/月 | **月末清零** | 同上 |
| **Top-up purchase** | 任意 | **永不过期** | 按量购买的 credit |
| **Refund / compensation** | 手动 | 永不过期 | 客服补偿、bug 赔付 |

### 5.3 消耗优先级（D2 锁定：FIFO by expiry）

```
消耗 10 credits 时，按以下顺序扣减：
1. 订阅发放的 credit（expires_at 最近的先扣）
2. Demo bonus / loyalty（无过期但标记为 bonus）
3. Top-up 购买的（无过期，用户掏钱最心疼，最后扣）
4. 全部不足时：拒绝动作，弹 top-up 或 upgrade 选项
```

**用户感知**：掏钱买的 credit 感觉"永远在那里"（因为最后扣），订阅 credit 自动循环不让用户觉得"亏"（反正下月会来新的）。

### 5.4 消耗失败时的处理

```
1. 用户点"生成完整报告"，前端先 POST /api/credits/reserve { action: 'report_full', amount: 10 }
2. 后端检查可用余额 >= 10：
   - 是 → 创建 pending 消耗记录，返回 reservation_id
   - 否 → 返回 402 Payment Required + {options: ['upgrade', 'topup', 'borrow']}
3. 前端收到 reservation_id → 调用真正的生成 API，带 reservation_id
4. 生成成功 → 后端 commit 消耗（写 ledger 扣减余额）
5. 生成失败 → 后端 rollback（删除 pending 记录，不扣费）
```

**关键点**：永远不要因为"生成失败"扣用户 credit。Reservation 模式保证原子性。

### 5.5 超限处理选项（D4 细节）

余额不足时给用户 3 个选择：
1. **Upgrade to Max**：跳升级页，按比例退当前周期剩余 credit 折抵
2. **Top-up**：一次性买 N credit（50 / 100 / 500 三档）
3. **Borrow from next month**：Pro 及以上用户限 1 次/周期，借用下月 20% 配额；Free 用户不可

---

## 6. Pricing Tier 表

| Tier | 月价 | 年价（-17%）| Monthly credits | 滚存 | Top-up 单价 | 产品数 | 主要功能 |
|------|------|-----|---|---|---|---|---|
| **Free** | $0 | — | **50 一次性**（demo 期）/ 20（上线后）| 永不过期 | 不可 | 1 | Lite 报告、查看前 2 section |
| **Pro** | **$39** | $390 | **100 / 月** | 月末清零 | **$0.50 / credit** | 1 | 完整报告、所有 section、PDF 导出、email 通知 |
| **Max** | **$119** | $1190 | **400 / 月** | 月末清零 | **$0.35 / credit** | 5 | Pro 全部 + 竞品追踪、API 访问、优先队列、周报 |
| **Enterprise** | 联系销售 | — | 定制 | 定制 | 定制 | ∞ | Max 全部 + SSO、多座位、SLA、白标、专属 onboarding |

### 6.1 各 tier 关键功能点（方便后端 feature-flag 判断）

```ts
type PlanFeatures = {
  max_products: number              // Free=1, Pro=1, Max=5, Ent=Infinity
  monthly_credits: number           // Free=0(只有 bonus), Pro=100, Max=400
  can_export_pdf: boolean           // Free=false, Pro+ =true
  can_track_competitors: boolean    // Free=false, Pro=false, Max+ =true
  can_api_access: boolean           // Free/Pro=false, Max+ =true
  can_borrow_credits: boolean       // Free=false, Pro+ =true
  queue_priority: 'low' | 'normal' | 'high'  // Free=low, Pro=normal, Max+ =high
  email_notifications: boolean      // Free=false, Pro+ =true
  seats: number                      // Free/Pro/Max=1, Ent=custom
}
```

---

## 7. 免费 vs 付费展示设计

### 7.1 展示模式：**模式 2 + 3 混合**（已选定）

- **前 2 个 section 全开**：产品定位、核心卖点分析 → 让用户真实感受到质量
- **后续 section 深度门控**：每个 section 展示标题 + 1-2 行 teaser + 模糊/遮罩
- **所有 section 对付费用户展示完整内容**

### 7.2 Lite 报告的 section 规划

| 顺序 | Section | Free 展示 | Paid 展示 |
|------|---------|----------|----------|
| 1 | 产品定位分析 | ✓ 完整 | ✓ 完整（相同）|
| 2 | 核心卖点提炼 | ✓ 完整 | ✓ 完整（相同）|
| 3 | 目标用户画像 | 预览 1 段 + 锁 | ✓ 完整（3 个 persona）|
| 4 | 竞品对比（Top 3）| 只显示竞品名 | ✓ Top 10 + 流量 + 关键词 |
| 5 | 关键词机会 | 显示数量 "15 个机会" | ✓ 完整列表 + 难度 |
| 6 | 内容 gap | 预览标题 | ✓ 完整推荐 + example |
| 7 | 渠道建议 | 预览前 2 个渠道 | ✓ 完整渠道矩阵 |
| 8 | 30 天 action plan | 完全锁定 | ✓ 完整 week-by-week |

### 7.3 服务端裁剪原则

**后端永远生成完整报告**（存在 `reports.content` 里）；前端按 `users.current_plan` 决定渲染哪些 section。原因：
1. 付费后 0 延迟解锁 —— 不需要"升级后重新生成"
2. 防爬虫绕过 —— 前端模糊是装饰，真数据永远在后端
3. Preview → Full 是同一份数据的不同 view，用户升级体验丝滑

---

## 8. UI 可见性要求

### 8.1 Credit 余额显示位置

1. **全局顶部导航栏**：`● 87 / 100 credits`（Cursor 风格），hover 显示详细拆分
2. **每次动作前**：模态框确认 "This will use **10 credits**. Continue?"（可在 settings 里关）
3. **动作完成后**：结果页顶部小提示 "Generated with 10 credits · 90 remaining"
4. **余额 <20%**：顶部 banner "You're running low. [Top up] or [Upgrade to Max]"
5. **余额为 0**：执行动作时弹全屏 modal（不是 block，是转化机会）
6. **Settings 页**：完整 credit history（ledger 查看）+ 按来源筛选

### 8.2 报告锁定遮罩的视觉

- **不用纯模糊**（容易被 DevTools 绕过）
- 用 `backdrop-filter: blur(8px)` + 顶层覆盖一张"解锁"卡片
- 真实内容由后端根据 plan 决定是否发送（前端没有完整数据就不能被绕过）
- 卡片 CTA："Unlock 5 sections · 10 credits"（明确告诉用户要多少）

---

## 9. 技术栈选型

| 层 | 选型 | 备注 |
|---|------|------|
| Auth | **Clerk** | 开箱即用、邮箱 magic link + Google SSO 一次配齐 |
| DB | **Supabase Postgres** | 免费 tier 够 demo；Row Level Security 天然多租户 |
| 支付 | **LemonSqueezy** | Merchant of Record，自动税务；webhook 简单 |
| 邮件 | **Resend** | 100 邮件/天免费；React Email 组件库 |
| 文件存储 | **Supabase Storage** | 报告 PDF 导出缓存、产品截图 |
| 队列（异步报告生成）| **Vercel KV + Next API** | 或 Inngest，Demo 阶段 KV 够 |
| 前端 | 现有 Next.js 14 App Router | 不变 |
| 监控 | **Sentry** | 生成 pipeline 的错误追踪关键 |

**不选的东西**（避免过度工程化）：
- 不用 Redis（Supabase 够）
- 不用自建 auth（JWT/next-auth 都不如 Clerk 省时间）
- 不用 Prisma（Supabase client 够直观）

---

## 10. Phase 拆分 + Deliverables

### Phase 1 — 基础设施（Week 1）

**目标**：auth + db + email + 数据模型落地，能跑通注册登录。

- [ ] Clerk 项目创建，接入 Next.js middleware
- [ ] Supabase 项目创建，migration 里建上面所有表
- [ ] Resend 接入，magic link 邮件模板（用 React Email）
- [ ] 现有 `store.ts` 里的 `_projects` 迁移到按 `user_id` 分桶
- [ ] Cycle 3 的 `projectPersistence.ts` 改成 per-user 目录（`data/users/<user_id>/projects`）
- [ ] 新建 `src/lib/auth.ts`、`src/lib/db.ts`、`src/lib/creditLedger.ts`
- [ ] 写 fixture 测试 ledger 的消耗优先级（FIFO by expiry）

**验收**：xu 能用自己邮箱注册、登录、看到空的 `/project` 页面（账号隔离）

### Phase 2 — Anonymous 试用 + Lite 报告（Week 2）

**目标**：登录页旁边的"试用"入口跑通，能生成 lite 报告。

- [ ] 新建 `/try` anonymous 入口页，只有一个 URL 输入框
- [ ] 新建 `/api/report/lite` route，接收 URL → 启动生成 pipeline
- [ ] Report 生成 pipeline v1（URL 抓取 → LLM 分析 → 结构化 section）
- [ ] 新建 `/report/[id]` 展示页，支持 anonymous 和 logged-in 两种状态
- [ ] 前 2 section 全开 + 后面锁定的 UI 实现
- [ ] anonymous report → user 的 migration 逻辑（注册时触发）

**验收**：陌生访客能输入 URL、看到生成进度、看到 lite 报告的免费部分

### Phase 3 — Credit 系统 + Pricing（Week 3）

**目标**：credit 可以发放、消耗、审计；pricing 页可 checkout。

- [ ] `/api/credits/balance` / `reserve` / `commit` / `rollback` 四个 route
- [ ] 全局顶部 nav 加 credit 余额显示组件
- [ ] 动作前的 credit 消耗确认 modal
- [ ] LemonSqueezy 产品 / variant 配置（Pro 月/年 + Max 月/年 + top-up 三档）
- [ ] LemonSqueezy webhook handler → 写 `subscriptions` 和 `credit_ledger`
- [ ] `/pricing` 页面（3 tier 卡片 + annual toggle + 当前 plan 高亮）
- [ ] Top-up 页面 + checkout flow

**验收**：xu 能从 Free 升级到 Pro，看到 credit 余额变化、能真实消耗生成 Full report

### Phase 4 — Retention + 通知（Week 3-4）

**目标**：用户回来有理由、用户知道发生了什么。

- [ ] 报告生成完成 email 通知（Resend + React Email 模板）
- [ ] 余额 <20% 提醒 email
- [ ] 订阅即将到期 email
- [ ] Demo 期 retargeting 序列（生成报告后 day 1, day 3, day 7 邮件）
- [ ] Settings 页 credit history（ledger 可视化）
- [ ] 超限时的 top-up / upgrade / borrow 三选一 modal

**验收**：整条链路体验连贯，有一个新用户能从登录页看到产品 URL 输入框，30 分钟内完成注册 + 付费 + 看到完整报告。

---

## 11. 开放待办事项（非阻塞，但后续要定）

### 11.1 已决策（2026-04-08, xu 拍板）

- **Q11.1 LLM 选型**：**Claude Opus 4.6**（`claude-opus-4-6`）
  - 理由：demo 期追求最高报告质量，不考虑成本
  - 风险：Opus 定价约 $15/Mtoken 输入 + $75/Mtoken 输出，一份完整报告 30-80K token 可能 $2-6/份，远高于 Sonnet 的 $0.30-1.50
  - 上线前切换点：demo 结束准备正式上线时，需要基于真实转化率重新评估是否降级到 Sonnet 或混合（Full report 用 Opus、Ad variant 用 Haiku）
- **Q11.2 URL 抓取策略**：**双路径**
  - **本地开发环境**：`fetch + @mozilla/readability` —— 零依赖启动，xu `npm run dev` 立即可用，不用装 chromium
  - **Vercel 生产环境**：**Playwright headless**（用 `@sparticuz/chromium` + `playwright-core`，serverless-friendly 的精简 chromium 包）—— 能抓 SPA / 需要 JS 渲染的页面
  - 统一接口：`src/lib/urlScraper.ts` 导出 `scrapeUrl(url)`，根据 `process.env.VERCEL` 或 `NODE_ENV` 自动分派
  - 返回统一形状：`{ title, description, mainText, lang, ogImage, headings, links }`
- **Q11.3 App Store / Google Play URL**：**不做特殊处理**
  - demo 期直接报错："Sorry, App Store and Google Play links are not supported yet. Please paste your product's website URL instead."
  - 通过正则识别：`/apps\.apple\.com|play\.google\.com/` 触发友好错误 UI
  - 正式上线后再评估是否接入 app store scraper（有开源包 `app-store-scraper` / `google-play-scraper` 可用）

### 11.2 上线前必须解决

- [ ] TOS、Privacy Policy（建议用 Termly 生成模板）
- [ ] GDPR cookie banner（欧盟用户）
- [ ] 退款政策页面
- [ ] "Delete my account" 流程
- [ ] 支付失败 grace period 的具体策略（现定 14 天）

### 11.3 Demo 期不做，正式期再做

- Team seats（Max 也按 1 座位算，Enterprise 再开多座）
- Affiliate 计划
- 白标 / 自定义域名
- A/B 测试框架
- 用户行为分析（PostHog / Mixpanel）

---

## 12. 风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Clerk / Supabase / LemonSqueezy 某家宕机 | 低 | 高 | 错开部署，每层都能独立 mock；Clerk 有 99.99% SLA |
| Demo 期大量免费注册把成本拖爆 | 中 | 中 | 限制每 IP / 天 1 次 anonymous lite 生成；注册前要 email |
| Report 生成 pipeline 耗时 > 2 分钟 | 中 | 高 | 异步队列 + 进度推送 + email 通知 ready |
| Credit ledger 数据不一致 | 低 | 极高 | append-only + 每次动作冗余 balance_after + 每日对账 job |
| LemonSqueezy webhook 丢失 | 中 | 中 | 本地 retry queue + 每小时 poll LS API 对账 |

**回滚原则**：整套系统分 4 个 phase，每个 phase 可独立回退 —— Phase 3 失败不影响 Phase 1/2，用户最多看不到 pricing，但注册 + 试用仍可用。

---

## 13. 下一步

1. xu 把本文档 review 一遍，确认所有细节（特别是 Credit 消耗表的数字）
2. xu 回答 **Q11.1 / Q11.2 / Q11.3**（LLM 选型、抓取器、App Store URL 处理）
3. 创建 Clerk、Supabase、LemonSqueezy、Resend 4 个账号，把 API key 填入 `.env.local`
4. 开始 Phase 1 开发

**预估总工时**：3-4 周到 first paying customer。如果 xu 全程亲自 review，可压到 3 周。

---

**文档维护规则**：
- 每次架构变更先改本文档再改代码
- 每个 Phase 结束后在对应段落打 ✓ 并写完成日期
- 与 `docs/capability-tree.md` 的关系：本文档是**产品层**（what），capability-tree 是**技术能力层**（how）
- 与 `docs/evolution-log.md` 的关系：本文档是**前瞻性 spec**，evolution-log 是**回顾性日志**
