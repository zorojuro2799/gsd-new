/**
 * SimulatedAdapter — Ports the exact simulation logic from src/drivers/index.ts.
 *
 * Phase 3A: Produces identical telemetry to the existing mobile drivers,
 * but runs server-side and pushes via WebSocket instead of in-process polling.
 * This lets the full pipeline (WebSocket → KernelSocketService → Zustand) be
 * tested without any real robots.
 *
 * Phase 3B+: Real adapters replace this class per protocol.
 */

import type { RobotEntry, TelemetryPacketV2, ConnectionState } from '../../../shared-types/src';
import type { IProtocolAdapter } from './types';

// ─────────── Simulation Helpers (identical to src/drivers/index.ts) ───────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * range;
}

const DRAIN_RATES: Record<string, number> = {
  Humanoid: 0.08,
  Quadruped: 0.06,
  Logistics: 0.02,
  Aerial: 0.15,
  Specialized: 0.01,
};

// Shared battery state across all instances (server-side singleton)
const batteryState: Record<string, number> = {};

function getSimulatedBattery(robotId: string, tier: string): number {
  if (!(robotId in batteryState)) {
    batteryState[robotId] = 85 + Math.floor(Math.random() * 15);
  }
  const drain = DRAIN_RATES[tier] ?? 0.03;
  batteryState[robotId] = clamp(batteryState[robotId] - drain, 5, 100);
  return Math.round(batteryState[robotId]);
}

// ─────────── SimulatedAdapter ───────────

export class SimulatedAdapter implements IProtocolAdapter {
  readonly protocolName: string;
  readonly robotId: string;
  private _state: ConnectionState = 'DISCONNECTED';

  constructor(private config: RobotEntry) {
    this.robotId = config.id;
    this.protocolName = `Simulated/${config.middleware.protocol}`;
  }

  async connect(): Promise<void> {
    this._state = 'CONNECTING';
    // Simulate connection delay based on protocol
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    this._state = 'CONNECTED';
  }

  async disconnect(): Promise<void> {
    this._state = 'DISCONNECTED';
  }

  async sendEstop(): Promise<number> {
    const latencyMs = this.config.state_logic.estop_latency_ms + jitter(0, 2);
    console.log(`[SimEstop] ${this.robotId} — ${latencyMs.toFixed(1)}ms`);
    return latencyMs;
  }

  getConnectionState(): ConnectionState {
    return this._state;
  }

  getTelemetry(): TelemetryPacketV2 {
    const base = this._makeBase();
    const proto = this.config.middleware.protocol.toLowerCase();
    const transport = this.config.middleware.transport.toLowerCase();

    if (proto.includes('zenoh')) return this._zenohTelemetry(base);
    if (proto.includes('vda')) return this._vda5050Telemetry(base);
    if (proto.includes('psdk') || proto.includes('mavlink')) return this._mavlinkTelemetry(base);
    if (proto.includes('grpc')) return this._grpcTelemetry(base);
    if (proto.includes('ros2') || proto.includes('ros') || proto.includes('cyclonedds')) return this._ros2Telemetry(base);
    if (proto.includes('autonomy engine') || transport.includes('webrtc')) return this._webrtcTelemetry(base);
    if (proto.includes('rest') || proto.includes('olympe') || proto.includes('cloud api')) return this._restTelemetry(base);
    return this._genericTelemetry(base);
  }

  private _makeBase(): TelemetryPacketV2 {
    const now = Date.now();
    return {
      robotId: this.config.id,
      timestamp: now,
      serverTimestamp: now,
      battery: getSimulatedBattery(this.config.id, this.config.class),
      cpuTemp: 0,
      connectionState: this._state,
      jointStates: [],
      pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
      missionTaskId: null,
      anomalyFlags: [],
    };
  }

  private _zenohTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    t.cpuTemp = Math.round(jitter(52, 8));
    t.jointStates = Array.from({ length: 22 }, () => jitter(0, 0.3));
    t.pose = { x: jitter(0, 0.05), y: jitter(0, 0.05), z: 0.95, yaw: jitter(0, 5), pitch: jitter(0, 2), roll: jitter(0, 2) };
    return t;
  }

  private _ros2Telemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    const isQuad = this.config.class === 'Quadruped';
    t.cpuTemp = Math.round(jitter(45, 10));
    t.jointStates = Array.from({ length: isQuad ? 12 : 6 }, () => jitter(0, isQuad ? 0.8 : 0.2));
    t.pose = { x: jitter(0, 0.1), y: jitter(0, 0.1), z: isQuad ? 0.45 : 0, yaw: jitter(0, isQuad ? 15 : 3), pitch: jitter(0, isQuad ? 8 : 1), roll: jitter(0, isQuad ? 8 : 1) };
    return t;
  }

  private _grpcTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    const isHumanoid = this.config.class === 'Humanoid';
    t.cpuTemp = Math.round(jitter(48, 6));
    t.jointStates = Array.from({ length: isHumanoid ? 28 : 12 }, () => jitter(0, 0.4));
    t.pose = { x: jitter(0, 0.08), y: jitter(0, 0.08), z: isHumanoid ? 1.2 : 0.5, yaw: jitter(0, 10), pitch: jitter(0, 3), roll: jitter(0, 3) };
    return t;
  }

  private _vda5050Telemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    t.cpuTemp = Math.round(jitter(32, 4));
    t.jointStates = [];
    t.pose = { x: jitter(5, 0.5), y: jitter(3, 0.5), z: 0, yaw: jitter(45, 2), pitch: 0, roll: 0 };
    return t;
  }

  private _mavlinkTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    t.cpuTemp = Math.round(jitter(38, 6));
    t.jointStates = [0, 0, 0, 0];
    t.pose = { x: jitter(10, 2), y: jitter(10, 2), z: jitter(50, 5), yaw: jitter(0, 20), pitch: jitter(-5, 10), roll: jitter(0, 15) };
    return t;
  }

  private _webrtcTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    const isAerial = this.config.class === 'Aerial';
    t.cpuTemp = Math.round(jitter(42, 8));
    t.jointStates = isAerial ? [0, 0, 0, 0] : Array.from({ length: 12 }, () => jitter(0, 0.6));
    t.pose = { x: jitter(0, 0.3), y: jitter(0, 0.3), z: isAerial ? jitter(30, 3) : 0.4, yaw: jitter(0, 12), pitch: jitter(0, 6), roll: jitter(0, 6) };
    return t;
  }

  private _restTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    t.cpuTemp = Math.round(jitter(35, 6));
    t.jointStates = [];
    t.pose = { x: jitter(0, 0.2), y: jitter(0, 0.2), z: 0, yaw: jitter(0, 5), pitch: 0, roll: 0 };
    return t;
  }

  private _genericTelemetry(t: TelemetryPacketV2): TelemetryPacketV2 {
    const isArm = this.config.id.includes('arm');
    t.cpuTemp = Math.round(jitter(40, 5));
    t.jointStates = isArm ? Array.from({ length: 6 }, () => jitter(0, 1.5)) : [];
    t.pose = { x: 0, y: 0, z: 0, yaw: isArm ? jitter(0, 30) : 0, pitch: isArm ? jitter(0, 20) : 0, roll: isArm ? jitter(0, 10) : 0 };
    return t;
  }
}
