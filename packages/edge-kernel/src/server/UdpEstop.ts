/**
 * UdpEstop — UDP E-Stop receiver on port 7400.
 *
 * Phase 3A: Receives E-Stop commands, logs them, broadcasts ACK via WebSocket.
 * Phase 3B+: Relays commands to robot adapters per their native protocol.
 *
 * Protocol: JSON over UDP (Phase 3A). Binary msgpack + HMAC in Phase 3B.
 */

import * as dgram from 'dgram';
import type { WsEstopAck } from '../../../shared-types/src';

export type EstopCallback = (robotId: string | 'ALL', ack: WsEstopAck) => void;

export class UdpEstop {
  private _socket: dgram.Socket;
  private _callback: EstopCallback | null = null;

  constructor(port: number) {
    this._socket = dgram.createSocket('udp4');

    this._socket.on('message', (msg, rinfo) => {
      this._onMessage(msg, rinfo.address);
    });

    this._socket.on('error', (err) => {
      console.error(`[UdpEstop] Socket error:`, err.message);
    });

    this._socket.bind(port, () => {
      console.log(`[UdpEstop] Listening on udp://0.0.0.0:${port}`);
    });
  }

  onEstop(fn: EstopCallback): void {
    this._callback = fn;
  }

  close(): void {
    this._socket.close();
  }

  private _onMessage(msg: Buffer, fromAddress: string): void {
    const receivedAt = Date.now();

    try {
      const data = JSON.parse(msg.toString()) as {
        command: 'FLEET_ESTOP' | 'ROBOT_ESTOP' | 'ESTOP_CLEAR';
        robotId?: string;
        issuedAt?: number;
        issuedBy?: string;
      };

      const robotId = data.robotId ?? 'ALL';
      const issuedAt = data.issuedAt ?? receivedAt;

      console.log(`[UdpEstop] ${data.command} for ${robotId} from ${fromAddress} — latency: ${receivedAt - issuedAt}ms`);

      // Phase 3A: Log only. Phase 3B: relay to adapters.
      const ack: WsEstopAck = {
        type: 'ESTOP_ACK',
        robotId,
        issuedAt,
        acknowledgedAt: receivedAt,
        latencyMs: receivedAt - issuedAt,
        success: true,
      };

      this._callback?.(robotId, ack);
    } catch {
      console.warn(`[UdpEstop] Malformed message from ${fromAddress}`);
    }
  }
}
