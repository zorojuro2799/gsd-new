/**
 * PlannerAgent — AI-powered mission planning using Claude tool-use.
 *
 * Accepts a natural language mission request, uses Claude Sonnet to generate
 * a structured mission plan via typed tool calls, validates each task against
 * the live fleet state, and broadcasts real-time progress via WebSocket so
 * the mobile DAG view builds up as the AI plans.
 *
 * API key: set ANTHROPIC_API_KEY environment variable before starting kernel.
 * Offline fallback: if API key is absent, returns a descriptive error event.
 *
 * Planning flow:
 *   1. Build system prompt with live fleet state
 *   2. Tool-use loop: create_mission → add_task × N → explain_plan
 *   3. Each add_task validated against FleetStateAggregator (battery, connection)
 *   4. Each add_task emits PLAN_PROGRESS so mobile sees tasks appear live
 *   5. explain_plan emits PLAN_COMPLETE with missionId for mobile dispatch
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WsAgentEvent } from '../../../shared-types/src';
import type { AgentEventBroadcastFn } from './MissionDispatcherAgent';
import type { FleetStateAggregator } from './FleetStateAggregator';
import type { MissionStore } from '../store/MissionStore';

export interface PlanRequest {
  planningId: string;
  naturalLanguage: string;
  constraints?: {
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    allowedRobotIds?: string[];
  };
}

const MAX_TOOL_ITERATIONS = 8;

/**
 * BILLING GUARD — controls Claude API token usage.
 *
 * Claude Sonnet 4.6 pricing (as of 2025):
 *   Input:  $3 / 1M tokens
 *   Output: $15 / 1M tokens
 *
 * MAX_OUTPUT_TOKENS: caps tokens generated per API call.
 *   512  → ~$0.008 worst case per planning call   (recommended for production)
 *   1024 → ~$0.015 worst case per planning call   (default — good balance)
 *   4096 → ~$0.061 worst case per planning call   (too high for frequent use)
 *
 * With MAX_TOOL_ITERATIONS=8, total worst-case per mission plan ≈ $0.12
 */
const MAX_OUTPUT_TOKENS = 1024;

export class PlannerAgent {
  private _client: Anthropic | null = null;
  private _broadcast: AgentEventBroadcastFn | null = null;
  private _ready: boolean = false;

  constructor(
    private _fleetState: FleetStateAggregator,
    private _missionStore: MissionStore,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this._client = new Anthropic({ apiKey });
      this._ready = true;
      console.log('[PlannerAgent] Ready (Claude Sonnet 4.6)');
    } else {
      console.warn('[PlannerAgent] ANTHROPIC_API_KEY not set — AI planning unavailable');
    }
  }

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  get isReady(): boolean {
    return this._ready;
  }

  /** Start planning async — results come via WebSocket events */
  planAsync(request: PlanRequest): void {
    if (!this._ready || !this._client) {
      this._emitEvent('PLAN_ERROR', 'CRITICAL', {
        planningId: request.planningId,
        error: 'AI Planner not available — set ANTHROPIC_API_KEY environment variable and restart the kernel',
      });
      return;
    }
    this._plan(request).catch((err: unknown) => {
      console.error('[PlannerAgent] Unhandled planning error:', err);
      this._emitEvent('PLAN_ERROR', 'CRITICAL', {
        planningId: request.planningId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async _plan(request: PlanRequest): Promise<void> {
    const { naturalLanguage, planningId, constraints } = request;
    console.log(`[PlannerAgent] Planning: "${naturalLanguage.slice(0, 80)}"`);

    this._emitEvent('PLAN_PROGRESS', 'INFO', {
      planningId,
      phase: 'BUILDING_CONTEXT',
      message: 'Analyzing fleet state...',
      tasksAdded: 0,
    });

    const systemPrompt = this._buildSystemPrompt(constraints?.allowedRobotIds);
    const tools = this._buildTools();

    // Planning session state
    let missionId: string | null = null;
    const addedTaskIds: string[] = [];

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: naturalLanguage },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this._client!.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        tools,
        messages,
      });

      // Log token usage per iteration to monitor billing
      if (response.usage) {
        console.log(
          `[PlannerAgent] iter=${iteration + 1} tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}`
        );
      }

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') {
        console.warn(`[PlannerAgent] Unexpected stop_reason: ${response.stop_reason}`);
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let planFinalized = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const input = block.input as Record<string, unknown>;
        let result: string;

        if (block.name === 'create_mission') {
          const name = (input.name as string) ?? 'AI Mission';
          const priority = (input.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL') ?? 'NORMAL';

          const mission = this._missionStore.create({
            name,
            source: 'AI_GENERATED',
            priority,
            naturalLanguageInput: naturalLanguage,
          });
          missionId = mission.id;

          this._emitEvent('PLAN_PROGRESS', 'INFO', {
            planningId, phase: 'MISSION_CREATED',
            message: `Mission "${name}" created`,
            missionId, tasksAdded: 0,
          });

          result = JSON.stringify({ ok: true, missionId, message: `Mission created: "${name}"` });

        } else if (block.name === 'add_task') {
          if (!missionId) {
            result = JSON.stringify({ ok: false, error: 'Call create_mission before add_task' });
          } else {
            const validation = this._validateRobot(
              input.robotId as string,
              constraints?.allowedRobotIds
            );

            if (!validation.ok) {
              result = JSON.stringify({ ok: false, error: validation.error, suggestion: validation.suggestion });
            } else {
              const task = this._missionStore.addTask(missionId, {
                robotId: input.robotId as string,
                command: input.command as string,
              });

              if (task) {
                addedTaskIds.push(task.id);
                this._emitEvent('PLAN_PROGRESS', 'INFO', {
                  planningId, phase: 'TASK_ADDED',
                  missionId,
                  message: `Task ${addedTaskIds.length}: ${(input.command as string).slice(0, 60)}`,
                  tasksAdded: addedTaskIds.length,
                  task: {
                    id: task.id,
                    robotId: task.robotId,
                    command: task.command,
                    status: task.status,
                    createdAt: task.createdAt,
                  },
                });
                result = JSON.stringify({ ok: true, taskId: task.id });
              } else {
                result = JSON.stringify({ ok: false, error: 'Failed to create task' });
              }
            }
          }

        } else if (block.name === 'explain_plan') {
          this._emitEvent('PLAN_COMPLETE', 'INFO', {
            planningId, missionId,
            totalTasks: addedTaskIds.length,
            summary: input.summary,
            reasoning: input.reasoning,
          });

          result = JSON.stringify({ ok: true, message: 'Plan finalized — ready for operator review and dispatch' });
          planFinalized = true;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          break;

        } else {
          result = JSON.stringify({ ok: false, error: `Unknown tool: ${block.name}` });
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }

      messages.push({ role: 'user', content: toolResults });
      if (planFinalized) return;
    }

    // Reached max iterations without explain_plan
    if (missionId && addedTaskIds.length > 0) {
      this._emitEvent('PLAN_COMPLETE', 'INFO', {
        planningId, missionId,
        totalTasks: addedTaskIds.length,
        summary: `AI generated ${addedTaskIds.length} tasks`,
      });
    } else {
      this._emitEvent('PLAN_ERROR', 'WARNING', {
        planningId,
        error: 'Planning ended without producing a complete mission. Try a more specific request.',
      });
    }
  }

  private _validateRobot(
    robotId: string,
    allowedRobotIds?: string[]
  ): { ok: boolean; error?: string; suggestion?: string } {
    if (!robotId) return { ok: false, error: 'robotId is required' };

    if (allowedRobotIds && !allowedRobotIds.includes(robotId)) {
      return { ok: false, error: `Robot "${robotId}" not in allowed list` };
    }

    const entry = this._fleetState.getRobotEntry(robotId);
    if (!entry) {
      const available = this._fleetState.getAllRobots()
        .filter(e => e.telemetry.connectionState === 'CONNECTED')
        .map(e => e.config.id).slice(0, 5);
      return {
        ok: false,
        error: `Robot "${robotId}" not found in registry`,
        suggestion: available.length > 0 ? `Available: ${available.join(', ')}` : 'No robots available',
      };
    }

    if (entry.telemetry.connectionState !== 'CONNECTED') {
      const alts = this._fleetState.getAllRobots()
        .filter(e => e.config.class === entry.config.class && e.telemetry.connectionState === 'CONNECTED')
        .slice(0, 3).map(e => e.config.id);
      return {
        ok: false,
        error: `Robot "${robotId}" is ${entry.telemetry.connectionState}`,
        suggestion: alts.length > 0 ? `Try: ${alts.join(', ')}` : `No ${entry.config.class} robots connected`,
      };
    }

    const minBattery = entry.config.state_logic.battery_critical_threshold + 10;
    if (entry.telemetry.battery < minBattery) {
      return {
        ok: false,
        error: `Robot "${robotId}" battery critically low (${entry.telemetry.battery}% < ${minBattery}%)`,
      };
    }

    return { ok: true };
  }

  private _buildSystemPrompt(allowedRobotIds?: string[]): string {
    const all = this._fleetState.getAllRobots()
      .filter(e => !allowedRobotIds || allowedRobotIds.includes(e.config.id))
      .sort((a, b) => b.telemetry.battery - a.telemetry.battery);

    const connectedCount = all.filter(e => e.telemetry.connectionState === 'CONNECTED').length;

    const robotList = all.map(e => {
      const t = e.telemetry;
      const status = t.connectionState === 'CONNECTED' ? 'AVAILABLE' : t.connectionState;
      return `  ${e.config.id} | ${e.config.class} | ${e.config.model} | Battery: ${t.battery}% | ${status}`;
    }).join('\n');

    return `You are the Aegis AI Planner — expert at orchestrating heterogeneous robot fleets for industrial maintenance missions.

LIVE FLEET (${connectedCount}/${all.length} available):
${robotList || '  (no robots online — warn operator)'}

TIER → CAPABILITY MAPPING:
  Humanoid    → dexterous manipulation, assembly, repair, panel work
  Quadruped   → terrain inspection, patrol, structural scanning, LiDAR/thermal
  Logistics   → payload transport, delivery, AGV runs
  Aerial      → survey, aerial mapping, overhead inspection, RTK-GPS
  Specialized → custom inspection: crawlers, fixed arms, precision sensors

PLANNING RULES:
1. Only assign AVAILABLE robots (battery must also be adequate)
2. Match tier to task: thermal scan → Quadruped, delivery → Logistics, etc.
3. Use dependsOn for strict ordering; omit for parallel execution
4. Prefer higher-battery robots for longer tasks
5. 3–8 tasks is typical; more for complex multi-stage missions
6. Task commands: be specific (what, where, how, sensor mode if applicable)

TOOL CALL ORDER (mandatory):
  1. create_mission — always first
  2. add_task — repeat for each task
  3. explain_plan — always last`;
  }

  private _buildTools(): Anthropic.Tool[] {
    return [
      {
        name: 'create_mission',
        description: 'Create the mission header. MUST be called first before any add_task calls.',
        input_schema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Concise mission name (max 60 chars)' },
            priority: {
              type: 'string',
              enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
              description: 'Mission priority based on urgency and safety impact',
            },
          },
          required: ['name', 'priority'],
        },
      },
      {
        name: 'add_task',
        description: 'Add one task to the current mission. One robot per task. Repeat for each task needed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            robotId: {
              type: 'string',
              description: 'Exact robot ID from the fleet list (must be AVAILABLE)',
            },
            command: {
              type: 'string',
              description: 'Specific task command: what to do, where, and how (include sensor mode if applicable)',
            },
            dependsOn: {
              type: 'array',
              items: { type: 'string' },
              description: 'Task IDs that must complete before this one starts. Leave empty for parallel execution.',
            },
          },
          required: ['robotId', 'command'],
        },
      },
      {
        name: 'explain_plan',
        description: 'Finalize the plan. MUST be called last after all add_task calls are done.',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: {
              type: 'string',
              description: 'Operator-facing summary: what the mission accomplishes and how many robots are involved',
            },
            reasoning: {
              type: 'string',
              description: 'Brief reasoning: why these robots were chosen and why this task order',
            },
          },
          required: ['summary', 'reasoning'],
        },
      },
    ];
  }

  private _emitEvent(
    eventKind: WsAgentEvent['eventKind'],
    severity: WsAgentEvent['severity'],
    payload: unknown
  ): void {
    if (!this._broadcast) return;
    this._broadcast({
      type: 'AGENT_EVENT',
      agentId: 'AI_PLANNER',
      eventKind,
      severity,
      payload,
      timestamp: Date.now(),
    });
  }
}
