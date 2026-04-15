/**
 * Agent Registry Bootstrap
 * ==========================
 *
 * Registers all initial agents on server startup.
 * Import this module once in the app's root to ensure agents are registered.
 */

import { agentRegistry } from './index'
import { INITIAL_AGENTS } from './initialAgents'

let bootstrapped = false

export function bootstrapAgentRegistry(): void {
  if (bootstrapped) return
  bootstrapped = true

  for (const agent of INITIAL_AGENTS) {
    agentRegistry.register(agent)
  }
}

// Auto-bootstrap on import (server-side only)
if (typeof window === 'undefined') {
  bootstrapAgentRegistry()
}
