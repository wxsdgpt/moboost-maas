/**
 * src/lib/workflowNodes/llmNodes.ts
 *
 * LLM 节点执行器：StoryboardGen / PromptGen
 * 通过 callJSON 调用 OpenRouter，返回结构化 JSON
 */

import { callJSON } from '../callLLM';
import { registerNodeExecutor } from '../workflowExecutor';
import type { WorkflowNode, NodeConfig, Storyboard, Scene, Character, CameraSpec } from '../workflowTypes';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';

// ===== StoryboardGen — 分镜生成 =====

registerNodeExecutor('storyboard_gen', async (node, inputs, config) => {
  const text = (inputs as any).text || '';
  if (!text) throw new Error('StoryboardGen: 没有输入剧本文本');

  const sbConfig = config.storyboardGen;
  const maxScenes = sbConfig?.maxScenes || 20;
  const style = sbConfig?.style || '';
  const aspectRatio = sbConfig?.aspectRatio || '16:9';

  const systemPrompt = `你是一个专业的分镜脚本师。根据用户提供的剧本/文案，生成结构化的分镜脚本。

要求：
- 每个分镜包含：画面描述、对白（如有）、景别、视角、运镜、构图、情绪、时长
- 最多生成 ${maxScenes} 个分镜
- 画面比例：${aspectRatio}
${style ? `- 画风：${style}` : ''}
- 提取所有出演角色（名字、外貌描述）
- 用直白的语言描述画面（参考巨日禄提示词风格）

输出 JSON 格式：
{
  "title": "作品标题",
  "characters": [
    { "id": "char_1", "name": "角色名", "description": "外貌、服装等详细描述" }
  ],
  "scenes": [
    {
      "order": 1,
      "description": "用直白语言描述画面内容（主体+环境+动作+表情）",
      "dialogue": "对白内容（可选）",
      "camera": {
        "shot": "景别（远景/全景/中景/近景/特写/大特写）",
        "angle": "视角（平视/俯视/仰视/鸟瞰/低角度仰视）",
        "movement": "运镜（镜头推进/镜头拉远/环绕/固定/跟镜头等）",
        "composition": "构图（居中/三分/对角线/对称等）"
      },
      "emotion": "氛围/情绪",
      "duration": 5
    }
  ],
  "settings": {
    "style": "${style || '根据剧本内容推断'}",
    "aspectRatio": "${aspectRatio}",
    "targetDuration": 0
  }
}`;

  const result = await callJSON<Storyboard>(text, {
    model: DEFAULT_MODEL,
    caller: 'workflowNode',
    action: 'storyboard_gen',
    systemPrompt,
    temperature: 0.5,
    maxTokens: 4000,
  });

  // 计算总时长
  if (result.settings) {
    result.settings.targetDuration = result.scenes.reduce((sum, s) => sum + (s.duration || 5), 0);
  }

  return { storyboard: result };
});

// ===== PromptGen — 提示词生成 =====

registerNodeExecutor('prompt_gen', async (node, inputs, config) => {
  const storyboard = (inputs as any).storyboard as Storyboard | undefined;
  if (!storyboard?.scenes?.length) throw new Error('PromptGen: 没有分镜数据');

  const dictionary = config.promptGen?.dictionary || 'jurilu';

  // 根据词典选择提示词增强策略
  const dictionaryHint = dictionary === 'jurilu'
    ? `参考巨日禄提示词体系：
- 第一行写镜头语言（景别+视角+运镜+构图）
- 第二行写画面内容（主体+动作+表情+环境）
- 可补充：时间、天气、光源、氛围
- 动态控制：大动态/中动态/小动态`
    : dictionary === 'chushou'
    ? `参考触手AI提示词体系：
- seedance2 格式：直接描述画面内容
- 角色描述要带上体貌特征便于AI识别
- 运镜用自然语言描述`
    : '使用通用提示词格式';

  const systemPrompt = `你是一个专业的 AI 视频生成提示词工程师。根据分镜脚本，为每个分镜生成高质量的图片提示词和视频提示词。

${dictionaryHint}

角色列表（生成提示词时引用这些描述以保持一致性）：
${storyboard.characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}

画风：${storyboard.settings?.style || '根据内容推断'}

输出 JSON 格式：
{
  "items": [
    {
      "sceneOrder": 1,
      "imagePrompt": "用于文生图/融合生图的完整提示词",
      "videoPrompt": "用于图生视频的运镜+动作提示词",
      "negativePrompt": "负向提示词（可选）",
      "characterRefs": ["char_1"],
      "duration": 5
    }
  ]
}`;

  const sceneDescriptions = storyboard.scenes.map(s =>
    `分镜 ${s.order}: ${s.description}${s.dialogue ? ` [对白: "${s.dialogue}"]` : ''} | 景别:${s.camera.shot} 视角:${s.camera.angle} 运镜:${s.camera.movement} 情绪:${s.emotion} 时长:${s.duration}s`
  ).join('\n');

  const result = await callJSON<{ items: any[] }>(sceneDescriptions, {
    model: DEFAULT_MODEL,
    caller: 'workflowNode',
    action: 'prompt_gen',
    systemPrompt,
    temperature: 0.4,
    maxTokens: 4000,
  });

  return { prompts: result };
});

// ===== CharacterExtract — 角色提取（V2，提前注册） =====

registerNodeExecutor('character_extract', async (node, inputs, config) => {
  const text = (inputs as any).text || '';
  if (!text) throw new Error('CharacterExtract: 没有输入文本');

  const result = await callJSON<{ characters: Character[] }>(text, {
    model: DEFAULT_MODEL,
    caller: 'workflowNode',
    action: 'character_extract',
    systemPrompt: `从文本中提取所有角色信息。输出 JSON：
{
  "characters": [
    { "id": "char_1", "name": "角色名", "description": "详细外貌描述（体型、发型、发色、服装、配饰等）", "referenceImageUrls": [] }
  ]
}`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return { characters: result.characters };
});

// ===== SceneExtract — 场景提取（V2，提前注册） =====

registerNodeExecutor('scene_extract', async (node, inputs, config) => {
  const text = (inputs as any).text || '';
  if (!text) throw new Error('SceneExtract: 没有输入文本');

  const result = await callJSON<{ scenes: { name: string; description: string }[] }>(text, {
    model: DEFAULT_MODEL,
    caller: 'workflowNode',
    action: 'scene_extract',
    systemPrompt: `从文本中提取所有场景/地点。输出 JSON：
{
  "scenes": [
    { "name": "场景名", "description": "场景详细描述（环境、光线、氛围、标志性元素等）" }
  ]
}`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return { scenes: result.scenes };
});
