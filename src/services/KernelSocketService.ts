/**
 * KernelSocketService — WebSocket client for Edge Kernel telemetry stream.
 *
 * Replaces the in-app setInterval simulation in DashboardScreen
 * when KernelConfig.USE_KERNEL = true.
 *
 * When kernel is unreachable, DashboardScreen falls back to the existing
 * HardwareFactory simulation automatically.
 *
 * Usage (in DashboardScreen or App.tsx):
 *   import { kernelSocket } from '../services/KernelSocketService';
 *   kernelSocket.connect();   // call once on app start
 *   kernelSocket.disconnect(); // call on cleanup
 */

import { useMissionStore } from '../store/useMissionStore';
import { KernelConfig } from './KernelConfig';
import type { WsTelemetryBatch, WsSubscribeMessage, WsEstopAck, WsAgentEvent } from '../../packages/shared-types/src';

type KernelConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

type ConnectionListener = (state: KernelConnectionState) => void;

class KernelSocketServiceImpl {
  private _ws: WebSocket | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectionListeners: Set<ConnectionListener> = new Set();
  private _clientId = `mobile-${Date.now()}`;
  private _state: KernelConnectionState = 'DISCONNECTED';
  private _intentionalClose = false;

  get state(): KernelConnectionState {
    return this._state;
  }

  /** Start the WebSocket connection to the Edge Kernel. */
  connect(): void {
    if (!KernelConfig.USE_KERNEL) return;
    if (this._state === 'CONNECTED' || this._state === 'CONNECTING') return;

    this._intentionalClose = false;
    this._doConnect();
  }

  /** Cleanly close the WebSocket connection. */
  disconnect(): void {
    this._intentionalClose = true;
    this._clearReconnectTimer();
    this._ws?.close();
    this._ws = null;
    this._setState('DISCONNECTED');
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this._connectionListeners.add(listener);
    return () => this._connectionListeners.delete(listener);
  }

  private _doConnect(): void {
    this._setState('CONNECTING');
    const url = `ws://${KernelConfig.KERNEL_HOST}:${KernelConfig.WS_TELEMETRY_PORT}`;

    try {
      const ws = new WebSocket(url);
      this._ws = ws;

      ws.onopen = () => {
        this._setState('CONNECTED');
        console.log(`[KernelSocket] Connected to ${url}`);
        this._sendSubscribe();
      };

      ws.onmessage = (event) => {
        this._onMessage(event.data as string);
      };

      ws.onclose = () => {
        this._ws = null;
        if (!this._intentionalClose) {
          this._setState('ERROR');
          console.log(`[KernelSocket] Disconnected — retrying in ${KernelConfig.RECONNECT_DELAY_MS}ms`);
          this._scheduleReconnect();
        } else {
          this._setState('DISCONNECTED');
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, handle reconnect there
        console.log(`[KernelSocket] Connection error — falling back to simulation`);
      };
    } catch {
      this._setState('ERROR');
      this._scheduleReconnect();
    }
  }

  private _sendSubscribe(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

    const msg: WsSubscribeMessage = {
      type: 'SUBSCRIBE',
      filters: {
        robotIds: 'ALL',
        minIntervalMs: KernelConfig.SUBSCRIBE_INTERVAL_MS,
        fields: ['battery', 'pose', 'cpuTemp', 'connectionState', 'jointStates'],
      },
      clientId: this._clientId,
    };
    this._ws.send(JSON.stringify(msg));
  }

  private _onMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as { type: string };

      if (msg.type === 'TELEMETRY_BATCH') {
        const batch = msg as WsTelemetryBatch;
        const { updateTelemetry, setKernelConnected } = useMissionStore.getState();
        setKernelConnected(true);
        batch.packets.forEach((packet) => updateTelemetry(packet.robotId, packet));
        return;
      }

      if (msg.type === 'ESTOP_ACK') {
        const ack = msg as WsEstopAck;
        console.log(`[KernelSocket] E-Stop ACK: ${ack.robotId} — ${ack.latencyMs}ms`);
        return;
      }

      if (msg.type === 'AGENT_EVENT') {
        const event = msg as WsAgentEvent;
        this._handleAgentEvent(event);
        // Surface WARNING + CRITICAL events to the mobile store for UI display
        if (event.severity !== 'INFO') {
          useMissionStore.getState().addAgentAlert(event);
        }
        return;
      }

      if (msg.type === 'SUBSCRIBED') {
        console.log(`[KernelSocket] Subscription confirmed`);
        return;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private _handleAgentEvent(event: WsAgentEvent): void {
    // Log anomalies and deconfliction alerts
    if (event.eventKind === 'ANOMALY_DETECTED') {
      const p = event.payload as { robotId?: string; message?: string };
      console.log(`[KernelSocket] ANOMALY [${event.severity}] ${p.robotId}: ${p.message}`);
      return;
    }

    if (event.eventKind === 'ANOMALY_CLEARED') {
      const p = event.payload as { robotId?: string; ruleId?: string };
      console.log(`[KernelSocket] ANOMALY CLEARED — ${p.robotId}: ${p.ruleId}`);
      return;
    }

    if (event.eventKind === 'DECONFLICT_ALERT') {
      const p = event.payload as { zoneName?: string; robotIds?: string[] };
      console.warn(`[KernelSocket] DECONFLICT: ${p.robotIds?.join(', ')} in "${p.zoneName}"`);
      return;
    }

    if (event.eventKind === 'REPLAN_TRIGGERED') {
      const p = event.payload as { message?: string };
      console.log(`[KernelSocket] REPLAN: ${p.message}`);
      return;
    }

    if (event.eventKind === 'PLAN_PROGRESS') {
      const p = event.payload as {
        planningId?: string;
        phase?: string;
        missionId?: string;
        message?: string;
        tasksAdded?: number;
        task?: { id: string; robotId: string; command: string; status: string; createdAt: number };
      };

      console.log(`[KernelSocket] PLAN [${p.phase}] ${p.message}`);

      // Set missionId as soon as it's known
      if (p.phase === 'MISSION_CREATED' && p.missionId) {
        useMissionStore.getState().setCurrentMissionId(p.missionId);
        useMissionStore.getState().setMissionStatus('PLANNING');
      }

      // Add each task to the store live as the AI generates it
      if (p.phase === 'TASK_ADDED' && p.task) {
        const { id, robotId, command, status, createdAt } = p.task;
        useMissionStore.getState().addTask({
          id,
          robotId,
          command,
          status: status as 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED',
          createdAt,
        });
      }
      return;
    }

    if (event.eventKind === 'PLAN_COMPLETE') {
      const p = event.payload as { missionId?: string; totalTasks?: number; summary?: string };
      console.log(`[KernelSocket] PLAN COMPLETE — ${p.totalTasks} tasks, mission=${p.missionId}`);
      if (p.missionId) {
        useMissionStore.getState().setCurrentMissionId(p.missionId);
        useMissionStore.getState().setMissionStatus('DEPLOYING');
      }
      return;
    }

    if (event.eventKind === 'PLAN_ERROR') {
      const p = event.payload as { error?: string };
      console.error(`[KernelSocket] PLAN ERROR: ${p.error}`);
      useMissionStore.getState().setMissionStatus('IDLE');
      return;
    }

    // MissionDispatcher broadcasts WORKFLOW_STAGE_CHANGE when task status changes
    if (event.agentId === 'MISSION_DISPATCHER' && event.eventKind === 'WORKFLOW_STAGE_CHANGE') {
      const payload = event.payload as {
        taskId?: string;
        newStatus?: string;
        missionId?: string;
        status?: string; // mission-level status change
      };

      if (payload.taskId && payload.newStatus) {
        useMissionStore.getState().updateTaskStatus(
          payload.taskId,
          payload.newStatus as 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED'
        );
      }

      // Mission completed/aborted — update mission status
      if (payload.status && !payload.taskId) {
        const status = payload.status as 'IDLE' | 'PLANNING' | 'DEPLOYING' | 'ACTIVE' | 'COMPLETED' | 'EMERGENCY';
        useMissionStore.getState().setMissionStatus(status);
      }
    }
  }

  private _scheduleReconnect(): void {
    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(() => {
      if (!this._intentionalClose) this._doConnect();
    }, KernelConfig.RECONNECT_DELAY_MS);
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _setState(state: KernelConnectionState): void {
    this._state = state;
    useMissionStore.getState().setKernelConnected(state === 'CONNECTED');
    this._connectionListeners.forEach((fn) => fn(state));
  }
}

/** Singleton — import and call .connect() once at app start */
export const kernelSocket = new KernelSocketServiceImpl();
