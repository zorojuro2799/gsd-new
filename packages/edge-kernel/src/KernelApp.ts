/**
 * KernelApp — Coordinates all Edge Kernel components.
 * Phase 3A: Telemetry pipeline
 * Phase 3B: + Mission CRUD + MissionDispatcherAgent
 * Phase 3C: + AnomalyDetectionAgent + SpatialDeconflictionAgent
 *           + RePlannerAgent + MaintenanceWorkflowAgent
 */

import { RegistryLoader } from './registry/RegistryLoader';
import { AdapterFactory } from './adapters/AdapterFactory';
import { TelemetryAgent } from './agents/TelemetryAgent';
import { FleetStateAggregator } from './agents/FleetStateAggregator';
import { MissionStore } from './store/MissionStore';
import { MissionDispatcherAgent } from './agents/MissionDispatcherAgent';
import { AnomalyDetectionAgent } from './agents/AnomalyDetectionAgent';
import { SpatialDeconflictionAgent } from './agents/SpatialDeconflictionAgent';
import { RePlannerAgent } from './agents/RePlannerAgent';
import { MaintenanceWorkflowAgent } from './agents/MaintenanceWorkflowAgent';
import { PlannerAgent } from './agents/PlannerAgent';
import { WsServer } from './server/WsServer';
import { UdpEstop } from './server/UdpEstop';
import { createHttpServer } from './server/HttpServer';
import type { AgentId, KernelHealth } from '../../shared-types/src';

const PORTS = {
  UDP_ESTOP: 7400,
  WS_TELEMETRY: 7401,
  HTTP_REST: 7402,
  WS_EVENTS: 7403,
} as const;

export class KernelApp {
  private _fleetState = new FleetStateAggregator();
  private _missionStore = new MissionStore();
  private _dispatcher = new MissionDispatcherAgent(this._missionStore);
  private _telemetryAgent: TelemetryAgent | null = null;
  private _wsTelemetry: WsServer | null = null;
  private _wsEvents: WsServer | null = null;
  private _udpEstop: UdpEstop | null = null;
  private _agentStatuses = new Map<AgentId, 'RUNNING' | 'STOPPED' | 'ERROR'>();

  async start(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  AEGIS EDGE KERNEL — Starting (Phase 3A+3B+3C)    ║');
    console.log('╚════════════════════════════════════════════════════╝');

    const robots = RegistryLoader.load();

    // ─── WebSocket servers ───
    this._wsTelemetry = new WsServer(PORTS.WS_TELEMETRY, 'Telemetry');
    this._wsEvents = new WsServer(PORTS.WS_EVENTS, 'Events');

    // Shared broadcast function — sends agent events to both WS channels
    const broadcastEvent = (event: Parameters<WsServer['broadcastEvent']>[0]) => {
      this._wsEvents!.broadcastEvent(event);
      this._wsTelemetry!.broadcastEvent(event);
    };

    // ─── Telemetry agent ───
    this._telemetryAgent = new TelemetryAgent(robots, this._fleetState);
    this._telemetryAgent.setBroadcastFn((batch) => this._wsTelemetry!.broadcast(batch));
    this._setAgentStatus('TELEMETRY_AGGREGATION', 'RUNNING');
    await this._telemetryAgent.start();

    // ─── Mission Dispatcher agent ───
    this._dispatcher.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('MISSION_DISPATCHER', 'RUNNING');
    console.log(`[MissionDispatcher] Ready`);

    // ─── Anomaly Detection agent ───
    const anomalyAgent = new AnomalyDetectionAgent();
    anomalyAgent.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('ANOMALY_DETECTION', 'RUNNING');
    console.log(`[AnomalyDetection] Ready`);

    // ─── Spatial Deconfliction agent ───
    const deconflictAgent = new SpatialDeconflictionAgent();
    deconflictAgent.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('SPATIAL_DECONFLICTION', 'RUNNING');
    console.log(`[SpatialDeconfliction] Ready`);

    // ─── Re-Planner agent ───
    const replannerAgent = new RePlannerAgent(this._fleetState, this._missionStore, this._dispatcher);
    replannerAgent.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('REPLANNER', 'RUNNING');
    console.log(`[RePlannerAgent] Ready`);

    // ─── Maintenance Workflow agent ───
    const maintenanceAgent = new MaintenanceWorkflowAgent(
      this._fleetState,
      this._missionStore,
      this._dispatcher
    );
    maintenanceAgent.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('MAINTENANCE_WORKFLOW', 'RUNNING');
    console.log(`[MaintenanceWorkflow] Ready`);

    // ─── AI Planner agent ───
    const plannerAgent = new PlannerAgent(this._fleetState, this._missionStore);
    plannerAgent.setBroadcastFn(broadcastEvent);
    this._setAgentStatus('AI_PLANNER', plannerAgent.isReady ? 'RUNNING' : 'STOPPED');
    console.log(`[PlannerAgent] ${plannerAgent.isReady ? 'Ready (Claude Sonnet 4.6)' : 'Standby (set ANTHROPIC_API_KEY to enable)'}`);

    // ─── HTTP REST server ───
    const http = createHttpServer({
      port: PORTS.HTTP_REST,
      fleetState: this._fleetState,
      missionStore: this._missionStore,
      dispatcher: this._dispatcher,
      planner: plannerAgent,
      getAgentStatuses: () => this._getAgentStatuses(),
      getUptime: () => this._fleetState.getUptime(),
    });
    http.listen();

    // ─── UDP E-Stop ───
    this._udpEstop = new UdpEstop(PORTS.UDP_ESTOP);
    this._udpEstop.onEstop((robotId, ack) => {
      broadcastEvent(ack);

      if (robotId === 'ALL') {
        this._fleetState.setFleetStatus('EMERGENCY');
        AdapterFactory.getAll().forEach((a) => a.sendEstop().catch(console.error));
      }
    });

    console.log('');
    console.log(`  UDP  E-Stop       → udp://0.0.0.0:${PORTS.UDP_ESTOP}`);
    console.log(`  WS   Telemetry    → ws://0.0.0.0:${PORTS.WS_TELEMETRY}`);
    console.log(`  HTTP REST         → http://0.0.0.0:${PORTS.HTTP_REST}/api/v1`);
    console.log(`  WS   Events       → ws://0.0.0.0:${PORTS.WS_EVENTS}`);
    console.log('');
    console.log(`  Robots: ${robots.length} loaded`);
    console.log(`  Missions: ${this._missionStore.getAll().length} on disk`);
    console.log(`  Agents: 7 loaded (Telemetry, Dispatcher, Anomaly, Deconflict, Replanner, Maintenance, AI Planner)`);
    console.log(`  Mode: SIMULATED + AI PLANNING (Phase 3A–3D)`);
    console.log('');
  }

  stop(): void {
    this._telemetryAgent?.stop();
    this._wsTelemetry?.close();
    this._wsEvents?.close();
    this._udpEstop?.close();
    AdapterFactory.clear();
    console.log('[KernelApp] Stopped.');
  }

  private _setAgentStatus(id: AgentId, status: 'RUNNING' | 'STOPPED' | 'ERROR'): void {
    this._agentStatuses.set(id, status);
  }

  private _getAgentStatuses(): KernelHealth['agents'] {
    const all: AgentId[] = [
      'TELEMETRY_AGGREGATION',
      'MISSION_DISPATCHER',
      'ANOMALY_DETECTION',
      'SPATIAL_DECONFLICTION',
      'REPLANNER',
      'MAINTENANCE_WORKFLOW',
      'AI_PLANNER',
    ];
    const result = {} as KernelHealth['agents'];
    for (const id of all) {
      result[id] = this._agentStatuses.get(id) ?? 'STOPPED';
    }
    return result;
  }
}
