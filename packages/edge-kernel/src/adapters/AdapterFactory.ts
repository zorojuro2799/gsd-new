/**
 * AdapterFactory — Creates and caches protocol adapter instances.
 * Mirrors HardwareFactory from src/drivers/index.ts, but server-side.
 *
 * Phase 3A: Always returns SimulatedAdapter.
 * Phase 3B+: Returns real protocol adapters based on robot config.
 */

import type { RobotEntry } from '../../../shared-types/src';
import type { IProtocolAdapter } from './types';
import { SimulatedAdapter } from './SimulatedAdapter';

export class AdapterFactory {
  private static _cache = new Map<string, IProtocolAdapter>();

  static create(config: RobotEntry): IProtocolAdapter {
    const cached = this._cache.get(config.id);
    if (cached) return cached;

    // Phase 3A: Always use simulated adapter
    // Phase 3B+: Switch on protocol for real adapters
    const adapter = new SimulatedAdapter(config);

    this._cache.set(config.id, adapter);
    return adapter;
  }

  static get(robotId: string): IProtocolAdapter | undefined {
    return this._cache.get(robotId);
  }

  static getAll(): IProtocolAdapter[] {
    return Array.from(this._cache.values());
  }

  static clear(): void {
    this._cache.clear();
  }
}
