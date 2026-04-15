# 测试：Report 模块

## 测试矩阵

| # | 类型 | 描述 | 预期 |
|---|------|------|------|
| T1 | 单元 | `specValidator` 接受合法 schema | true |
| T2 | 单元 | `specValidator` 拒绝缺字段 | false + 错误明细 |
| T3 | 集成 | `/api/reports/generate` from brief | 返回完整 Report，校验通过 |
| T4 | 集成 | LLM 输出不合 schema | retry 一次，仍失败降级 simpler schema |
| T5 | 集成 | `/api/evolution/start` | v2 内容与 v1 有显著差异（diff > 30%） |
| T6 | E2E | 用户进入 Report 页 → 切 Tab → 触发演化 | UI 正常切换 |

## 历史 bug 回归

| Bug | 复现 | 用例 |
|-----|------|------|
| Report 视频无声 | 拿 OpenRouter 已有 jobId 下载 → 在 Report Tab 播放 | T_video_audio（见 video-test.md） |
| 报告 spec 校验偶发失败 | 用极端 brief 反复触发 | T_spec_retry |

## 测试入口

- 视觉：`/report/[id]` 直接访问已有报告

## 待补

- [ ] `/test/report` 测试页（用本地 fixture 渲染 Report）
- [ ] specValidator 单元测试
