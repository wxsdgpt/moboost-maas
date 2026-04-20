# Moboost Collaborator API — Integration Spec

**版本**: v1.0
**Base URL**: `https://your-moboost-domain.com/api/v1/collab`
**认证**: Bearer Token

---

## 一、对接前你需要拿到的东西

向 Moboost 管理员索取:

1. **Bearer Token** — 形如 `mb_xxxxxxxxxxxxxx`,由 Moboost 在 `/admin/collab` 页面生成,**只显示一次**,务必妥善保存
2. **Base URL** — 生产环境域名
3. **(可选) Webhook Secret** — 如果你想接收实时推送,提供一个你能接收 POST 的 HTTPS 地址,Moboost 会回给你一段 secret 用于验签

---

## 二、整体工作流

```
Moboost 端                              你的本地化端
─────────                              ──────────
1. 生成原始素材(图/视频/landing)
   │
   ├──(可选)webhook 推送 ─────────────► 收到通知,触发拉取
   │                                   或
   └──────── 你定时轮询 exports ◄─────── GET /reports/{id}/exports
                                        │
                                        ▼
                                       2. 拿到原始素材 URL/HTML
                                        │
                                        ▼
                                       3. 本地化处理(翻译/换图)
                                        │
                                        ├─► POST /uploads     ← 上传本地化后的图/视频
                                        │   返回 Storage URL
                                        │
                                        └─► POST /assets/{id}/localizations
                                            或  /landings/{id}/localizations
                                            提交 = 立即生效
```

**关键约定**:
- **提交即采用** — 没有审核环节,POST 成功后该语种版本立即生效
- **多版本保留** — 同一个 asset+locale 多次提交不会覆盖,新行追加,按 `created_at` 倒序排列,前端取最新
- **不可删除** — 提交后无法删除,要"撤回"就再 POST 一个新版本

---

## 三、认证

每个请求带上 HTTP header:

```
Authorization: Bearer mb_xxxxxxxxxxxxxxxxxx
```

错误响应:
```json
HTTP 401
{ "ok": false, "error": "unauthorized" }
```

Token 被吊销后立即失效,无宽限期。

---

## 四、API 端点

### 4.1 健康检查 / 验证 token

```
GET /api/v1/collab/health
```

**响应**:
```json
{
  "ok": true,
  "token": { "id": "uuid", "name": "Acme Loc Team", "prefix": "mb_AbCd" },
  "serverTime": "2026-04-15T10:30:00.000Z"
}
```

用途: 对接开发时第一个测试的端点;也可以放在监控里做存活探测。

---

### 4.2 拉取一个 report 的全部素材

```
GET /api/v1/collab/reports/{reportId}/exports?since=ISO_TIMESTAMP
```

**Query 参数**:
- `since` (可选) — ISO 8601 时间戳,只返回此时间之后创建的素材。增量轮询时使用。

**响应**:
```json
{
  "ok": true,
  "reportId": "uuid",
  "projectId": "uuid",
  "productId": "uuid",
  "landingPages": [
    {
      "id": "uuid",
      "template_id": "hero-cta",
      "status": "done",
      "model": "...",
      "html": "<!DOCTYPE html>...",
      "created_at": "2026-04-15T10:00:00.000Z"
    }
  ],
  "creatives": [
    {
      "id": "uuid",
      "type": "image",
      "prompt": "Latino male, 25-35, sports betting...",
      "url": "https://xxx.supabase.co/storage/v1/object/public/creatives/assets/xxx.png",
      "thumbnail": null,
      "model": "google/gemini-3-pro-image-preview",
      "audience_tag": "latam-sports-male",
      "region": "MX",
      "created_at": "2026-04-15T10:05:00.000Z"
    }
  ],
  "localizations": {
    "assets": [
      {
        "id": "uuid",
        "asset_id": "uuid",
        "locale": "es-MX",
        "url": "https://xxx.supabase.co/storage/v1/object/public/creatives/localizations/.../es-MX-abc.png",
        "metadata": {},
        "created_at": "2026-04-15T11:00:00.000Z"
      }
    ],
    "landings": [
      {
        "id": "uuid",
        "landing_page_id": "uuid",
        "locale": "es-MX",
        "html": "<!DOCTYPE html>...",
        "metadata": {},
        "created_at": "2026-04-15T11:30:00.000Z"
      }
    ]
  }
}
```

`creatives[i].url` 永远指向 Moboost 的 Supabase Storage,**不会过期**。`landingPages[i].html` 是完整 HTML 字符串。

`localizations` 部分让你看到自己已经提交过哪些版本,避免重复劳动。

---

### 4.3 上传本地化后的图/视频

```
POST /api/v1/collab/uploads
Content-Type: multipart/form-data
```

**Form 字段**:
- `file` — 必填,二进制文件(最大 50MB)
- `assetId` — 选填,对应原始素材 ID(用于路径归类)
- `landingId` — 选填,对应原始 landing ID(优先于 assetId)
- `locale` — 选填,BCP-47 语言代码(如 `es-MX`),嵌入文件名

**响应**:
```json
{
  "ok": true,
  "bucket": "creatives",
  "path": "localizations/<assetId>/es-MX-abc.png",
  "url": "https://xxx.supabase.co/storage/v1/object/public/creatives/localizations/<assetId>/es-MX-abc.png",
  "bytes": 234567,
  "contentType": "image/png"
}
```

把返回的 `url` 存下来,下一步要用。

**支持的文件类型**: PNG/JPG/WebP/GIF/MP4/WebM/MOV(应用层不强校验,Moboost 端按 `Content-Type` 透传)

---

### 4.4 提交图/视频本地化

```
POST /api/v1/collab/assets/{assetId}/localizations
Content-Type: application/json
```

**Body**:
```json
{
  "locale": "es-MX",
  "url": "https://xxx.supabase.co/storage/v1/object/public/creatives/localizations/.../es-MX-abc.png",
  "metadata": {
    "translator": "alice@loc-team.com",
    "notes": "Adapted CTA for Mexican Spanish"
  }
}
```

**字段**:
- `locale` — 必填,BCP-47
- `url` — 必填,通常是 4.3 上传后拿到的 URL(也可以是任意 https URL)
- `metadata` — 选填,任意 JSON,会原样存储

**响应**:
```json
{
  "ok": true,
  "localization": {
    "id": "uuid",
    "asset_id": "uuid",
    "locale": "es-MX",
    "url": "...",
    "metadata": {...},
    "created_at": "2026-04-15T11:00:00.000Z"
  }
}
```

**列出某 asset 已有的本地化**(GET 同一个 URL):
```
GET /api/v1/collab/assets/{assetId}/localizations
→ { "ok": true, "assetId": "...", "localizations": [...] }
```

---

### 4.5 提交 landing page 本地化

```
POST /api/v1/collab/landings/{landingId}/localizations
Content-Type: application/json
```

**Body**:
```json
{
  "locale": "es-MX",
  "html": "<!DOCTYPE html><html lang=\"es-MX\">...完整翻译后的 HTML...</html>",
  "metadata": { "translator": "alice@loc-team.com" }
}
```

**字段**:
- `locale` — 必填
- `html` — 必填,完整的 HTML 文档字符串
- `metadata` — 选填

**响应**:
```json
{
  "ok": true,
  "localization": {
    "id": "uuid",
    "landing_page_id": "uuid",
    "locale": "es-MX",
    "html": "...",
    "created_at": "..."
  }
}
```

**列出**: `GET /api/v1/collab/landings/{landingId}/localizations`

---

## 五、Webhook(可选)

如果你提供了 webhook URL,Moboost 会在以下事件发生时主动 POST 给你:

| Event | 触发时机 |
|---|---|
| `asset.created` | 用户首次生成图/视频 |
| `asset.regenerated` | 用户在 report 页重新生成图/视频 |
| `landing.created` | 首次生成 landing |
| `landing.regenerated` | 重新生成 landing |

### 5.1 请求格式

```
POST <你提供的 webhook URL>
Content-Type: application/json
X-Moboost-Event: asset.created
X-Moboost-Signature: sha256=<HMAC-SHA256 hex>

{
  "event": "asset.created",
  "timestamp": "2026-04-15T10:05:00.000Z",
  "payload": {
    "assetId": "uuid",
    "reportId": "uuid",
    "projectId": "uuid",
    "type": "image",
    "url": "https://...",
    "audienceTag": "latam-sports-male",
    "region": "MX",
    "createdAt": "..."
  }
}
```

`landing.*` 事件的 payload:
```json
{
  "landingId": "uuid",
  "reportId": "uuid",
  "projectId": "uuid",
  "productId": "uuid",
  "templateId": "hero-cta",
  "createdAt": "..."
}
```

### 5.2 验签(必做)

```js
const crypto = require('crypto')

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)         // ⚠️ 必须是 raw bytes,不是 JSON.parse 之后
    .digest('hex')
  return signatureHeader === expected
}
```

Express 接收端示例:
```js
app.post('/webhooks/moboost',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!verify(req.body, req.header('X-Moboost-Signature'), process.env.MOBOOST_SECRET)) {
      return res.status(401).end()
    }
    const event = JSON.parse(req.body.toString())
    handleEvent(event)
    res.status(200).end()
  }
)
```

### 5.3 投递语义

- **Fire-and-forget**: Moboost 不重试,网络错误/5xx 都不会重发
- **不保证顺序**: 高并发下事件顺序可能乱,请用 `payload.createdAt` 排序
- **可能丢失**: 因此你应该**同时实现轮询兜底** — 周期性调用 `/reports/{id}/exports?since=...`,以防 webhook 漏掉

---

## 六、错误码

| HTTP | error | 含义 |
|---|---|---|
| 400 | `locale_and_url_required` / `locale_and_html_required` / `file_required` / `multipart_required` / `id_required` / `name_required` | 请求参数缺失 |
| 401 | `unauthorized` | Token 无效或已撤销 |
| 404 | `report_not_found` / `asset_not_found` / `landing_not_found` | 资源不存在 |
| 413 | `file_too_large` | 上传超 50MB |
| 500 | `db_error` / `upload_failed` | 服务端故障 |

所有响应统一格式: `{ "ok": false, "error": "...", "detail"?: "..." }`

---

## 七、推荐对接流程

### 阶段 1 — 环境联调(半天)

1. 拿到 token,跑 `GET /health` 确认连通
2. 找一个测试 report ID,跑 `GET /reports/{id}/exports`
3. 浏览返回的 `creatives[].url`,确认能直接打开
4. 上传一个测试文件到 `/uploads`,确认拿到的 URL 也能打开
5. 用测试文件 POST 一个 localization,然后再 GET exports 确认出现在 `localizations` 里

### 阶段 2 — 生产对接(1~2 天)

1. 部署 webhook 接收端,实现验签
2. 配置一个定时任务(建议 5~15 分钟一次)兜底轮询 exports
3. 在你的本地化平台里建立 `(reportId, assetId, locale)` 三元组的状态机:`pending → in_translation → submitted`
4. 提交 = 调用 POST localization,记录返回的 `localization.id` 作为审计

### 阶段 3 — 上线

- 监控:`/health` 心跳 + webhook 接收成功率 + 轮询拉取量
- 告警:连续 3 次 401 → token 可能被吊销,联系 Moboost
- 日志:保留 webhook 原始 body 至少 30 天(便于排查投递问题)

---

## 八、限制 & 边界

- **配额**: 暂无硬性限制,但 token 是单租户共享的,请控制并发(建议 ≤ 10 QPS)
- **文件大小**: 单文件 ≤ 50MB
- **Token 生命周期**: 不会自动过期,只能管理员主动撤销
- **HTTPS only**: 所有端点必须走 HTTPS,HTTP 会被拒绝(生产环境)
- **CORS**: 不开放,这是 server-to-server API,不要在浏览器里直接调用

---

## 九、快速验证清单(交付协作方时一并发出)

```bash
# 1. 健康检查
curl https://YOUR_DOMAIN/api/v1/collab/health \
  -H "Authorization: Bearer mb_xxx"

# 2. 拉取 report
curl "https://YOUR_DOMAIN/api/v1/collab/reports/REPORT_UUID/exports" \
  -H "Authorization: Bearer mb_xxx"

# 3. 上传文件
curl -X POST https://YOUR_DOMAIN/api/v1/collab/uploads \
  -H "Authorization: Bearer mb_xxx" \
  -F "file=@./localized.png" \
  -F "assetId=ASSET_UUID" \
  -F "locale=es-MX"

# 4. 提交本地化(用第 3 步返回的 url)
curl -X POST https://YOUR_DOMAIN/api/v1/collab/assets/ASSET_UUID/localizations \
  -H "Authorization: Bearer mb_xxx" \
  -H "Content-Type: application/json" \
  -d '{"locale":"es-MX","url":"https://xxx.supabase.co/.../es-MX-abc.png"}'
```

---

## 联系方式

技术对接: [Moboost 工程负责人邮箱]
Token 发放/吊销: [管理员邮箱]
紧急故障: [运维值班渠道]
