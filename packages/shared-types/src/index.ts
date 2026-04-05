/**
 * @aegis/shared-types
 *
 * Canonical type definitions shared between the mobile app and edge kernel.
 * Mobile app imports these as-is from src/types/index.ts (types are mirrored).
 * Edge kernel imports from this package.
 */

// ─────────────────────────────────────────────
// Robot Registry Types
// ─────────────────────────────────────────────

export type RobotTier =
  | 'Humanoid'
  | 'Quadruped'
  | 'Logistics'
  | 'Aerial'
  | 'Specialized';

export interface MiddlewareConfig {
  protocol: string;
  transport: string;
  distribution?: string;
}

export interface StateLogicConfig {
  battery_critical_threshold: number;
  estop_latency_ms: number;
  mesh_stream_available: boolean;
}

export interface CoordinateFrameConfig {
  standard: string;
  frames: string[];
}

export interface RobotEntry {
  id: string;
  class: RobotTier;
  model: string;
  middleware: MiddlewareConfig;
  state_logic: StateLogicConfig;
  coordinate_frames: CoordinateFrameConfig;
  model_path?: string;
}

export interface RobotRegistry {
  version: string;
  robots: RobotEntry[];
}

// ─────────────────────────────────────────────
// Connection & Telemetry Types
// ─────────────────────────────────────────────

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

/** Base telemetry shape — matches existing mobile TelemetryPacket exactly */
export interface TelemetryPacket {
  robotId: string;
  timestamp: number;
  battery: number;
  cpuTemp: number;
  connectionState: ConnectionState;
  jointStates: number[];
  pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
  };
}

/** Extended telemetry — server-side additions, backward compatible */
export interface TelemetryPacketV2 extends TelemetryPacket {
  /** Kernel receipt timestamp — for measuring real link latency */
  serverTimestamp: number;
  /** Which mission task this robot is currently executing, if any */
  missionTaskId: string | null;
  /** Anomaly flags set by AnomalyDetectionAgent */
  anomalyFlags: AnomalyFlag[];
  /** Actual measured E-Stop round-trip (vs registry estimate) */
  estopLatencyMeasuredMs?: number;
}

export interface AnomalyFlag {
  ruleId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  value: number | string;
  detectedAt: number;
}

// ─────────────────────────────────────────────
// Mission Types
// ─────────────────────────────────────────────

export type MissionStatus =
  | 'IDLE'
  | 'PLANNING'
  | 'DEPLOYING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'EMERGENCY';

export type TaskStatus = 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

/** Base task — matches existing mobile MissionTask exactly */
export interface MissionTask {
  id: string;
  robotId: string;
  command: string;
  status: TaskStatus;
  createdAt: number;
}

/** Extended task — Phase 3B+ with DAG edges and structured commands */
export interface MissionTaskV2 extends MissionTask {
  sequence: number;
  dependsOn: string[];
  verb: RobotVerb;
  zone: string;
  sensorMode?: SensorMode;
  parameters: Record<string, unknown>;
  timeoutMs: number;
  estimatedDurationMs: number;
  startedAt?: number;
  completedAt?: number;
}

export type RobotVerb =
  | 'NAVIGATE_TO'
  | 'INSPECT'
  | 'PATROL'
  | 'PICK'
  | 'PLACE'
  | 'SCAN'
  | 'HOVER'
  | 'DOCK'
  | 'IDLE';

export type SensorMode = 'LIDAR' | 'THERMAL' | 'RGB' | 'DEPTH' | 'IR' | 'NONE';

export interface Mission {
  id: string;
  name: string;
  status: MissionStatus;
  source: 'MANUAL' | 'AI_GENERATED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdAt: number;
  dispatchedAt?: number;
  deadline?: number;
  naturalLanguageInput?: string;
  tasks: MissionTask[];
}

// ─────────────────────────────────────────────
// WebSocket Message Types (Port 7401 + 7403)
// ─────────────────────────────────────────────

/** Sent by client on WebSocket connect */
export interface WsSubscribeMessage {
  type: 'SUBSCRIBE';
  filters: {
    robotIds: string[] | 'ALL';
    minIntervalMs: number;
    fields: Array<keyof TelemetryPacket>;
  };
  clientId: string;
}

/** Server → client telemetry batch */
export interface WsTelemetryBatch {
  type: 'TELEMETRY_BATCH';
  sequenceId: number;
  batchTimestamp: number;
  packets: TelemetryPacketV2[];
}

/** Server → client agent event */
export interface WsAgentEvent {
  type: 'AGENT_EVENT';
  agentId: AgentId;
  eventKind: AgentEventKind;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  payload: unknown;
  timestamp: number;
}

/** Server → client E-Stop acknowledgment */
export interface WsEstopAck {
  type: 'ESTOP_ACK';
  robotId: string | 'ALL';
  issuedAt: number;
  acknowledgedAt: number;
  latencyMs: number;
  success: boolean;
  errorReason?: string;
}

export type WsServerMessage = WsTelemetryBatch | WsAgentEvent | WsEstopAck;
export type WsClientMessage = WsSubscribeMessage;

export type AgentId =
  | 'TELEMETRY_AGGREGATION'
  | 'MISSION_DISPATCHER'
  | 'ANOMALY_DETECTION'
  | 'SPATIAL_DECONFLICTION'
  | 'REPLANNER'
  | 'MAINTENANCE_WORKFLOW'
  | 'AI_PLANNER';

export type AgentEventKind =
  | 'ANOMALY_DETECTED'
  | 'ANOMALY_CLEARED'
  | 'DECONFLICT_ALERT'
  | 'REPLAN_TRIGGERED'
  | 'WORKFLOW_STAGE_CHANGE'
  | 'PLAN_PROGRESS'
  | 'PLAN_COMPLETE'
  | 'PLAN_ERROR';

// ─────────────────────────────────────────────
// Fleet State (REST response shape)
// ─────────────────────────────────────────────

export interface RobotFleetEntry {
  config: RobotEntry;
  telemetry: TelemetryPacketV2;
  currentTaskId: string | null;
  anomalyFlags: AnomalyFlag[];
}

export interface FleetState {
  timestamp: number;
  fleetStatus: MissionStatus;
  totalRobots: number;
  onlineCount: number;
  robots: Record<string, RobotFleetEntry>;
  activeAnomalies: AnomalyFlag[];
}

export interface FleetStats {
  totalRobots: number;
  onlineCount: number;
  avgBattery: number;
  avgCpuTemp: number;
  tierCounts: Record<RobotTier, number>;
  protocolCounts: Record<string, number>;
}

// ─────────────────────────────────────────────
// Kernel Health
// ─────────────────────────────────────────────

export interface KernelHealth {
  status: 'OK' | 'DEGRADED' | 'ERROR';
  uptime: number;
  robotsLoaded: number;
  agents: Record<AgentId, 'RUNNING' | 'STOPPED' | 'ERROR'>;
  version: string;
}
