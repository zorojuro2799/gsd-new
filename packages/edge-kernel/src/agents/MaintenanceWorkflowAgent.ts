/**
 * MaintenanceWorkflowAgent — Inspection → Anomaly → Repair pipeline.
 *
 * This is Aegis's core competitive differentiator: when a CRITICAL anomaly
 * fires, this agent automatically creates and dispatches a multi-stage
 * maintenance mission using the best available robots for each stage.
 *
 * Workflows are declarative state machines loaded from
 * data/maintenance_workflows.json. Each stage specifies the robot tier
 * required — the agent picks the best available match at runtime.
 *
 * Per-workflow cooldowns prevent duplicate missions from rapid-fire anomalies.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WsAgentEvent, RobotTier } from '../../../shared-types/src';
import type { AgentEventBroadcastFn } from './MissionDispatcherAgent';
import type { FleetStateAggregator } from './FleetStateAggregator';
import type { MissionStore } from '../store/MissionStore';
import type { MissionDispatcherAgent } from './MissionDispatcherAgent';
import { kernelBus } from '../bus/KernelEventBus';

interface WorkflowStage {
  id: string;
  name: string;
  robotTier: RobotTier | null;
  verb: string;
  zone: string;
  sensorMode?: string;
  command: string;
  estimatedDurationMs: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  triggerRuleId: string;
  cooldownMs: number;
  stages: WorkflowStage[];
}

interface WorkflowConfig {
  version: string;
  workflows: WorkflowDefinition[];
}

const DATA_DIR = path.resolve(__dirname, '../../data');

export class MaintenanceWorkflowAgent {
  private _workflows: WorkflowDefinition[] = [];
  private _broadcast: AgentEventBroadcastFn | null = null;

  // workflowId+robotId → last triggered timestamp (cooldown tracking)
  private _lastTriggered: Map<string, number> = new Map();

  constructor(
    private _fleetState: FleetStateAggregator,
    private _missionStore: MissionStore,
    private _dispatcher: MissionDispatcherAgent
  ) {
    this._loadWorkflows();
    kernelBus.on('anomaly_critical', (data) => this._handleCriticalAnomaly(data));
  }

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  private _loadWorkflows(): void {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, 'maintenance_workflows.json'), 'utf-8');
      const config = JSON.parse(raw) as WorkflowConfig;
      this._workflows = config.workflows;
      console.log(`[MaintenanceAgent] Loaded ${this._workflows.length} workflows`);
    } catch (err) {
      console.error('[MaintenanceAgent] Failed to load workflows:', err);
    }
  }

  private async _handleCriticalAnomaly(data: {
    robotId: string;
    ruleId: string;
  }): Promise<void> {
    const { robotId, ruleId } = data;

    // Find matching workflow(s) for this rule
    const matchingWorkflows = this._workflows.filter((w) => w.triggerRuleId === ruleId);
    if (matchingWorkflows.length === 0) return;

    for (const workflow of matchingWorkflows) {
      const cooldownKey = `${workflow.id}:${robotId}`;
      const lastRun = this._lastTriggered.get(cooldownKey) ?? 0;
      const now = Date.now();

      if (now - lastRun < workflow.cooldownMs) {
        console.log(`[MaintenanceAgent] Workflow ${workflow.id} for ${robotId} still in cooldown (${Math.round((workflow.cooldownMs - (now - lastRun)) / 1000)}s remaining)`);
        continue;
      }

      this._lastTriggered.set(cooldownKey, now);
      await this._spawnWorkflow(workflow, robotId);
    }
  }

  private async _spawnWorkflow(workflow: WorkflowDefinition, triggerRobotId: string): Promise<void> {
    console.log(`[MaintenanceAgent] Spawning workflow "${workflow.name}" triggered by ${triggerRobotId}`);

    // Create mission in store
    const mission = this._missionStore.create({
      name: `[AUTO] ${workflow.name} — ${new Date().toISOString().slice(11, 19)}`,
      source: 'AI_GENERATED',
      priority: 'HIGH',
    });

    // Build task list — find best robot for each stage
    const tasks: Array<{ robotId: string; command: string }> = [];

    for (const stage of workflow.stages) {
      let assignedRobotId: string;

      if (stage.robotTier === null) {
        // Use the trigger robot itself (e.g., battery_critical → dock itself)
        assignedRobotId = triggerRobotId;
      } else {
        const candidate = this._findBestRobot(stage.robotTier, triggerRobotId);
        if (!candidate) {
          console.warn(`[MaintenanceAgent] No ${stage.robotTier} robot available for stage "${stage.name}" — skipping stage`);
          continue;
        }
        assignedRobotId = candidate;
      }

      tasks.push({
        robotId: assignedRobotId,
        command: `[${stage.name}] ${stage.command}`,
      });
    }

    if (tasks.length === 0) {
      console.warn(`[MaintenanceAgent] No tasks generated for workflow ${workflow.id} — no suitable robots`);
      this._missionStore.delete(mission.id);
      return;
    }

    this._missionStore.addTasks(mission.id, tasks);

    console.log(`[MaintenanceAgent] Created mission ${mission.id} with ${tasks.length} tasks`);

    this._emitEvent('WORKFLOW_STAGE_CHANGE', 'WARNING', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      missionId: mission.id,
      triggerRobotId,
      taskCount: tasks.length,
      message: `Maintenance workflow "${workflow.name}" spawned — ${tasks.length} stage(s) queued`,
    });

    // Auto-dispatch the workflow mission
    await this._dispatcher.dispatch(mission.id);
  }

  /** Find the best available robot of the given tier: connected, battery highest */
  private _findBestRobot(tier: RobotTier, excludeRobotId: string): string | null {
    const candidates = this._fleetState
      .getAllRobots()
      .filter(
        (e) =>
          e.config.class === tier &&
          e.config.id !== excludeRobotId &&
          e.telemetry.connectionState === 'CONNECTED' &&
          e.telemetry.battery > e.config.state_logic.battery_critical_threshold + 10
      )
      .sort((a, b) => b.telemetry.battery - a.telemetry.battery); // highest battery first

    return candidates[0]?.config.id ?? null;
  }

  private _emitEvent(
    eventKind: WsAgentEvent['eventKind'],
    severity: WsAgentEvent['severity'],
    payload: unknown
  ): void {
    if (!this._broadcast) return;
    this._broadcast({
      type: 'AGENT_EVENT',
      agentId: 'MAINTENANCE_WORKFLOW',
      eventKind,
      severity,
      payload,
      timestamp: Date.now(),
    });
  }
}
