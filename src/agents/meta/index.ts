/**
 * Meta-Agent Layer — Public API
 * ===============================
 *
 * Usage:
 *   import { meta } from '@/agents/meta'
 *
 *   // Create a new agent from description
 *   const result = await meta.createAgent('能自动分析Facebook广告素材库的Agent')
 *
 *   // Design a new feature (coordinated across all layers)
 *   const result = await meta.designFeature('添加定时竞品监控功能')
 *
 *   // Use individual architects
 *   const schema = await meta.dataArchitect.execute(ctx)
 *   const pipeline = await meta.engineArchitect.execute(ctx)
 *   const ui = await meta.frontendArchitect.execute(ctx)
 *   const spec = await meta.agentDefiner.execute(ctx)
 */

import { dataArchitect } from './dataArchitect'
import { engineArchitect } from './engineArchitect'
import { frontendArchitect } from './frontendArchitect'
import { agentDefiner } from './agentDefiner'
import {
  runMetaOrchestrator,
  type MetaOrchestratorRequest,
  type MetaOrchestratorResult,
} from './orchestrator'

export const meta = {
  // Individual agents
  dataArchitect,
  engineArchitect,
  frontendArchitect,
  agentDefiner,

  // Orchestrated workflows
  orchestrate: runMetaOrchestrator,

  /** Shorthand: create a new agent from description */
  async createAgent(
    description: string,
    skip?: MetaOrchestratorRequest['skip'],
  ): Promise<MetaOrchestratorResult> {
    return runMetaOrchestrator({ description, scope: 'agent', skip })
  },

  /** Shorthand: design a new feature across all layers */
  async designFeature(
    description: string,
    skip?: MetaOrchestratorRequest['skip'],
  ): Promise<MetaOrchestratorResult> {
    return runMetaOrchestrator({ description, scope: 'feature', skip })
  },

  /** Shorthand: optimize existing functionality */
  async optimize(
    description: string,
    skip?: MetaOrchestratorRequest['skip'],
  ): Promise<MetaOrchestratorResult> {
    return runMetaOrchestrator({ description, scope: 'optimize', skip })
  },
}

export type { MetaOrchestratorRequest, MetaOrchestratorResult }
