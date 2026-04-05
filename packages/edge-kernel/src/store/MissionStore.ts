/**
 * MissionStore — In-memory CRUD for missions and tasks.
 * Persists to data/missions.json so state survives kernel restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Mission, MissionTask, MissionStatus, TaskStatus } from '../../../shared-types/src';

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'missions.json');

export class MissionStore {
  private _missions: Map<string, Mission> = new Map();

  constructor() {
    this._ensureDataDir();
    this._loadFromDisk();
  }

  // ─── Missions ───

  create(input: {
    name: string;
    source: Mission['source'];
    priority: Mission['priority'];
    naturalLanguageInput?: string;
    deadline?: number;
  }): Mission {
    const mission: Mission = {
      id: uuidv4(),
      name: input.name,
      status: 'IDLE',
      source: input.source,
      priority: input.priority,
      createdAt: Date.now(),
      naturalLanguageInput: input.naturalLanguageInput,
      deadline: input.deadline,
      tasks: [],
    };
    this._missions.set(mission.id, mission);
    this._saveToDisk();
    return mission;
  }

  get(id: string): Mission | undefined {
    return this._missions.get(id);
  }

  getAll(filter?: { status?: MissionStatus }): Mission[] {
    const all = Array.from(this._missions.values());
    if (!filter?.status) return all;
    return all.filter((m) => m.status === filter.status);
  }

  updateStatus(id: string, status: MissionStatus): Mission | null {
    const mission = this._missions.get(id);
    if (!mission) return null;
    mission.status = status;
    if (status === 'ACTIVE') mission.dispatchedAt = Date.now();
    this._saveToDisk();
    return mission;
  }

  delete(id: string): boolean {
    const deleted = this._missions.delete(id);
    if (deleted) this._saveToDisk();
    return deleted;
  }

  // ─── Tasks ───

  addTask(missionId: string, input: Omit<MissionTask, 'id' | 'createdAt' | 'status'>): MissionTask | null {
    const mission = this._missions.get(missionId);
    if (!mission) return null;

    const task: MissionTask = {
      id: uuidv4(),
      ...input,
      status: 'QUEUED',
      createdAt: Date.now(),
    };
    mission.tasks.push(task);
    this._saveToDisk();
    return task;
  }

  addTasks(missionId: string, inputs: Omit<MissionTask, 'id' | 'createdAt' | 'status'>[]): MissionTask[] {
    const mission = this._missions.get(missionId);
    if (!mission) return [];

    const created: MissionTask[] = inputs.map((input) => ({
      id: uuidv4(),
      ...input,
      status: 'QUEUED' as TaskStatus,
      createdAt: Date.now(),
    }));
    mission.tasks.push(...created);
    this._saveToDisk();
    return created;
  }

  updateTaskRobot(missionId: string, taskId: string, newRobotId: string): boolean {
    const mission = this._missions.get(missionId);
    if (!mission) return false;
    const task = mission.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    task.robotId = newRobotId;
    this._saveToDisk();
    return true;
  }

  updateTaskStatus(missionId: string, taskId: string, status: TaskStatus): MissionTask | null {
    const mission = this._missions.get(missionId);
    if (!mission) return null;

    const task = mission.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.status = status;
    this._saveToDisk();
    return task;
  }

  // ─── Persistence ───

  private _ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private _loadFromDisk(): void {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const missions: Mission[] = JSON.parse(raw);
      missions.forEach((m) => this._missions.set(m.id, m));
      console.log(`[MissionStore] Loaded ${missions.length} missions from disk`);
    } catch (err) {
      console.warn(`[MissionStore] Failed to load from disk:`, err);
    }
  }

  private _saveToDisk(): void {
    try {
      const missions = Array.from(this._missions.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(missions, null, 2));
    } catch (err) {
      console.warn(`[MissionStore] Failed to save to disk:`, err);
    }
  }
}
