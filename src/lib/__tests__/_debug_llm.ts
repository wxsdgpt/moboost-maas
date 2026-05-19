/**
 * 调试脚本 — 看 Claude 到底返回了什么
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(__dirname, '../../../.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {}

async function debug() {
  const key = process.env.OPENROUTER_API_KEY!;
  
  console.log('🔍 调用 Claude 生成分镜...\n');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'system',
          content: `你是专业分镜脚本师。用户给你剧本，你输出纯 JSON（不要 markdown 包裹，不要 \`\`\`）。

JSON 结构：
{
  "title": "标题",
  "characters": [{"id": "c1", "name": "名字", "description": "外貌描述"}],
  "scenes": [
    {
      "order": 1,
      "description": "画面描述",
      "dialogue": null,
      "camera": {"shot": "中景", "angle": "平视", "movement": "固定", "composition": "居中"},
      "characterIds": ["c1"],
      "emotion": "氛围",
      "duration": 5
    }
  ]
}

严格要求：
- 直接输出 JSON，第一个字符必须是 {
- 不要任何解释文字
- 不要 markdown 代码块
- dialogue 如果没有就写 null
- 最多 5 个分镜
- description 用中文直白描述画面`
        },
        {
          role: 'user',
          content: '30秒武侠短视频：白衣剑客在竹林中与黑衣杀手决斗，白衣剑客用"飞花逐月"获胜。风格2D动漫。'
        }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  
  console.log('📦 原始返回 (' + raw.length + ' 字):');
  console.log('---RAW START---');
  console.log(raw);
  console.log('---RAW END---\n');

  // 尝试解析
  try {
    let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('✅ JSON 解析成功！');
    console.log(`标题: ${parsed.title}`);
    console.log(`角色: ${parsed.characters?.length} 个`);
    console.log(`分镜: ${parsed.scenes?.length} 个`);
    
    for (const s of parsed.scenes || []) {
      console.log(`  分镜 ${s.order}: ${s.description?.substring(0, 50)}... [${s.camera?.shot}/${s.camera?.movement}] ${s.duration}s`);
    }
  } catch (e) {
    console.log('❌ 解析失败:', e);
    console.log('\n🔍 检查第 1601 字符附近:');
    console.log(raw.substring(1580, 1620));
    console.log('\n🔍 特殊字符检测:');
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code > 127 && code !== 0x201C && code !== 0x201D && code !== 0x3001 && code !== 0xFF0C && code < 0x4E00) {
        console.log(`  位置 ${i}: char='${raw[i]}' code=U+${code.toString(16)}`);
      }
    }
  }
}

debug();
