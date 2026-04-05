/**
 * TelemetryAgent — Polls all protocol adapters, normalizes telemetry,
 * and broadcasts to WebSocket clients.
 *
 * Phase 3A: Polls SimulatedAdapters at TELEMETRY_INTERVAL_MS.
 * Phase 3B+: Adapters push via onTelemetry() callbacks instead of polling.
 */

import type { RobotEntry, TelemetryPacketV2, WsTelemetryBatch } from '../../../shared-types/src';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { FleetStateAggregator } from './FleetStateAggregator';
import { kernelBus } from '../bus/KernelEventBus';

const TELEMETRY_INTERVAL_MS = 1000; // 1Hz poll from server; clients throttle further
const MAX_BATCH_SIZE = 10; // max robots per WS frame to avoid large payloads

export type TelemetryBroadcastFn = (batch: WsTelemetryBatch) => void;

export class TelemetryAgent {
  private _intervalHandle: NodeJS.Timeout | null = null;
  private _sequenceId = 0;
  private _broadcastFn: TelemetryBroadcastFn | null = null;

  constructor(
    private _robots: RobotEntry[],
    private _fleetState: FleetStateAggregator
  ) {}

  /** Register the WS server's broadcast function */
  setBroadcastFn(fn: TelemetryBroadcastFn): void {
    this._broadcastFn = fn;
  }

  async start(): Promise<void> {
    // Connect all adapters
    await Promise.all(
      this._robots.map(async (robot) => {
        const adapter = AdapterFactory.create(robot);
        await adapter.connect();
        console.log(`[TelemetryAgent] Connected: ${robot.id} (${adapter.protocolName})`);
      })
    );

    console.log(`[TelemetryAgent] Started polling ${this._robots.length} robots`);
    this._intervalHandle = setInterval(() => this._tick(), TELEMETRY_INTERVAL_MS);
  }

  stop(): void {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
  }

  /** Force an immediate telemetry poll (used by HTTP /fleet/state) */
  pollOnce(): TelemetryPacketV2[] {
    return this._robots
      .map((robot) => AdapterFactory.get(robot.id)?.getTelemetry())
      .filter((p): p is TelemetryPacketV2 => p !== undefined);
  }

  private _tick(): void {
    const allPackets: TelemetryPacketV2[] = [];

    for (const robot of this._robots) {
      const adapter = AdapterFactory.get(robot.id);
      if (!adapter) continue;

      const packet = adapter.getTelemetry();
      this._fleetState.updateTelemetry(robot, packet);
      allPackets.push(packet);
      kernelBus.emit('telemetry', packet);
    }

    if (!this._broadcastFn || allPackets.length === 0) return;

    // Split into batches to avoid huge single WS frames
    for (let i = 0; i < allPackets.length; i += MAX_BATCH_SIZE) {
      const batch: WsTelemetryBatch = {
        type: 'TELEMETRY_BATCH',
        sequenceId: ++this._sequenceId,
        batchTimestamp: Date.now(),
        packets: allPackets.slice(i, i + MAX_BATCH_SIZE),
      };
      this._broadcastFn(batch);
    }
  }
}
