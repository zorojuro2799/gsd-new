/**
 * KernelEventBus — Typed internal event bus for inter-agent communication.
 *
 * Agents communicate via this bus instead of direct references:
 *   - TelemetryAgent emits 'telemetry' on each packet
 *   - AnomalyDetectionAgent emits 'anomaly_critical' when severity = CRITICAL
 *   - MissionDispatcherAgent emits 'task_failed' when a task transitions to FAILED
 *
 * This keeps agents decoupled: AnomalyDetection doesn't know about Maintenance,
 * Replanner doesn't know about Dispatcher internals, etc.
 */

import { EventEmitter } from 'events';
import type { TelemetryPacketV2, AnomalyFlag } from '../../../shared-types/src';

export interface KernelBusEvents {
  telemetry: TelemetryPacketV2;
  anomaly_critical: { robotId: string; ruleId: string; anomaly: AnomalyFlag };
  task_failed: { missionId: string; taskId: string; robotId: string };
}

type BusListener<K extends keyof KernelBusEvents> = (data: KernelBusEvents[K]) => void;

class KernelEventBusImpl extends EventEmitter {
  emit<K extends keyof KernelBusEvents>(event: K, data: KernelBusEvents[K]): boolean {
    return super.emit(event as string, data);
  }

  on<K extends keyof KernelBusEvents>(event: K, listener: BusListener<K>): this {
    return super.on(event as string, listener as (data: unknown) => void);
  }

  off<K extends keyof KernelBusEvents>(event: K, listener: BusListener<K>): this {
    return super.off(event as string, listener as (data: unknown) => void);
  }
}

/** Singleton — all agents import this and subscribe directly */
export const kernelBus = new KernelEventBusImpl();
kernelBus.setMaxListeners(50);
