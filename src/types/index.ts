/**
 * Aegis Fleet Orchestrator — Type Definitions
 * 
 * Canonical type system for the entire Aegis runtime.
 * Every robot, driver, telemetry packet, and mission object 
 * flows through these definitions.
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
// Driver Interface
// ─────────────────────────────────────────────

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

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

export interface IDriver {
  readonly protocolName: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendEstop(): Promise<void>;
  getTelemetry(): TelemetryPacket;
  getConnectionState(): ConnectionState;
}

// ─────────────────────────────────────────────
// Mission Types
// ─────────────────────────────────────────────

export type MissionStatus = 'IDLE' | 'PLANNING' | 'DEPLOYING' | 'ACTIVE' | 'COMPLETED' | 'EMERGENCY';

export interface MissionTask {
  id: string;
  robotId: string;
  command: string;
  status: 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  createdAt: number;
}

export interface ActiveRobot {
  config: RobotEntry;
  telemetry: TelemetryPacket;
  connectionState: ConnectionState;
}

// ─────────────────────────────────────────────
// Agent Event Types (Phase 3C)
// ─────────────────────────────────────────────

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

export interface WsAgentEvent {
  type: 'AGENT_EVENT';
  agentId: AgentId;
  eventKind: AgentEventKind;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  payload: unknown;
  timestamp: number;
}
