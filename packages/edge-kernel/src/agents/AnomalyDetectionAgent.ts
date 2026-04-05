/**
 * AnomalyDetectionAgent — 30Hz rule engine over live telemetry.
 *
 * Subscribes to the KernelEventBus 'telemetry' event, evaluates each robot's
 * telemetry packet against configured rules, and broadcasts WS agent events
 * for any triggered anomalies.
 *
 * Rules are loaded from data/anomaly_rules.json.
 * Per-rule cooldowns prevent alert floods.
 * ANOMALY_CLEARED events fire when a robot drops below CRITICAL threshold.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TelemetryPacketV2, WsAgentEvent, AnomalyFlag } from '../../../shared-types/src';
import type { AgentEventBroadcastFn } from './MissionDispatcherAgent';
import { kernelBus } from '../bus/KernelEventBus';

interface AnomalyRule {
  id: string;
  field: keyof TelemetryPacketV2;
  op: 'lt' | 'gt' | 'eq' | 'gte' | 'lte';
  threshold: number | string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  cooldownMs: number;
  message: string;
}

const DATA_DIR = path.resolve(__dirname, '../../data');

export class AnomalyDetectionAgent {
  private _rules: AnomalyRule[] = [];
  private _broadcast: AgentEventBroadcastFn | null = null;

  // robotId → ruleId → last-fired timestamp (for cooldown)
  private _lastFired: Map<string, Map<string, number>> = new Map();

  // robotId → ruleId → currently active (to detect clears)
  private _activeFlags: Map<string, Set<string>> = new Map();

  constructor() {
    this._loadRules();
    kernelBus.on('telemetry', (packet) => this._evaluate(packet));
  }

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  private _loadRules(): void {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, 'anomaly_rules.json'), 'utf-8');
      this._rules = JSON.parse(raw) as AnomalyRule[];
      console.log(`[AnomalyAgent] Loaded ${this._rules.length} rules`);
    } catch (err) {
      console.error('[AnomalyAgent] Failed to load rules:', err);
    }
  }

  private _evaluate(packet: TelemetryPacketV2): void {
    const robotId = packet.robotId;
    const now = Date.now();

    if (!this._lastFired.has(robotId)) this._lastFired.set(robotId, new Map());
    if (!this._activeFlags.has(robotId)) this._activeFlags.set(robotId, new Set());

    const lastFiredByRule = this._lastFired.get(robotId)!;
    const activeByRobot = this._activeFlags.get(robotId)!;

    for (const rule of this._rules) {
      const rawValue = packet[rule.field];
      const triggered = this._check(rawValue, rule.op, rule.threshold);
      const wasActive = activeByRobot.has(rule.id);
      const lastFired = lastFiredByRule.get(rule.id) ?? 0;
      const cooledDown = now - lastFired >= rule.cooldownMs;

      if (triggered) {
        if (cooledDown) {
          // Fire anomaly event
          lastFiredByRule.set(rule.id, now);
          activeByRobot.add(rule.id);

          const anomaly: AnomalyFlag = {
            ruleId: rule.id,
            severity: rule.severity,
            value: rawValue as number | string,
            detectedAt: now,
          };

          console.log(`[AnomalyAgent] ${rule.severity} — ${robotId}: ${rule.message} (value=${rawValue})`);

          this._emitEvent('ANOMALY_DETECTED', rule.severity, {
            robotId,
            ruleId: rule.id,
            message: rule.message,
            value: rawValue,
            anomaly,
          });

          // Propagate CRITICAL anomalies on the internal bus for MaintenanceWorkflowAgent
          if (rule.severity === 'CRITICAL') {
            kernelBus.emit('anomaly_critical', { robotId, ruleId: rule.id, anomaly });
          }
        }
      } else if (wasActive) {
        // Condition cleared — notify
        activeByRobot.delete(rule.id);
        lastFiredByRule.delete(rule.id);

        console.log(`[AnomalyAgent] CLEARED — ${robotId}: ${rule.id}`);
        this._emitEvent('ANOMALY_CLEARED', 'INFO', {
          robotId,
          ruleId: rule.id,
          message: `${rule.message} — cleared`,
        });
      }
    }
  }

  private _check(value: unknown, op: AnomalyRule['op'], threshold: number | string): boolean {
    if (typeof threshold === 'string') {
      return op === 'eq' ? value === threshold : false;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (isNaN(n)) return false;
    switch (op) {
      case 'lt':  return n < threshold;
      case 'lte': return n <= threshold;
      case 'gt':  return n > threshold;
      case 'gte': return n >= threshold;
      case 'eq':  return n === threshold;
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
      agentId: 'ANOMALY_DETECTION',
      eventKind,
      severity,
      payload,
      timestamp: Date.now(),
    });
  }
}
