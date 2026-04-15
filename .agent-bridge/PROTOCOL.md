# Agent Bridge Protocol v1.0

> OpenClaw <-> Claude Code 协作协议
> 最后更新: 2026-04-13

---

## 1. 架构概览

双通道协作：

```
OpenClaw (无网络限制)                  Claude Code (有代码能力)
    |                                       |
    |--- 文件系统 (.agent-bridge/) -------->|  丰富内容：报告、图片、视频、网页快照
    |<-- 文件系统 (.agent-bridge/) ---------|  执行结果、代码变更记录
    |                                       |
    |--- Supabase (REST API) ------------->|  结构化数据：知识条目、市场情报
    |<-- Supabase (REST API) --------------|  进化状态、任务结果
```

**原则：**
- 文件系统负责"丰富内容"传递（多格式、大文件、人可读）
- Supabase 负责"结构化数据"持久化（应用直接消费、可查询、可统计）
- 每个投递必须有 manifest.json 描述内容，消费者先读 manifest 再处理文件

---

## 2. 目录结构

```
moboost-maas/.agent-bridge/
├── PROTOCOL.md                    # 本文件（协议定义）
├── config.json                    # 全局配置
│
├── inbox/                         # OpenClaw -> Claude Code（待处理）
│   └── {timestamp}_{topic}/       # 每次投递一个文件夹
│       ├── manifest.json          # 投递清单（必须）
│       ├── report.md              # 分析报告
│       ├── screenshots/           # 截图
│       │   ├── competitor_a.png
│       │   └── competitor_b.png
│       ├── videos/                # 视频素材
│       │   └── ad_sample.mp4
│       ├── raw_html/              # 原始网页快照
│       │   └── landing_page.html
│       ├── data.json              # 结构化数据提取
│       └── attachments/           # 其他附件（PDF、docx 等）
│
├── outbox/                        # Claude Code -> OpenClaw（执行结果）
│   └── {timestamp}_{topic}/
│       ├── manifest.json
│       ├── result.md              # 执行摘要
│       ├── code_changes.diff      # 代码变更
│       └── next_tasks.json        # 建议的后续任务
│
├── tasks/                         # 任务队列
│   ├── pending/                   # 待执行
│   │   └── {id}.json
│   ├── running/                   # 执行中
│   │   └── {id}.json
│   └── done/                      # 已完成
│       └── {id}.json
│
├── shared/                        # 共享资源（双方都可读写）
│   ├── knowledge_cache/           # 知识缓存（避免重复采集）
│   ├── templates/                 # 共享模板
│   └── assets/                    # 共享素材库
│       ├── competitor_creatives/   # 竞品素材
│       ├── industry_reports/       # 行业报告（PDF/docx）
│       └── screenshots/           # 网页截图
│
└── logs/                          # 协作日志
    └── {date}.jsonl               # 每日操作日志
```

---

## 3. Manifest 规范

每次投递的根目录必须包含 `manifest.json`，这是消费者的入口点。

```jsonc
{
  // 元信息
  "version": "1.0",
  "id": "20260413-150000-competitor-scan",
  "created_at": "2026-04-13T15:00:00+08:00",
  "created_by": "openclaw",            // "openclaw" | "claude_code" | "human"
  "topic": "Q2 竞品广告素材扫描",
  "category": "competitor",             // 对应 KnowledgeCategory
  "priority": 7,                        // 1-10
  
  // 投递内容描述
  "files": [
    {
      "path": "report.md",
      "type": "report",                 // 文件角色：report, data, screenshot, video, webpage, attachment, diff, task
      "format": "markdown",             // 文件格式
      "description": "Optimove/GR8 Tech/Altenar 三家竞品 Q2 广告策略分析",
      "size_bytes": 15200,
      "language": "zh-CN"
    },
    {
      "path": "screenshots/competitor_a.png",
      "type": "screenshot",
      "format": "png",
      "description": "Optimove 最新 Facebook 广告截图",
      "size_bytes": 245000,
      "metadata": {
        "source_url": "https://facebook.com/ads/library/...",
        "captured_at": "2026-04-13T14:30:00+08:00",
        "dimensions": { "width": 1200, "height": 628 }
      }
    },
    {
      "path": "videos/ad_sample.mp4",
      "type": "video",
      "format": "mp4",
      "description": "GR8 Tech Instagram Reel 广告样本",
      "size_bytes": 5242880,
      "metadata": {
        "duration_sec": 15,
        "dimensions": { "width": 1080, "height": 1920 },
        "source_url": "https://instagram.com/reel/..."
      }
    },
    {
      "path": "data.json",
      "type": "data",
      "format": "json",
      "description": "结构化竞品数据，可直接入库",
      "schema": "KnowledgeEntry[]"      // 对应项目中的 TypeScript 类型
    },
    {
      "path": "attachments/igaming_report_q1.pdf",
      "type": "attachment",
      "format": "pdf",
      "description": "H2 Global Gaming Report Q1 2026",
      "size_bytes": 3145728
    }
  ],
  
  // 数据库写入指令（可选）
  "db_actions": [
    {
      "table": "industry_knowledge",
      "action": "upsert",               // "insert" | "upsert" | "update"
      "data_file": "data.json",          // 指向 files 中的 data 文件
      "conflict_key": ["source_url"]     // upsert 去重键
    }
  ],
  
  // 消费者应执行的动作（建议性，非强制）
  "suggested_actions": [
    "将 data.json 中的 KnowledgeEntry 写入 industry_knowledge 表",
    "基于竞品分析触发 Cross-Eval 进化机制",
    "将截图存入 shared/assets/competitor_creatives/"
  ],
  
  // 关联信息
  "related_tasks": ["task-20260413-001"],
  "tags": ["competitor", "igaming", "q2", "ad-creative"]
}
```

---

## 4. 任务格式

`tasks/pending/{id}.json`:

```jsonc
{
  "id": "task-20260413-001",
  "created_at": "2026-04-13T15:00:00+08:00",
  "created_by": "openclaw",
  "assigned_to": "claude_code",         // "openclaw" | "claude_code"
  "type": "pcec_cycle",                 // 任务类型
  "priority": 8,
  "title": "执行 PCEC 周期 #4",
  "description": "基于最新竞品情报执行进化周期",
  "context": {
    "trigger": "新竞品情报到达",
    "inbox_ref": "20260413-150000-competitor-scan",
    "knowledge_count": 12
  },
  
  // Claude Code 执行方式
  "execution": {
    "method": "cli",                    // "cli" = claude -p
    "command": "claude -p '执行 PCEC 周期，消费 .agent-bridge/inbox/20260413-150000-competitor-scan/ 中的情报数据'",
    "timeout_sec": 600,
    "working_dir": "~/Documents/moboost AI/moboost-maas"
  },
  
  "status": "pending",
  "started_at": null,
  "completed_at": null,
  "result_ref": null,                   // 完成后指向 outbox/ 中的结果文件夹
  "error": null
}
```

---

## 5. 支持的文件类型

| 格式 | 扩展名 | 用途 | 生产者 | 消费者 |
|------|--------|------|--------|--------|
| Markdown | .md | 分析报告、摘要、说明文档 | 双方 | 双方 |
| JSON | .json | 结构化数据、manifest、配置 | 双方 | 双方 |
| JSONL | .jsonl | 日志、批量数据 | 双方 | 双方 |
| HTML | .html | 网页快照、爬取的原始页面 | OpenClaw | Claude Code |
| PNG/JPG/WebP | .png/.jpg/.webp | 截图、广告素材、设计稿 | OpenClaw | Claude Code |
| MP4/MOV | .mp4/.mov | 视频广告样本、录屏 | OpenClaw | Claude Code |
| PDF | .pdf | 行业报告、法规文件 | OpenClaw | Claude Code |
| DOCX | .docx | 正式报告、分析文档 | 双方 | 双方 |
| CSV/TSV | .csv/.tsv | 表格数据、导出数据 | 双方 | 双方 |
| DIFF | .diff | 代码变更记录 | Claude Code | OpenClaw |
| YAML | .yml | 配置文件 | 双方 | 双方 |

---

## 6. Supabase 通道

### 6.1 OpenClaw 访问方式

OpenClaw 通过 Supabase REST API 或 supabase-py 访问数据库。需要以下环境变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 6.2 可读写的表

**双方均持有 SERVICE_ROLE_KEY，拥有所有表的完整读写权限（bypass RLS）。**

| 表 | 说明 |
|----|------|
| industry_knowledge | 行业知识库（情报主存储） |
| exploration_tasks | 探索任务队列 |
| exploration_schedule | 定时探索计划 |
| market_intel | 市场情报快照（VerticalIntel） |
| evolution_candidates | 进化候选 |
| evolution_mutations | 进化变异 |
| evolution_changelog | 进化日志 |
| evolution_goals | 进化目标 |
| 其他所有表 | 双方均可自由读写，无限制 |

### 6.3 文件 vs 数据库的选择原则

| 数据特征 | 走文件系统 | 走数据库 |
|----------|------------|----------|
| 二进制内容（图片/视频/PDF） | 是 | 否 |
| 人需要直接查看 | 是 | 否 |
| 长文本报告（>1000字） | 是（.md） | 否 |
| 结构化、需要查询/聚合 | 否 | 是 |
| 应用前端需要展示 | 否 | 是 |
| 临时性/一次性内容 | 是 | 否 |
| 需要跨时间对比 | 否 | 是 |
| 需要去重/更新 | 否 | 是（upsert） |

**混合模式：** 一个投递可以同时写文件和数据库。例如竞品分析：
- 截图/视频 → `shared/assets/competitor_creatives/`
- 分析报告 → `inbox/{id}/report.md`
- 结构化知识条目 → Supabase `industry_knowledge` 表
- manifest 记录所有内容位置 → `inbox/{id}/manifest.json`

---

## 7. 生命周期

### 7.1 OpenClaw 投递情报

```
1. OpenClaw 采集数据（网页、API、爬虫）
2. 整理为文件夹 + manifest.json
3. 写入 .agent-bridge/inbox/{timestamp}_{topic}/
4. 如有结构化数据，同时写入 Supabase
5. 创建任务 .agent-bridge/tasks/pending/{id}.json
6. 通过 CLI 触发 Claude Code:
   claude -p "新情报到达，请处理 .agent-bridge/inbox/{id}/"
```

### 7.2 Claude Code 处理

```
1. 读取 inbox 中的 manifest.json
2. 根据 files 列表处理各类文件
3. 根据 db_actions 写入/更新数据库
4. 执行 suggested_actions（如触发 PCEC）
5. 将结果写入 .agent-bridge/outbox/{timestamp}_{topic}/
6. 更新任务状态 tasks/pending -> tasks/done
7. 如有后续任务，写入 tasks/pending/
```

### 7.3 清理策略

| 目录 | 保留时间 | 清理方式 |
|------|----------|----------|
| inbox/ 已处理 | 7天 | 移入 archive/ 或删除 |
| outbox/ 已消费 | 7天 | 同上 |
| tasks/done/ | 30天 | 压缩归档 |
| shared/assets/ | 永久 | 手动管理 |
| logs/ | 30天 | 按日期滚动 |

---

## 8. 全局配置

`config.json`:

```jsonc
{
  "version": "1.0",
  "agents": {
    "openclaw": {
      "name": "OpenClaw",
      "capabilities": ["web_fetch", "web_crawl", "api_call", "screenshot", "video_download"],
      "trigger_method": "cli",
      "cli_command": "claude -p"
    },
    "claude_code": {
      "name": "Claude Code",
      "capabilities": ["code_edit", "db_write", "llm_process", "evolution"],
      "working_dir": "~/Documents/moboost AI/moboost-maas"
    }
  },
  "supabase": {
    "url_env": "NEXT_PUBLIC_SUPABASE_URL",
    "key_env": "SUPABASE_SERVICE_ROLE_KEY"
  },
  "defaults": {
    "priority": 5,
    "language": "zh-CN",
    "max_file_size_mb": 100,
    "retention_days": 7
  }
}
```

---

## 9. 日志格式

`logs/{date}.jsonl`，每行一条记录：

```jsonc
{"ts":"2026-04-13T15:00:00+08:00","agent":"openclaw","action":"deliver","target":"inbox/20260413-150000-competitor-scan","files":5,"bytes":5500000}
{"ts":"2026-04-13T15:01:00+08:00","agent":"claude_code","action":"consume","target":"inbox/20260413-150000-competitor-scan","status":"ok"}
{"ts":"2026-04-13T15:05:00+08:00","agent":"claude_code","action":"db_write","table":"industry_knowledge","rows":3}
{"ts":"2026-04-13T15:10:00+08:00","agent":"claude_code","action":"deliver","target":"outbox/20260413-151000-pcec-result","files":2}
```
