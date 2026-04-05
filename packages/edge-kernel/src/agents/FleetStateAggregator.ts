/**
 * FleetStateAggregator — In-memory snapshot of live fleet state.
 * Updated by TelemetryAgent on every normalized packet.
 * Read by HttpServer for GET /fleet/state.
 */

import type {
  RobotEntry,
  TelemetryPacketV2,
  FleetState,
  FleetStats,
  RobotFleetEntry,
  MissionStatus,
  RobotTier,
} from '../../../shared-types/src';

export class FleetStateAggregator {
  private _robots: Map<string, RobotFleetEntry> = new Map();
  private _fleetStatus: MissionStatus = 'IDLE';
  private _startTime = Date.now();

  updateTelemetry(config: RobotEntry, packet: TelemetryPacketV2): void {
    const existing = this._robots.get(config.id);
    this._robots.set(config.id, {
      config,
      telemetry: packet,
      currentTaskId: existing?.currentTaskId ?? null,
      anomalyFlags: packet.anomalyFlags,
    });
  }

  setFleetStatus(status: MissionStatus): void {
    this._fleetStatus = status;
  }

  getFleetState(): FleetState {
    const robots: Record<string, RobotFleetEntry> = {};
    this._robots.forEach((entry, id) => {
      robots[id] = entry;
    });

    const onlineCount = Array.from(this._robots.values()).filter(
      (e) => e.telemetry.connectionState === 'CONNECTED'
    ).length;

    const activeAnomalies = Array.from(this._robots.values()).flatMap(
      (e) => e.anomalyFlags
    );

    return {
      timestamp: Date.now(),
      fleetStatus: this._fleetStatus,
      totalRobots: this._robots.size,
      onlineCount,
      robots,
      activeAnomalies,
    };
  }

  getStats(): FleetStats {
    const entries = Array.from(this._robots.values());
    const totalRobots = entries.length;
    const onlineCount = entries.filter((e) => e.telemetry.connectionState === 'CONNECTED').length;

    const avgBattery =
      totalRobots === 0
        ? 0
        : Math.round(entries.reduce((sum, e) => sum + e.telemetry.battery, 0) / totalRobots);

    const avgCpuTemp =
      totalRobots === 0
        ? 0
        : Math.round(entries.reduce((sum, e) => sum + e.telemetry.cpuTemp, 0) / totalRobots);

    const tierCounts: Record<RobotTier, number> = {
      Humanoid: 0, Quadruped: 0, Logistics: 0, Aerial: 0, Specialized: 0,
    };
    const protocolCounts: Record<string, number> = {};

    entries.forEach(({ config }) => {
      tierCounts[config.class] = (tierCounts[config.class] ?? 0) + 1;
      const proto = config.middleware.protocol;
      protocolCounts[proto] = (protocolCounts[proto] ?? 0) + 1;
    });

    return { totalRobots, onlineCount, avgBattery, avgCpuTemp, tierCounts, protocolCounts };
  }

  getRobotEntry(robotId: string): RobotFleetEntry | undefined {
    return this._robots.get(robotId);
  }

  getAllRobots(): RobotFleetEntry[] {
    return Array.from(this._robots.values());
  }

  getUptime(): number {
    return Date.now() - this._startTime;
  }
}
