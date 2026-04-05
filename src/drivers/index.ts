/**
 * Aegis Fleet Orchestrator — Hardware Driver Factory (Phase 2)
 * 
 * Multi-Driver Architecture: Each robot family uses a specific 
 * "Driver Plugin" selected at runtime based on ROBOT_REGISTRY.json 
 * protocol declarations.
 * 
 * Phase 2 Enhancement: Per-protocol telemetry characteristics.
 * Each driver generates telemetry data with realistic patterns:
 *   - Humanoids: High joint-state count (12+ DOF), moderate battery drain
 *   - Quadrupeds: 12-joint gait data, terrain-induced orientation noise
 *   - Logistics AMRs: Flat orientation, high battery, low CPU
 *   - Aerial UAVs: Aggressive battery drain, altitude in pose.z
 *   - Specialized: Protocol-specific data shapes
 */

import type {
  RobotEntry,
  IDriver,
  TelemetryPacket,
  ConnectionState,
} from '../types';

// ─────────── Telemetry Simulation Helpers ───────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * range;
}

// Simulated battery drain per refresh cycle by tier
const DRAIN_RATES: Record<string, number> = {
  Humanoid: 0.08,
  Quadruped: 0.06,
  Logistics: 0.02,
  Aerial: 0.15,
  Specialized: 0.01,
};

// Internal state tracker for battery simulation
const batteryState: Record<string, number> = {};

function getSimulatedBattery(robotId: string, tier: string): number {
  if (!(robotId in batteryState)) {
    batteryState[robotId] = 85 + Math.floor(Math.random() * 15);
  }
  const drain = DRAIN_RATES[tier] ?? 0.03;
  batteryState[robotId] = clamp(batteryState[robotId] - drain, 5, 100);
  return Math.round(batteryState[robotId]);
}

// ─────────── Base Driver ───────────

abstract class BaseDriver implements IDriver {
  abstract readonly protocolName: string;
  protected state: ConnectionState = 'DISCONNECTED';

  constructor(protected config: RobotEntry) {}

  async connect() {
    this.state = 'CONNECTING';
    this.state = 'CONNECTED';
    console.log(`[${this.protocolName}] Connected: ${this.config.id}`);
  }

  async disconnect() {
    this.state = 'DISCONNECTED';
    console.log(`[${this.protocolName}] Disconnected: ${this.config.id}`);
  }

  async sendEstop() {
    console.log(`[${this.protocolName}/ESTOP] ${this.config.id} — budget: ${this.config.state_logic.estop_latency_ms}ms`);
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  abstract getTelemetry(): TelemetryPacket;

  protected makeBaseTelemetry(): TelemetryPacket {
    return {
      robotId: this.config.id,
      timestamp: Date.now(),
      battery: getSimulatedBattery(this.config.id, this.config.class),
      cpuTemp: 0,
      connectionState: this.state,
      jointStates: [],
      pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
    };
  }
}

// ─────────── Protocol-Specific Drivers ───────────

class ZenohDriver extends BaseDriver {
  readonly protocolName = 'Zenoh';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    // Humanoid: 22 DOF joint states, stable orientation
    t.cpuTemp = Math.round(jitter(52, 8));
    t.jointStates = Array.from({ length: 22 }, () => jitter(0, 0.3));
    t.pose = {
      x: jitter(0, 0.05), y: jitter(0, 0.05), z: 0.95,
      yaw: jitter(0, 5), pitch: jitter(0, 2), roll: jitter(0, 2),
    };
    return t;
  }
}

class ROS2Driver extends BaseDriver {
  readonly protocolName = 'ROS2';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    const isQuad = this.config.class === 'Quadruped';
    t.cpuTemp = Math.round(jitter(45, 10));
    // Quads: 12 joints with gait noise. Others: 6-axis
    t.jointStates = Array.from(
      { length: isQuad ? 12 : 6 },
      () => jitter(0, isQuad ? 0.8 : 0.2)
    );
    t.pose = {
      x: jitter(0, 0.1), y: jitter(0, 0.1), z: isQuad ? 0.45 : 0,
      yaw: jitter(0, isQuad ? 15 : 3),
      pitch: jitter(0, isQuad ? 8 : 1),
      roll: jitter(0, isQuad ? 8 : 1),
    };
    return t;
  }
}

class GRPCDriver extends BaseDriver {
  readonly protocolName = 'gRPC';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    const isHumanoid = this.config.class === 'Humanoid';
    t.cpuTemp = Math.round(jitter(48, 6));
    t.jointStates = Array.from(
      { length: isHumanoid ? 28 : 12 },
      () => jitter(0, 0.4)
    );
    t.pose = {
      x: jitter(0, 0.08), y: jitter(0, 0.08), z: isHumanoid ? 1.2 : 0.5,
      yaw: jitter(0, 10), pitch: jitter(0, 3), roll: jitter(0, 3),
    };
    return t;
  }
}

class VDA5050Driver extends BaseDriver {
  readonly protocolName = 'VDA 5050';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    // AMRs: flat, low CPU, no joints
    t.cpuTemp = Math.round(jitter(32, 4));
    t.jointStates = []; // wheeled platform, no articulated joints
    t.pose = {
      x: jitter(5, 0.5), y: jitter(3, 0.5), z: 0,
      yaw: jitter(45, 2), pitch: 0, roll: 0,
    };
    return t;
  }
}

class MAVLinkDriver extends BaseDriver {
  readonly protocolName = 'MAVLink/PSDK';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    // UAV: aggressive drain, altitude in z, wind-induced orientation
    t.cpuTemp = Math.round(jitter(38, 6));
    t.jointStates = [0, 0, 0, 0]; // 4 motor RPMs
    t.pose = {
      x: jitter(10, 2), y: jitter(10, 2), z: jitter(50, 5), // 50m altitude
      yaw: jitter(0, 20), pitch: jitter(-5, 10), roll: jitter(0, 15),
    };
    return t;
  }
}

class WebRTCDriver extends BaseDriver {
  readonly protocolName = 'WebRTC';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    const isAerial = this.config.class === 'Aerial';
    t.cpuTemp = Math.round(jitter(42, 8));
    t.jointStates = isAerial ? [0, 0, 0, 0] : Array.from({ length: 12 }, () => jitter(0, 0.6));
    t.pose = {
      x: jitter(0, 0.3), y: jitter(0, 0.3),
      z: isAerial ? jitter(30, 3) : 0.4,
      yaw: jitter(0, 12), pitch: jitter(0, 6), roll: jitter(0, 6),
    };
    return t;
  }
}

class RESTDriver extends BaseDriver {
  readonly protocolName = 'REST/HTTP';

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    t.cpuTemp = Math.round(jitter(35, 6));
    t.jointStates = [];
    t.pose = {
      x: jitter(0, 0.2), y: jitter(0, 0.2), z: 0,
      yaw: jitter(0, 5), pitch: 0, roll: 0,
    };
    return t;
  }
}

class GenericDriver extends BaseDriver {
  readonly protocolName: string;

  constructor(config: RobotEntry) {
    super(config);
    this.protocolName = config.middleware.protocol;
  }

  getTelemetry(): TelemetryPacket {
    const t = this.makeBaseTelemetry();
    const isArm = this.config.id.includes('arm');
    t.cpuTemp = Math.round(jitter(40, 5));
    t.jointStates = isArm ? Array.from({ length: 6 }, () => jitter(0, 1.5)) : [];
    t.pose = {
      x: 0, y: 0, z: 0,
      yaw: isArm ? jitter(0, 30) : 0,
      pitch: isArm ? jitter(0, 20) : 0,
      roll: isArm ? jitter(0, 10) : 0,
    };
    return t;
  }
}

// ─────────── Hardware Factory ───────────

export class HardwareFactory {
  private static driverCache = new Map<string, IDriver>();

  static createDriver(config: RobotEntry): IDriver {
    const cached = this.driverCache.get(config.id);
    if (cached) return cached;

    const proto = config.middleware.protocol.toLowerCase();
    const transport = config.middleware.transport.toLowerCase();
    let driver: IDriver;

    if (proto.includes('zenoh')) {
      driver = new ZenohDriver(config);
    } else if (proto.includes('vda')) {
      driver = new VDA5050Driver(config);
    } else if (proto.includes('psdk') || proto.includes('mavlink')) {
      driver = new MAVLinkDriver(config);
    } else if (proto.includes('grpc')) {
      driver = new GRPCDriver(config);
    } else if (proto.includes('ros2') || proto.includes('ros') || proto.includes('cyclonedds')) {
      driver = new ROS2Driver(config);
    } else if (proto.includes('autonomy engine') || transport.includes('webrtc')) {
      driver = new WebRTCDriver(config);
    } else if (proto.includes('rest') || proto.includes('olympe') || proto.includes('cloud api')) {
      driver = new RESTDriver(config);
    } else {
      driver = new GenericDriver(config);
    }

    this.driverCache.set(config.id, driver);
    return driver;
  }

  static getDriver(robotId: string): IDriver | undefined {
    return this.driverCache.get(robotId);
  }

  static getDriverCount(): number {
    return this.driverCache.size;
  }

  static clearCache(): void {
    batteryState[Symbol.for('reset') as unknown as string] = 0; // type trick
    this.driverCache.clear();
  }

  /**
   * Get driver protocol name for a given robot config
   * without instantiating the full driver.
   */
  static resolveProtocol(config: RobotEntry): string {
    const proto = config.middleware.protocol.toLowerCase();
    const transport = config.middleware.transport.toLowerCase();
    if (proto.includes('zenoh')) return 'Zenoh';
    if (proto.includes('vda')) return 'VDA 5050';
    if (proto.includes('psdk') || proto.includes('mavlink')) return 'MAVLink/PSDK';
    if (proto.includes('grpc')) return 'gRPC';
    if (proto.includes('ros2') || proto.includes('ros') || proto.includes('cyclonedds')) return 'ROS2';
    if (proto.includes('autonomy engine') || transport.includes('webrtc')) return 'WebRTC';
    if (proto.includes('rest') || proto.includes('olympe') || proto.includes('cloud api')) return 'REST/HTTP';
    return config.middleware.protocol;
  }
}
