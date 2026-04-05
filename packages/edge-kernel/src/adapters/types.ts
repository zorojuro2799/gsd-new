/**
 * IProtocolAdapter — Server-side evolution of the mobile IDriver interface.
 * Each robot protocol family implements this interface.
 *
 * Phase 3A: SimulatedAdapter implements this using the existing simulation math.
 * Phase 3B+: Real protocol adapters (ROS2, Zenoh, gRPC, etc.) replace simulation.
 */

import type { TelemetryPacketV2, ConnectionState } from '../../../shared-types/src';

export interface IProtocolAdapter {
  readonly protocolName: string;
  readonly robotId: string;

  /** Start producing telemetry */
  connect(): Promise<void>;

  /** Stop producing telemetry */
  disconnect(): Promise<void>;

  /** Send E-Stop command. Returns measured round-trip latency ms. */
  sendEstop(): Promise<number>;

  /** Pull latest telemetry packet (called by TelemetryAgent at 30Hz) */
  getTelemetry(): TelemetryPacketV2;

  getConnectionState(): ConnectionState;
}
