/**
 * Agent Registry — Central registry for all agents in the system
 * ================================================================
 *
 * The registry is the single source of truth for:
 *   - Which agents exist and their definitions
 *   - Agent lifecycle management (register, update, disable)
 *   - Agent lookup by ID, category, or capability
 *
 * The Evolution Agent uses this registry to understand the current
 * agent landscape and propose changes.
 */

import {
  AgentDefinition,
  AgentCategory,
  AgentStatus,
  IAgent,
} from '../types'

class AgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map()
  private implementations: Map<string, IAgent> = new Map()
  private listeners: Array<(event: RegistryEvent) => void> = []

  // ─── Registration ────────────────────────────────────────────────

  register(definition: AgentDefinition, implementation?: IAgent): void {
    const existing = this.agents.get(definition.id)
    this.agents.set(definition.id, definition)
    if (implementation) {
      this.implementations.set(definition.id, implementation)
    }
    this.emit({
      type: existing ? 'agent_updated' : 'agent_registered',
      agentId: definition.id,
      timestamp: new Date().toISOString(),
      details: { version: definition.version, status: definition.status },
    })
  }

  unregister(agentId: string): boolean {
    const existed = this.agents.delete(agentId)
    this.implementations.delete(agentId)
    if (existed) {
      this.emit({
        type: 'agent_unregistered',
        agentId,
        timestamp: new Date().toISOString(),
      })
    }
    return existed
  }

  // ─── Lookup ──────────────────────────────────────────────────────

  get(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId)
  }

  getImplementation(agentId: string): IAgent | undefined {
    return this.implementations.get(agentId)
  }

  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  getByCategory(category: AgentCategory): AgentDefinition[] {
    return this.getAll().filter((a) => a.category === category)
  }

  getByStatus(status: AgentStatus): AgentDefinition[] {
    return this.getAll().filter((a) => a.status === status)
  }

  getByCapability(capability: string): AgentDefinition[] {
    return this.getAll().filter((a) => a.capabilities.includes(capability))
  }

  getActive(): AgentDefinition[] {
    return this.getAll().filter((a) => a.status === 'active' || a.status === 'experimental')
  }

  // ─── Status Management ───────────────────────────────────────────

  setStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    const oldStatus = agent.status
    agent.status = status
    agent.updatedAt = new Date().toISOString()
    this.emit({
      type: 'agent_status_changed',
      agentId,
      timestamp: agent.updatedAt,
      details: { from: oldStatus, to: status },
    })
    return true
  }

  updatePrompt(agentId: string, newPrompt: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    const oldPrompt = agent.systemPrompt
    agent.systemPrompt = newPrompt
    agent.updatedAt = new Date().toISOString()
    // Bump patch version
    const [major, minor, patch] = agent.version.split('.').map(Number)
    agent.version = `${major}.${minor}.${patch + 1}`
    this.emit({
      type: 'agent_prompt_updated',
      agentId,
      timestamp: agent.updatedAt,
      details: {
        oldPromptLength: oldPrompt.length,
        newPromptLength: newPrompt.length,
        newVersion: agent.version,
      },
    })
    return true
  }

  // ─── Dependency Resolution ───────────────────────────────────────

  /**
   * Returns agents sorted in execution order (topological sort).
   * Agents with no dependencies come first.
   */
  getExecutionOrder(agentIds?: string[]): AgentDefinition[] {
    const ids = agentIds || this.getActive().map((a) => a.id)
    const agents = ids.map((id) => this.agents.get(id)).filter(Boolean) as AgentDefinition[]

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>()
    const graph = new Map<string, string[]>()
    const idSet = new Set(ids)

    for (const agent of agents) {
      if (!inDegree.has(agent.id)) inDegree.set(agent.id, 0)
      if (!graph.has(agent.id)) graph.set(agent.id, [])
      for (const dep of agent.dependencies) {
        if (idSet.has(dep)) {
          graph.get(dep)?.push(agent.id)
          inDegree.set(agent.id, (inDegree.get(agent.id) || 0) + 1)
        }
      }
    }

    const queue: string[] = []
    Array.from(inDegree.entries()).forEach(([id, degree]) => {
      if (degree === 0) queue.push(id)
    })

    const sorted: AgentDefinition[] = []
    while (queue.length) {
      const current = queue.shift()!
      const agent = this.agents.get(current)
      if (agent) sorted.push(agent)
      for (const next of graph.get(current) || []) {
        const newDegree = (inDegree.get(next) || 1) - 1
        inDegree.set(next, newDegree)
        if (newDegree === 0) queue.push(next)
      }
    }

    return sorted
  }

  /**
   * Group agents into parallel execution phases based on dependencies.
   */
  getExecutionPhases(agentIds?: string[]): AgentDefinition[][] {
    const sorted = this.getExecutionOrder(agentIds)
    const completed = new Set<string>()
    const phases: AgentDefinition[][] = []

    let remaining = [...sorted]
    while (remaining.length > 0) {
      const phase: AgentDefinition[] = []
      const nextRemaining: AgentDefinition[] = []

      for (const agent of remaining) {
        const depsResolved = agent.dependencies.every(
          (dep) => completed.has(dep) || !remaining.some((r) => r.id === dep),
        )
        if (depsResolved) {
          phase.push(agent)
        } else {
          nextRemaining.push(agent)
        }
      }

      if (phase.length === 0 && nextRemaining.length > 0) {
        // Circular dependency detected — force remaining into one phase
        phases.push(nextRemaining)
        break
      }

      phases.push(phase)
      for (const a of phase) completed.add(a.id)
      remaining = nextRemaining
    }

    return phases
  }

  // ─── Statistics (for Evolution Agent) ────────────────────────────

  getSystemSnapshot(): RegistrySnapshot {
    const all = this.getAll()
    return {
      totalAgents: all.length,
      byCategory: {
        business: all.filter((a) => a.category === 'business').length,
        meta: all.filter((a) => a.category === 'meta').length,
        evolution: all.filter((a) => a.category === 'evolution').length,
        orchestrator: all.filter((a) => a.category === 'orchestrator').length,
      },
      byStatus: {
        active: all.filter((a) => a.status === 'active').length,
        degraded: all.filter((a) => a.status === 'degraded').length,
        disabled: all.filter((a) => a.status === 'disabled').length,
        experimental: all.filter((a) => a.status === 'experimental').length,
      },
      agents: all.map((a) => ({
        id: a.id,
        nameZh: a.nameZh,
        category: a.category,
        status: a.status,
        version: a.version,
        capabilities: a.capabilities,
        dependencies: a.dependencies,
        toolCount: a.tools.length,
        origin: a.origin,
      })),
      timestamp: new Date().toISOString(),
    }
  }

  // ─── Event System ────────────────────────────────────────────────

  on(listener: (event: RegistryEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        // Listener error, continue with other listeners
      }
    }
  }
}

// ─── Supporting Types ─────────────────────────────────────────────────

interface RegistryEvent {
  type:
    | 'agent_registered'
    | 'agent_updated'
    | 'agent_unregistered'
    | 'agent_status_changed'
    | 'agent_prompt_updated'
  agentId: string
  timestamp: string
  details?: Record<string, unknown>
}

interface RegistrySnapshot {
  totalAgents: number
  byCategory: Record<AgentCategory, number>
  byStatus: Record<AgentStatus, number>
  agents: Array<{
    id: string
    nameZh: string
    category: AgentCategory
    status: AgentStatus
    version: string
    capabilities: string[]
    dependencies: string[]
    toolCount: number
    origin: string
  }>
  timestamp: string
}

// ─── Singleton Export ─────────────────────────────────────────────────

export const agentRegistry = new AgentRegistry()

export type { RegistryEvent, RegistrySnapshot }
