/**
 * KernelConfig — Edge Kernel connection settings.
 *
 * DEVELOPMENT: Run edge-kernel on your Mac, set KERNEL_HOST to your Mac's LAN IP.
 * The Expo app on your phone/simulator connects to this address.
 *
 * PRODUCTION: Set KERNEL_HOST to the intranet facility server IP.
 *
 * Set USE_KERNEL = false to fall back to in-app simulation (Phase 2 behavior).
 */

export const KernelConfig = {
  /**
   * Enable real kernel connection.
   * false = use in-app simulation (existing Phase 2 behavior).
   * true  = connect to Edge Kernel via WebSocket.
   */
  USE_KERNEL: false,

  /**
   * IP or hostname of the machine running `packages/edge-kernel`.
   * For Expo Go on device: use your Mac's LAN IP (e.g. '192.168.1.42').
   * For iOS simulator: 'localhost' works.
   * For Android emulator: '10.0.2.2' maps to host machine.
   */
  KERNEL_HOST: 'localhost',

  /** WebSocket telemetry port (must match edge-kernel PORTS.WS_TELEMETRY) */
  WS_TELEMETRY_PORT: 7401,

  /** HTTP REST port (must match edge-kernel PORTS.HTTP_REST) */
  HTTP_REST_PORT: 7402,

  /** WebSocket agent events port */
  WS_EVENTS_PORT: 7403,

  /** UDP E-Stop port */
  UDP_ESTOP_PORT: 7400,

  /** Reconnect delay in ms after WebSocket disconnect */
  RECONNECT_DELAY_MS: 3000,

  /** Telemetry subscription interval — how often server sends batches to this client */
  SUBSCRIBE_INTERVAL_MS: 1000,
} as const;
