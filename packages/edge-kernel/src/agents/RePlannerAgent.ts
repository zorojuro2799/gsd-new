/**
 * RePlannerAgent — Autonomous task recovery when robots fail.
 *
 * Listens for 'task_failed' events on the KernelEventBus, finds a
 * replacement robot of the same tier with sufficient battery and an
 * active connection, then re-queues the task via the Dispatcher.
 *
 * Decision tree (fast-path, no AI call, <50ms):
 *   1. Find failed task's robot tier from FleetStateAggregator
 *   2. Find R2: same tier, battery > critical_threshold+15%, CONNECTED
 *   3. If found: reassign task to R2, re-queue via Dispatcher
 *   4. If not found: emit REPLAN_TRIGGERED WARNING so operator can intervene
 */

import type { WsAgentEvent } from '../../../shared-types/src';
import type { AgentEventBroadcastFn } from './MissionDispatcherAgent';
import type { FleetStateAggregator } from './FleetStateAggregator';
import type { MissionStore } from '../store/MissionStore';
import type { MissionDispatcherAgent } from './MissionDispatcherAgent';
import { kernelBus } from '../bus/KernelEventBus';

// Minimum battery margin above critical threshold before assigning to replacement
const BATTERY_MARGIN_ABOVE_CRITICAL = 15;

export class RePlannerAgent {
  private _broadcast: AgentEventBroadcastFn | null = null;

  constructor(
    private _fleetState: FleetStateAggregator,
    private _missionStore: MissionStore,
    private _dispatcher: MissionDispatcherAgent
  ) {
    kernelBus.on('task_failed', (data) => this._handleTaskFailed(data));
  }

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  private async _handleTaskFailed(data: {
    missionId: string;
    taskId: string;
    robotId: string;
  }): Promise<void> {
    const { missionId, taskId, robotId } = data;

    console.log(`[RePlannerAgent] Task ${taskId} failed on ${robotId} — searching for replacement`);

    // Find the failed robot's tier
    const failedEntry = this._fleetState.getRobotEntry(robotId);
    if (!failedEntry) {
      console.warn(`[RePlannerAgent] Unknown robot ${robotId} — cannot replan`);
      return;
    }

    const requiredTier = failedEntry.config.class;
    const criticalThreshold = failedEntry.config.state_logic.battery_critical_threshold;
    const minBattery = criticalThreshold + BATTERY_MARGIN_ABOVE_CRITICAL;

    // Find a replacement: same tier, adequate battery, connected, not the failed robot
    const replacement = this._fleetState.getAllRobots().find(
      (entry) =>
        entry.config.id !== robotId &&
        entry.config.class === requiredTier &&
        entry.telemetry.connectionState === 'CONNECTED' &&
        entry.telemetry.battery >= minBattery
    );

    if (replacement) {
      const newRobotId = replacement.config.id;
      console.log(`[RePlannerAgent] Reassigning task ${taskId} to ${newRobotId} (${requiredTier}, battery=${replacement.telemetry.battery}%)`);

      this._emitEvent('REPLAN_TRIGGERED', 'INFO', {
        missionId,
        taskId,
        originalRobotId: robotId,
        replacementRobotId: newRobotId,
        message: `Task reassigned to ${newRobotId} after ${robotId} failed`,
      });

      // Reassign and retry — fire-and-forget (re-queuing is async)
      this._dispatcher.retryTask(missionId, taskId, newRobotId).catch((err: unknown) => {
        console.error(`[RePlannerAgent] Retry failed for task ${taskId}:`, err);
      });
    } else {
      console.warn(`[RePlannerAgent] No replacement found for tier=${requiredTier}, battery>=${minBattery}% — operator intervention required`);

      this._emitEvent('REPLAN_TRIGGERED', 'WARNING', {
        missionId,
        taskId,
        originalRobotId: robotId,
        requiredTier,
        message: `No replacement ${requiredTier} robot available — manual intervention required`,
      });
    }
  }

  private _emitEvent(
    eventKind: WsAgentEvent['eventKind'],
    severity: WsAgentEvent['severity'],
    payload: unknown
  ): void {
    if (!this._broadcast) return;
    this._broadcast({
      type: 'AGENT_EVENT',
      agentId: 'REPLANNER',
      eventKind,
      severity,
      payload,
      timestamp: Date.now(),
    });
  }
}
