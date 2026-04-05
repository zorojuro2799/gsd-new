/**
 * WsServer — WebSocket server on port 7401.
 * Handles telemetry subscriptions and broadcasts from TelemetryAgent.
 *
 * Port 7403 reuses the same class with a different port for agent events.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { WsSubscribeMessage, WsTelemetryBatch, WsServerMessage } from '../../../shared-types/src';

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  filters: WsSubscribeMessage['filters'];
  lastSentAt: number;
}

export class WsServer {
  private _wss: WebSocketServer;
  private _clients = new Map<string, ConnectedClient>();

  constructor(port: number, label: string) {
    this._wss = new WebSocketServer({ port });
    this._wss.on('connection', (ws) => this._onConnection(ws));
    console.log(`[WsServer:${label}] Listening on ws://0.0.0.0:${port}`);
  }

  /** Broadcast a telemetry batch to all subscribed clients */
  broadcast(batch: WsTelemetryBatch): void {
    const now = Date.now();
    const payload = JSON.stringify(batch);

    this._clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;

      // Respect client's requested minimum interval
      const elapsed = now - client.lastSentAt;
      if (elapsed < client.filters.minIntervalMs) return;

      client.lastSentAt = now;
      client.ws.send(payload);
    });
  }

  /** Send a message to a specific client */
  sendToClient(clientId: string, msg: WsServerMessage): void {
    const client = this._clients.get(clientId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  /** Broadcast agent event to all clients */
  broadcastEvent(msg: WsServerMessage): void {
    const payload = JSON.stringify(msg);
    this._clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    });
  }

  getClientCount(): number {
    return this._clients.size;
  }

  close(): void {
    this._wss.close();
  }

  private _onConnection(ws: WebSocket): void {
    let registeredClientId: string | null = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsSubscribeMessage;

        if (msg.type === 'SUBSCRIBE') {
          const clientId = msg.clientId ?? `client-${Date.now()}`;
          registeredClientId = clientId;

          // Defaults: all robots, 1s interval, all fields
          const filters: WsSubscribeMessage['filters'] = {
            robotIds: msg.filters?.robotIds ?? 'ALL',
            minIntervalMs: Math.max(33, msg.filters?.minIntervalMs ?? 1000),
            fields: msg.filters?.fields ?? ['battery', 'pose', 'cpuTemp', 'connectionState'],
          };

          this._clients.set(clientId, { ws, clientId, filters, lastSentAt: 0 });
          console.log(`[WsServer] Client connected: ${clientId} (${this._clients.size} total)`);

          // Acknowledge subscription
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', clientId, filters }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (registeredClientId) {
        this._clients.delete(registeredClientId);
        console.log(`[WsServer] Client disconnected: ${registeredClientId} (${this._clients.size} remaining)`);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WsServer] Client error:`, err.message);
    });
  }
}
