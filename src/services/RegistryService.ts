/**
 * Aegis Fleet Orchestrator — Registry Service
 * 
 * The single source of truth for robot fleet metadata.
 * Loads ROBOT_REGISTRY.json, validates entries, and provides
 * tier-based grouping, search, and filtering capabilities.
 * 
 * This service sits between the raw JSON and the Zustand store,
 * ensuring data integrity before any robot enters the runtime.
 */

import type { RobotEntry, RobotTier, RobotRegistry } from '../types';
import REGISTRY_DATA from '../../ROBOT_REGISTRY.json';

// ─────────── Tier Metadata ───────────

export interface TierInfo {
  id: RobotTier;
  label: string;
  icon: string;
  color: string;
  description: string;
  protocolFamilies: string[];
}

export const TIER_DEFINITIONS: TierInfo[] = [
  {
    id: 'Humanoid',
    label: 'HUMANOID',
    icon: '🤖',
    color: '#A78BFA',
    description: 'Bipedal heavy-lift platforms for dexterous manipulation',
    protocolFamilies: ['Zenoh', 'gRPC', 'ROS2'],
  },
  {
    id: 'Quadruped',
    label: 'QUADRUPED',
    icon: '🐕',
    color: '#34D399',
    description: 'Four-legged inspection and patrol units',
    protocolFamilies: ['gRPC', 'CycloneDDS', 'ROS2'],
  },
  {
    id: 'Logistics',
    label: 'LOGISTICS',
    icon: '📦',
    color: '#FBBF24',
    description: 'Autonomous mobile robots for material transport',
    protocolFamilies: ['VDA 5050', 'REST', 'MQTT'],
  },
  {
    id: 'Aerial',
    label: 'AERIAL',
    icon: '🛸',
    color: '#38BDF8',
    description: 'UAV platforms for survey, mapping, and inspection',
    protocolFamilies: ['MAVLink', 'PSDK', 'WebRTC'],
  },
  {
    id: 'Specialized',
    label: 'SPECIALIZED',
    icon: '🔧',
    color: '#FB923C',
    description: 'Fixed arms, crawlers, and custom inspection platforms',
    protocolFamilies: ['Proprietary', 'RTDE', 'KUKA RSI'],
  },
];

// ─────────── Validation ───────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEntry(entry: RobotEntry, index: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!entry.id || entry.id.trim().length === 0) {
    errors.push(`[${index}] Missing robot ID`);
  }
  if (!entry.model || entry.model.trim().length === 0) {
    errors.push(`[${index}] Missing model name`);
  }
  if (!entry.middleware?.protocol) {
    errors.push(`[${index}] Missing middleware protocol`);
  }
  if (entry.state_logic.estop_latency_ms > 200) {
    warnings.push(`[${entry.id}] E-STOP latency ${entry.state_logic.estop_latency_ms}ms exceeds 200ms safety threshold`);
  }
  if (entry.state_logic.battery_critical_threshold < 5) {
    warnings.push(`[${entry.id}] Battery threshold ${entry.state_logic.battery_critical_threshold}% dangerously low`);
  }
  if (entry.coordinate_frames.frames.length === 0) {
    errors.push(`[${entry.id}] No coordinate frames defined`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─────────── Registry Service ───────────

export class RegistryService {
  private static _instance: RegistryService | null = null;
  private _robots: RobotEntry[] = [];
  private _version: string = '0.0';
  private _loaded: boolean = false;
  private _validationErrors: string[] = [];
  private _validationWarnings: string[] = [];

  private constructor() {}

  static getInstance(): RegistryService {
    if (!RegistryService._instance) {
      RegistryService._instance = new RegistryService();
    }
    return RegistryService._instance;
  }

  /**
   * Load and validate the robot registry.
   * Returns the number of valid robots loaded.
   */
  load(): number {
    if (this._loaded) return this._robots.length;

    try {
      const registry = REGISTRY_DATA as RobotRegistry;
      this._version = registry.version;

      const allErrors: string[] = [];
      const allWarnings: string[] = [];
      const validRobots: RobotEntry[] = [];

      registry.robots.forEach((robot, idx) => {
        const result = validateEntry(robot as RobotEntry, idx);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
        if (result.valid) {
          validRobots.push(robot as RobotEntry);
        }
      });

      this._robots = validRobots;
      this._validationErrors = allErrors;
      this._validationWarnings = allWarnings;
      this._loaded = true;

      if (allErrors.length > 0) {
        console.warn(`[RegistryService] ${allErrors.length} validation errors, ${validRobots.length}/${registry.robots.length} robots loaded`);
      }
      if (allWarnings.length > 0) {
        console.warn(`[RegistryService] ${allWarnings.length} warnings:`, allWarnings);
      }

      console.log(`[RegistryService] Loaded ${validRobots.length} robots from registry v${this._version}`);
      return validRobots.length;
    } catch (err) {
      console.error('[RegistryService] Fatal: Failed to parse ROBOT_REGISTRY.json', err);
      this._loaded = true;
      return 0;
    }
  }

  // ─── Accessors ───

  get version(): string { return this._version; }
  get robots(): RobotEntry[] { return this._robots; }
  get isLoaded(): boolean { return this._loaded; }
  get validationErrors(): string[] { return this._validationErrors; }
  get validationWarnings(): string[] { return this._validationWarnings; }

  // ─── Query Methods ───

  getById(id: string): RobotEntry | undefined {
    return this._robots.find((r) => r.id === id);
  }

  getByTier(tier: RobotTier): RobotEntry[] {
    return this._robots.filter((r) => r.class === tier);
  }

  getByProtocol(protocol: string): RobotEntry[] {
    const lower = protocol.toLowerCase();
    return this._robots.filter((r) =>
      r.middleware.protocol.toLowerCase().includes(lower)
    );
  }

  getTierCounts(): Record<RobotTier, number> {
    const counts: Record<string, number> = {};
    this._robots.forEach((r) => {
      counts[r.class] = (counts[r.class] ?? 0) + 1;
    });
    return counts as Record<RobotTier, number>;
  }

  getUniqueProtocols(): string[] {
    const protocols = new Set<string>();
    this._robots.forEach((r) => protocols.add(r.middleware.protocol));
    return Array.from(protocols).sort();
  }

  search(query: string): RobotEntry[] {
    const lower = query.toLowerCase();
    return this._robots.filter(
      (r) =>
        r.id.toLowerCase().includes(lower) ||
        r.model.toLowerCase().includes(lower) ||
        r.middleware.protocol.toLowerCase().includes(lower) ||
        r.class.toLowerCase().includes(lower)
    );
  }

  /**
   * Get all robots grouped by tier, sorted by tier order.
   */
  getGroupedByTier(): Map<RobotTier, RobotEntry[]> {
    const tierOrder: RobotTier[] = ['Humanoid', 'Quadruped', 'Logistics', 'Aerial', 'Specialized'];
    const grouped = new Map<RobotTier, RobotEntry[]>();
    tierOrder.forEach((tier) => {
      const robots = this.getByTier(tier);
      if (robots.length > 0) {
        grouped.set(tier, robots);
      }
    });
    return grouped;
  }

  /**
   * Get fleet-wide statistics.
   */
  getFleetStats(): {
    totalRobots: number;
    totalTiers: number;
    uniqueProtocols: number;
    avgEstopLatency: number;
    meshCapableCount: number;
  } {
    const protos = this.getUniqueProtocols();
    const avgEstop = this._robots.length > 0
      ? this._robots.reduce((sum, r) => sum + r.state_logic.estop_latency_ms, 0) / this._robots.length
      : 0;
    const meshCount = this._robots.filter((r) => r.state_logic.mesh_stream_available).length;

    return {
      totalRobots: this._robots.length,
      totalTiers: Object.keys(this.getTierCounts()).length,
      uniqueProtocols: protos.length,
      avgEstopLatency: Math.round(avgEstop),
      meshCapableCount: meshCount,
    };
  }
}
