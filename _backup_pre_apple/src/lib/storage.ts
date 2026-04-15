import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR || './data'

// ========== File Operations ==========
export async function ensureDir(dirPath: string) {
  await fs.mkdir(path.join(DATA_DIR, dirPath), { recursive: true })
}

export async function writeMarkdown(filePath: string, content: string) {
  const fullPath = path.join(DATA_DIR, filePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')
}

export async function readMarkdown(filePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(DATA_DIR, filePath)
    return await fs.readFile(fullPath, 'utf-8')
  } catch {
    return null
  }
}

export async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const fullPath = path.join(DATA_DIR, dirPath)
    const files = await fs.readdir(fullPath)
    return files.filter(f => f.endsWith('.md')).sort().reverse()
  } catch {
    return []
  }
}

// ========== User Profile ==========
export async function getUserProfile(userId: string): Promise<string> {
  const content = await readMarkdown(`users/${userId}/profile.md`)
  if (content) return content

  // Create default profile
  const defaultProfile = `# User Profile

## Preferences
- Style: Not yet determined
- Color palette: Default
- Preferred dimensions: Standard

## History
No generation history yet.

## Feedback Summary
No feedback recorded yet.

_Last updated: ${new Date().toISOString()}_
`
  await writeMarkdown(`users/${userId}/profile.md`, defaultProfile)
  return defaultProfile
}

// ========== Chat History ==========
export async function appendChatLog(userId: string, role: string, content: string) {
  const date = new Date().toISOString().split('T')[0]
  const time = new Date().toISOString().split('T')[1].split('.')[0]
  const filePath = `users/${userId}/chat_history/${date}.md`

  const existing = await readMarkdown(filePath)
  const entry = `\n### ${time} — ${role}\n${content}\n`

  if (existing) {
    await writeMarkdown(filePath, existing + entry)
  } else {
    const header = `# Chat Log — ${date}\n`
    await writeMarkdown(filePath, header + entry)
  }
}

// ========== Generation Log ==========
export async function logGeneration(
  userId: string,
  taskId: string,
  data: {
    brief: string
    model: string
    params: Record<string, unknown>
    result: string
    evaluation?: Record<string, unknown>
    userFeedback?: string
  }
) {
  const date = new Date().toISOString().split('T')[0]
  const content = `# Generation Log — ${taskId}

**Date:** ${new Date().toISOString()}
**Model:** ${data.model}

## Input Brief
${data.brief}

## Parameters
\`\`\`json
${JSON.stringify(data.params, null, 2)}
\`\`\`

## Result
${data.result}

${data.evaluation ? `## Evaluation\n\`\`\`json\n${JSON.stringify(data.evaluation, null, 2)}\n\`\`\`` : ''}

${data.userFeedback ? `## User Feedback\n${data.userFeedback}` : '_Awaiting user feedback_'}
`

  await writeMarkdown(`users/${userId}/generation_log/${date}_${taskId}.md`, content)
}

// ========== Preference Evolution ==========
export async function updatePreferenceEvolution(userId: string, change: string) {
  const filePath = `users/${userId}/preference_evolution.md`
  const existing = await readMarkdown(filePath)
  const timestamp = new Date().toISOString()
  const entry = `\n### ${timestamp}\n${change}\n`

  if (existing) {
    await writeMarkdown(filePath, existing + entry)
  } else {
    const header = `# Preference Evolution Tracker\n\n_Tracks how user preferences change over time._\n`
    await writeMarkdown(filePath, header + entry)
  }
}

// ========== Project Storage ==========
export async function saveProject(userId: string, projectId: string, data: unknown) {
  await writeMarkdown(
    `users/${userId}/projects/${projectId}.md`,
    `# Project: ${projectId}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`
  )
}

export async function listProjects(userId: string): Promise<string[]> {
  return listMarkdownFiles(`users/${userId}/projects`)
}
