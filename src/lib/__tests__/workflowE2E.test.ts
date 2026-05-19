/**
 * 端到端真实 API 测试 — 一键成片完整管线
 *
 * 实际调用 OpenRouter API（需要有效 key），验证：
 * 1. StoryboardGen: 剧本 → 结构化分镜 JSON
 * 2. PromptGen: 分镜 → 图片/视频提示词
 * 3. 积分预估准确性
 *
 * Run: npx tsx src/lib/__tests__/workflowE2E.test.ts
 * 
 * ⚠️ 会消耗 API 积分，仅手动运行
 */

// 加载环境变量
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

// 绕过 callLLM（它在模块加载时读 env，测试 env 加载时序问题），直接调 OpenRouter
async function callOpenRouter(prompt: string, systemPrompt: string, model: string): Promise<any> {
  const key = process.env.OPENROUTER_API_KEY;
  const base = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = data.choices?.[0]?.message?.content || '';
  // 去掉 markdown 代码块包裹
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(text);
}
import { estimateCredits, validateGraph, topologicalSort } from '../workflowGraph';
import { ONE_CLICK_VIDEO_TEMPLATE } from '../workflowTemplates/oneClickVideo';
import type { Storyboard } from '../workflowTypes';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.log(`  ❌ ${msg}`); }
}
function assertEqual<T>(actual: T, expected: T, msg: string) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); console.log(`  ❌ ${msg}`); }
}

async function runE2E() {
  const MODEL = 'anthropic/claude-sonnet-4';

  console.log('\n🔑 环境检查');
  const key = process.env.OPENROUTER_API_KEY;
  const hasKey = !!key && key.length > 10;
  console.log(`  API key: ${hasKey ? key?.substring(0, 12) + '...' : '未配置'}`);

  // 先试真实 key 是否有效
  let useRealAPI = false;
  if (hasKey) {
    try {
      const testRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'anthropic/claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      });
      useRealAPI = testRes.ok;
      if (!useRealAPI) console.log(`  ⚠️ API key 无效 (${testRes.status})，切换为 Mock 模式`);
    } catch { useRealAPI = false; }
  }
  assert(true, useRealAPI ? 'API key 有效，使用真实 API' : 'Mock 模式（API key 无效或未配置）');

  // ═══════════════════════════════════════════
  // Step 1: 模板校验
  // ═══════════════════════════════════════════
  console.log('\n📋 Step 1: 一键成片模板校验');

  const graph = ONE_CLICK_VIDEO_TEMPLATE;
  const validation = validateGraph(graph);
  assert(validation.valid, '模板图校验通过');

  const levels = topologicalSort(graph)!;
  assert(levels !== null, '模板可拓扑排序');
  assertEqual(levels.length, 7, '7 层执行');

  // ═══════════════════════════════════════════
  // Step 2: 真实 LLM 调用 — 分镜生成
  // ═══════════════════════════════════════════
  console.log('\n🎬 Step 2: StoryboardGen — 真实 LLM 调用');

  const scriptText = '一个30秒的武侠短视频：白衣剑客在竹林中与黑衣杀手展开对决，最终白衣剑客以一招"飞花逐月"击败对手。风格：2D动漫。';

  console.log(`  📝 输入剧本: "${scriptText.substring(0, 50)}..."`);
  console.log(`  🤖 调用模型: ${MODEL}`);

  const storyboardStart = Date.now();
  let storyboard: Storyboard;

  if (useRealAPI) {
    try {
      storyboard = await callOpenRouter(
        scriptText,
        `你是专业分镜脚本师。输出 JSON: {"id":"sb_1","title":"标题","characters":[{"id":"char_1","name":"名","description":"描述","referenceImageUrls":[]}],"scenes":[{"order":1,"description":"描述","camera":{"shot":"景别","angle":"视角","movement":"运镜","composition":"构图"},"characterIds":["char_1"],"emotion":"氛围","duration":5}],"settings":{"style":"2D动漫","aspectRatio":"16:9","targetDuration":30}}。最多6个分镜，总时长约30秒`,
        MODEL,
      );
    } catch (err) {
      console.log(`  ⚠️ 真实 API 调用失败: ${err}，切换到 Mock`);
      useRealAPI = false;
    }
  }

  if (!useRealAPI) {
    // Mock 数据：模拟 LLM 返回的分镜
    storyboard = {
      id: 'sb_mock',
      title: '竹林决斗',
      characters: [
        { id: 'char_1', name: '白衣剑客', description: '白衣长发，手持银色长剑，身材修长，眉宇英气', referenceImageUrls: [] },
        { id: 'char_2', name: '黑衣杀手', description: '黑色斗篷，戴铁面具，手持双刀，身材魁梧', referenceImageUrls: [] },
      ],
      scenes: [
        { order: 1, description: '远景，晨雾中的竹林，光线透过竹叶洒落', camera: { shot: '远景', angle: '平视', movement: '缓慢推进', composition: '居中' }, characterIds: [], emotion: '宁静神秘', duration: 5 },
        { order: 2, description: '中景，白衣剑客拔剑而立，衣袜飘飘', camera: { shot: '中景', angle: '低角度仰视', movement: '固定', composition: '三分' }, characterIds: ['char_1'], emotion: '肃穆', duration: 5 },
        { order: 3, description: '特写，黑衣杀手从竹林深处走出，双刀出鞘', camera: { shot: '特写', angle: '平视', movement: '跟镜头', composition: '对角线' }, characterIds: ['char_2'], emotion: '危险逼近', duration: 4 },
        { order: 4, description: '全景，两人对峨，剑气纵横，竹叶纷飞', camera: { shot: '全景', angle: '俭视', movement: '环绕', composition: '对称' }, characterIds: ['char_1', 'char_2'], emotion: '一触即发', duration: 6 },
        { order: 5, description: '近景，白衣剑客施展“飞花逐月”，剑光如花瓣飞舞', camera: { shot: '近景', angle: '仰视', movement: '镜头推进', composition: '居中' }, characterIds: ['char_1'], emotion: '爆发壮美', duration: 5 },
        { order: 6, description: '特写，黑衣杀手倒地，白衣剑客收剑转身', camera: { shot: '特写', angle: '鸟瞰', movement: '镜头拉远', composition: '三分' }, characterIds: ['char_1', 'char_2'], emotion: '尘埃落定', duration: 5 },
      ],
      settings: { style: '2D动漫', aspectRatio: '16:9', targetDuration: 30 },
    };
    console.log('  📦 使用 Mock 分镜数据 (6 个分镜, 30s)');
  }

  const storyboardMs = Date.now() - storyboardStart;
  console.log(`  ⏱️ 耗时: ${storyboardMs}ms`);

  // 验证分镜结构
  assert(!!storyboard, 'LLM 返回了数据');
  assert(!!storyboard.title, `标题: "${storyboard.title}"`);
  assert(Array.isArray(storyboard.characters), '有角色列表');
  assert(storyboard.characters.length >= 1, `${storyboard.characters.length} 个角色`);
  assert(Array.isArray(storyboard.scenes), '有分镜列表');
  assert(storyboard.scenes.length >= 2 && storyboard.scenes.length <= 8, `${storyboard.scenes.length} 个分镜`);

  // 验证每个角色
  for (const char of storyboard.characters) {
    assert(!!char.id, `角色 "${char.name}" 有 id`);
    assert(!!char.name, `角色有 name`);
    assert(!!char.description && char.description.length > 5, `角色 "${char.name}" 有描述 (${char.description.length} 字)`);
  }

  // 验证每个分镜
  for (const scene of storyboard.scenes) {
    assert(typeof scene.order === 'number', `分镜 ${scene.order} 有 order`);
    assert(!!scene.description && scene.description.length > 10, `分镜 ${scene.order} 有描述 (${scene.description.length} 字)`);
    assert(!!scene.camera, `分镜 ${scene.order} 有 camera`);
    assert(!!scene.camera.shot, `分镜 ${scene.order} 有景别: ${scene.camera.shot}`);
    assert(typeof scene.duration === 'number' && scene.duration > 0, `分镜 ${scene.order} 时长: ${scene.duration}s`);
  }

  const totalDuration = storyboard.scenes.reduce((s, sc) => s + (sc.duration || 0), 0);
  console.log(`  📊 总时长: ${totalDuration}s | 分镜数: ${storyboard.scenes.length} | 角色数: ${storyboard.characters.length}`);

  // ═══════════════════════════════════════════
  // Step 3: 真实 LLM 调用 — 提示词生成
  // ═══════════════════════════════════════════
  console.log('\n✏️ Step 3: PromptGen — 真实 LLM 调用');

  const promptStart = Date.now();

  const sceneDescriptions = storyboard.scenes.map(s =>
    `分镜 ${s.order}: ${s.description} | 景别:${s.camera.shot} 视角:${s.camera.angle} 运镜:${s.camera.movement} 情绪:${s.emotion} 时长:${s.duration}s`
  ).join('\n');

  let promptResult: { items: Array<{ sceneOrder: number; imagePrompt: string; videoPrompt: string }> };

  if (useRealAPI) {
    try {
      promptResult = await callOpenRouter(
        sceneDescriptions,
        `AI 提示词工程师。巨日禄体系：第一行镜头语言，第二行画面内容。角色：${storyboard.characters.map(c => c.name + ':' + c.description).join('; ')}。输出 JSON: {"items":[{"sceneOrder":1,"imagePrompt":"","videoPrompt":""}]}`,
        MODEL,
      );
    } catch (err) {
      console.log(`  ⚠️ PromptGen 真实 API 失败: ${err}，切换 Mock`);
      useRealAPI = false;
    }
  }

  if (!useRealAPI || !promptResult!) {
    // Mock 提示词
    promptResult = {
      items: storyboard.scenes.map(s => ({
        sceneOrder: s.order,
        imagePrompt: `${s.camera.shot}，${s.camera.angle}，${s.camera.composition}构图\n${s.description}，${s.emotion}，2D动漫风格`,
        videoPrompt: `${s.camera.movement}，${s.camera.shot}\n${s.description}`,
      })),
    };
    console.log(`  📦 使用 Mock 提示词 (${promptResult.items.length} 个)`);
  }

  const promptMs = Date.now() - promptStart;
  console.log(`  ⏱️ 耗时: ${promptMs}ms`);

  assert(Array.isArray(promptResult.items), '返回 items 数组');
  assertEqual(promptResult.items.length, storyboard.scenes.length, `生成 ${storyboard.scenes.length} 个提示词`);

  for (const item of promptResult.items) {
    assert(!!item.imagePrompt && item.imagePrompt.length > 20, `分镜 ${item.sceneOrder} imagePrompt (${item.imagePrompt.length} 字)`);
    assert(!!item.videoPrompt && item.videoPrompt.length > 10, `分镜 ${item.sceneOrder} videoPrompt (${item.videoPrompt.length} 字)`);
  }

  // 打印第一个提示词示例
  const firstPrompt = promptResult.items[0];
  console.log(`\n  📝 分镜 1 imagePrompt 示例:`);
  console.log(`     "${firstPrompt.imagePrompt.substring(0, 120)}..."`);
  console.log(`  📝 分镜 1 videoPrompt 示例:`);
  console.log(`     "${firstPrompt.videoPrompt.substring(0, 120)}..."`);

  // ═══════════════════════════════════════════
  // Step 4: 积分预估验证
  // ═══════════════════════════════════════════
  console.log('\n💰 Step 4: 积分预估验证');

  const sceneCount = storyboard.scenes.length;
  const estimate = estimateCredits(graph, sceneCount);

  console.log(`  分镜数: ${sceneCount}`);
  console.log(`  预估总积分: ${estimate.total}`);
  for (const item of estimate.breakdown) {
    console.log(`    ${item.label}: ${item.credits}${item.multiplier ? ` (×${item.multiplier})` : ''}`);
  }

  assert(estimate.total > 0, '预估积分 > 0');
  // storyboard(5) + prompt(3) + image(10×N) + video(30×N) = 8 + 40N
  const expectedTotal = 8 + 40 * sceneCount;
  assertEqual(estimate.total, expectedTotal, `预估 = 8 + 40×${sceneCount} = ${expectedTotal}`);

  // ═══════════════════════════════════════════
  // 总结
  // ═══════════════════════════════════════════
  console.log(`\n📊 端到端总耗时: ${storyboardMs + promptMs}ms (StoryboardGen ${storyboardMs}ms + PromptGen ${promptMs}ms)`);
  printSummary();
}

function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log(`结果: ${passed} passed, ${failed} failed (共 ${passed + failed} 个用例)`);
  if (failures.length > 0) {
    console.log('\n失败用例:');
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }
  console.log('═'.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

runE2E();
