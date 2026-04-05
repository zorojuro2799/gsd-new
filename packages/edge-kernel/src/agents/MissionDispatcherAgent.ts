/**
 * MissionDispatcherAgent — DAG-based mission executor.
 *
 * Phase 3B: Simulated execution — tasks auto-progress after realistic delays.
 * Phase 3C+: Real robot commands dispatched via ProtocolAdapterRing.
 *
 * Execution model:
 *   - Tasks with no dependsOn start immediately when mission is dispatched
 *   - Each task: QUEUED → (delay) → EXECUTING → (delay) → COMPLETED
 *   - When a task completes, unblocked downstream tasks start
 *   - If no dependsOn is specified, tasks run sequentially (each waits for previous)
 */

import type { MissionTask, WsAgentEvent, TaskStatus } from '../../../shared-types/src';
import type { MissionStore } from '../store/MissionStore';
import { kernelBus } from '../bus/KernelEventBus';

export type AgentEventBroadcastFn = (event: WsAgentEvent) => void;

// Simulated execution timing (ms)
const SIM = {
  QUEUE_TO_EXECUTING_MIN: 1000,
  QUEUE_TO_EXECUTING_MAX: 3000,
  EXECUTING_TO_COMPLETE_MIN: 4000,
  EXECUTING_TO_COMPLETE_MAX: 10000,
} as const;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MissionDispatcherAgent {
  private _activeMissions = new Map<string, AbortController>();
  private _broadcast: AgentEventBroadcastFn | null = null;

  constructor(private _store: MissionStore) {}

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  /** Dispatch a mission: begin DAG execution */
  async dispatch(missionId: string): Promise<boolean> {
    const mission = this._store.get(missionId);
    if (!mission) {
      console.warn(`[Dispatcher] Mission ${missionId} not found`);
      return false;
    }

    if (this._activeMissions.has(missionId)) {
      console.warn(`[Dispatcher] Mission ${missionId} already active`);
      return false;
    }

    this._store.updateStatus(missionId, 'ACTIVE');
    this._emitEvent('REPLAN_TRIGGERED', 'INFO', {
      missionId,
      message: `Mission "${mission.name}" dispatched — ${mission.tasks.length} tasks`,
    });

    const controller = new AbortController();
    this._activeMissions.set(missionId, controller);

    // Run async, don't block the HTTP response
    this._runDAG(missionId, mission.tasks, controller.signal).catch((err: unknown) => {
      console.error(`[Dispatcher] Mission ${missionId} execution error:`, err);
    });

    return true;
  }

  /** Pause a mission (tasks currently EXECUTING continue, new tasks won't start) */
  pause(missionId: string): boolean {
    const controller = this._activeMissions.get(missionId);
    if (!controller) return false;
    controller.abort();
    this._activeMissions.delete(missionId);
    this._store.updateStatus(missionId, 'DEPLOYING');
    console.log(`[Dispatcher] Mission ${missionId} paused`);
    return true;
  }

  /** Abort a mission: mark all non-complete tasks as FAILED */
  abort(missionId: string): boolean {
    const controller = this._activeMissions.get(missionId);
    controller?.abort();
    this._activeMissions.delete(missionId);

    const mission = this._store.get(missionId);
    if (!mission) return false;

    mission.tasks.forEach((task) => {
      if (task.status === 'QUEUED' || task.status === 'EXECUTING') {
        this._updateTask(missionId, task.id, 'FAILED');
      }
    });

    this._store.updateStatus(missionId, 'IDLE');
    console.log(`[Dispatcher] Mission ${missionId} aborted`);
    return true;
  }

  // ─── DAG Execution ───

  private async _runDAG(
    missionId: string,
    tasks: MissionTask[],
    signal: AbortSignal
  ): Promise<void> {
    // Build dependency map: taskId → set of task IDs it depends on
    // For Phase 3B: if no explicit dependsOn, tasks run sequentially
    const hasExplicitDeps = tasks.some((t) => (t as unknown as { dependsOn?: string[] }).dependsOn?.length);

    if (hasExplicitDeps) {
      await this._runDAGWithDeps(missionId, tasks, signal);
    } else {
      await this._runSequential(missionId, tasks, signal);
    }

    if (!signal.aborted) {
      const mission = this._store.get(missionId);
      const allDone = mission?.tasks.every((t) => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (allDone) {
        this._store.updateStatus(missionId, 'COMPLETED');
        this._activeMissions.delete(missionId);
        console.log(`[Dispatcher] Mission ${missionId} COMPLETED`);
        this._emitEvent('WORKFLOW_STAGE_CHANGE', 'INFO', { missionId, status: 'COMPLETED' });
      }
    }
  }

  /** Sequential fallback: tasks run one after another */
  private async _runSequential(
    missionId: string,
    tasks: MissionTask[],
    signal: AbortSignal
  ): Promise<void> {
    for (const task of tasks) {
      if (signal.aborted) break;
      await this._executeTask(missionId, task.id, signal);
    }
  }

  /** DAG execution: respects dependsOn edges */
  private async _runDAGWithDeps(
    missionId: string,
    tasks: MissionTask[],
    signal: AbortSignal
  ): Promise<void> {
    const completed = new Set<string>();
    const executing = new Set<string>();

    type TaskWithDeps = MissionTask & { dependsOn?: string[] };
    const pending = new Map<string, TaskWithDeps>(
      (tasks as TaskWithDeps[]).map((t) => [t.id, t])
    );

    while (pending.size > 0 && !signal.aborted) {
      // Find tasks whose dependencies are all completed
      const ready = Array.from(pending.values()).filter(
        (t) => !executing.has(t.id) && (t.dependsOn ?? []).every((dep) => completed.has(dep))
      );

      if (ready.length === 0) {
        // Wait for something to complete
        await this._sleep(200, signal);
        continue;
      }

      // Start all ready tasks in parallel
      await Promise.all(
        ready.map(async (task) => {
          executing.add(task.id);
          pending.delete(task.id);
          await this._executeTask(missionId, task.id, signal);
          executing.delete(task.id);
          completed.add(task.id);
        })
      );
    }
  }

  /** Execute a single task: simulate QUEUED → EXECUTING → COMPLETED (or FAILED ~10%) */
  async _executeTask(missionId: string, taskId: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;

    // QUEUED → EXECUTING
    await this._sleep(randomBetween(SIM.QUEUE_TO_EXECUTING_MIN, SIM.QUEUE_TO_EXECUTING_MAX), signal);
    if (signal.aborted) return;
    this._updateTask(missionId, taskId, 'EXECUTING');

    // EXECUTING → COMPLETED (or FAILED ~10% — triggers RePlannerAgent)
    await this._sleep(randomBetween(SIM.EXECUTING_TO_COMPLETE_MIN, SIM.EXECUTING_TO_COMPLETE_MAX), signal);
    if (signal.aborted) return;

    if (Math.random() < 0.1) {
      this._updateTask(missionId, taskId, 'FAILED');
    } else {
      this._updateTask(missionId, taskId, 'COMPLETED');
    }
  }

  /**
   * Reassign a failed task to a new robot and re-execute.
   * Called by RePlannerAgent after finding a replacement.
   */
  async retryTask(missionId: string, taskId: string, newRobotId: string): Promise<void> {
    this._store.updateTaskRobot(missionId, taskId, newRobotId);
    this._store.updateTaskStatus(missionId, taskId, 'QUEUED');

    const controller = this._activeMissions.get(missionId);
    const signal = controller?.signal ?? new AbortController().signal;

    console.log(`[Dispatcher] Retrying task ${taskId} with replacement robot ${newRobotId}`);
    await this._executeTask(missionId, taskId, signal);

    // Check if mission is now complete
    if (!signal.aborted) {
      const mission = this._store.get(missionId);
      const allDone = mission?.tasks.every((t) => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (allDone) {
        this._store.updateStatus(missionId, 'COMPLETED');
        this._activeMissions.delete(missionId);
        this._emitEvent('WORKFLOW_STAGE_CHANGE', 'INFO', { missionId, status: 'COMPLETED' });
      }
    }
  }

  private _updateTask(missionId: string, taskId: string, newStatus: TaskStatus): void {
    const task = this._store.get(missionId)?.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const oldStatus = task.status;
    this._store.updateTaskStatus(missionId, taskId, newStatus);
    console.log(`[Dispatcher] Task ${taskId} (${task.robotId}): ${oldStatus} → ${newStatus}`);

    this._emitEvent('WORKFLOW_STAGE_CHANGE', newStatus === 'FAILED' ? 'WARNING' : 'INFO', {
      missionId,
      taskId,
      robotId: task.robotId,
      oldStatus,
      newStatus,
    });

    // Notify RePlannerAgent via internal bus
    if (newStatus === 'FAILED') {
      kernelBus.emit('task_failed', { missionId, taskId, robotId: task.robotId });
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
      agentId: 'MISSION_DISPATCHER',
      eventKind,
      severity,
      payload,
      timestamp: Date.now(),
    });
  }

  private _sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
