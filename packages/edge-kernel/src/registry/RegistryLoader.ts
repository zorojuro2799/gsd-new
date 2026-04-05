/**
 * RegistryLoader — Loads ROBOT_REGISTRY.json from the repo root.
 * The registry is the single source of truth for all 30 robots.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RobotEntry, RobotRegistry } from '../../../shared-types/src';

const REGISTRY_PATH = path.resolve(__dirname, '../../../../ROBOT_REGISTRY.json');

export class RegistryLoader {
  private static _robots: RobotEntry[] = [];

  static load(): RobotEntry[] {
    if (this._robots.length > 0) return this._robots;

    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const registry = JSON.parse(raw) as RobotRegistry;

    const valid: RobotEntry[] = [];
    for (const robot of registry.robots) {
      if (!robot.id || !robot.model || !robot.middleware?.protocol) {
        console.warn(`[Registry] Skipping invalid entry: ${JSON.stringify(robot)}`);
        continue;
      }
      valid.push(robot);
    }

    this._robots = valid;
    console.log(`[Registry] Loaded ${valid.length} robots (v${registry.version})`);
    return this._robots;
  }

  static getById(id: string): RobotEntry | undefined {
    return this._robots.find((r) => r.id === id);
  }

  static getAll(): RobotEntry[] {
    return this._robots;
  }
}
