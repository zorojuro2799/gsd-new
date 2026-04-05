/**
 * SpatialDeconflictionAgent — Prevents robot collisions in shared spaces.
 *
 * Loads facility_map.json zone definitions. On each telemetry tick, checks
 * each robot's pose against zone bounds. EXCLUSIVE zones trigger a
 * DECONFLICT_ALERT if more than one robot is present simultaneously.
 *
 * Alerts fire only on state changes (new conflict detected), not every tick.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TelemetryPacketV2, WsAgentEvent } from '../../../shared-types/src';
import type { AgentEventBroadcastFn } from './MissionDispatcherAgent';
import { kernelBus } from '../bus/KernelEventBus';

interface ZoneBounds {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
}

interface FacilityZone {
  id: string;
  name: string;
  type: 'EXCLUSIVE' | 'SHARED' | 'AERIAL_EXCLUSIVE';
  bounds: ZoneBounds;
}

interface FacilityMap {
  version: string;
  zones: FacilityZone[];
}

const DATA_DIR = path.resolve(__dirname, '../../data');

export class SpatialDeconflictionAgent {
  private _zones: FacilityZone[] = [];
  private _broadcast: AgentEventBroadcastFn | null = null;

  // zoneId → Set<robotId> — robots currently in zone (from last tick)
  private _zoneOccupancy: Map<string, Set<string>> = new Map();

  // zoneId → Set<conflicting robotIds> — alerts currently active
  private _activeConflicts: Map<string, Set<string>> = new Map();

  // robotId → last known pose
  private _latestPoses: Map<string, TelemetryPacketV2['pose']> = new Map();

  constructor() {
    this._loadMap();
    kernelBus.on('telemetry', (packet) => this._processTelemetry(packet));
  }

  setBroadcastFn(fn: AgentEventBroadcastFn): void {
    this._broadcast = fn;
  }

  private _loadMap(): void {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, 'facility_map.json'), 'utf-8');
      const facilityMap = JSON.parse(raw) as FacilityMap;
      this._zones = facilityMap.zones;
      this._zones.forEach((z) => {
        this._zoneOccupancy.set(z.id, new Set());
        this._activeConflicts.set(z.id, new Set());
      });
      console.log(`[DeconflictAgent] Loaded ${this._zones.length} zones`);
    } catch (err) {
      console.error('[DeconflictAgent] Failed to load facility map:', err);
    }
  }

  private _processTelemetry(packet: TelemetryPacketV2): void {
    this._latestPoses.set(packet.robotId, packet.pose);
    this._checkConflicts(packet.robotId, packet.pose);
  }

  private _checkConflicts(robotId: string, pose: TelemetryPacketV2['pose']): void {
    for (const zone of this._zones) {
      // Only enforce EXCLUSIVE and AERIAL_EXCLUSIVE zones
      if (zone.type === 'SHARED') continue;

      const occupancy = this._zoneOccupancy.get(zone.id)!;
      const wasInZone = occupancy.has(robotId);
      const isInZone = this._inBounds(pose, zone.bounds);

      if (isInZone && !wasInZone) {
        occupancy.add(robotId);
      } else if (!isInZone && wasInZone) {
        occupancy.delete(robotId);
      }

      // Check if zone now has a conflict (> 1 robot for EXCLUSIVE)
      const active = this._activeConflicts.get(zone.id)!;
      const currentRobots = Array.from(occupancy);

      if (occupancy.size > 1) {
        // New robots in conflict that weren't before
        const newConflicts = currentRobots.filter((r) => !active.has(r));
        if (newConflicts.length > 0) {
          currentRobots.forEach((r) => active.add(r));
          console.log(`[DeconflictAgent] CONFLICT in ${zone.name}: [${currentRobots.join(', ')}]`);
          this._emitAlert(zone, currentRobots);
        }
      } else {
        // Conflict resolved — clear active set
        if (active.size > 0) {
          active.clear();
          console.log(`[DeconflictAgent] Conflict cleared in ${zone.name}`);
        }
      }
    }
  }

  private _inBounds(pose: TelemetryPacketV2['pose'], bounds: ZoneBounds): boolean {
    return (
      pose.x >= bounds.xMin && pose.x <= bounds.xMax &&
      pose.y >= bounds.yMin && pose.y <= bounds.yMax &&
      pose.z >= bounds.zMin && pose.z <= bounds.zMax
    );
  }

  private _emitAlert(zone: FacilityZone, robotIds: string[]): void {
    if (!this._broadcast) return;
    const event: WsAgentEvent = {
      type: 'AGENT_EVENT',
      agentId: 'SPATIAL_DECONFLICTION',
      eventKind: 'DECONFLICT_ALERT',
      severity: 'WARNING',
      payload: {
        zoneId: zone.id,
        zoneName: zone.name,
        robotIds,
        message: `${robotIds.length} robots in EXCLUSIVE zone "${zone.name}" — collision risk`,
        recommendedAction: 'Hold secondary robot until primary clears zone',
      },
      timestamp: Date.now(),
    };
    this._broadcast(event);
  }
}
