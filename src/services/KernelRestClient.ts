/**
 * KernelRestClient — HTTP client for Edge Kernel REST API.
 * Handles mission CRUD, fleet queries, and action endpoints.
 */

import { KernelConfig } from './KernelConfig';
import type { Mission, MissionTask, FleetState, FleetStats, KernelHealth, TaskStatus } from '../../packages/shared-types/src';

class KernelRestClientImpl {
  private get _base(): string {
    return `http://${KernelConfig.KERNEL_HOST}:${KernelConfig.HTTP_REST_PORT}/api/v1`;
  }

  private async _fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this._base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(`[KernelRest] ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body.error ?? res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Health ───

  async getHealth(): Promise<KernelHealth> {
    return this._fetch<KernelHealth>('/health'.replace('/api/v1', ''));
  }

  async isReachable(): Promise<boolean> {
    try {
      const base = `http://${KernelConfig.KERNEL_HOST}:${KernelConfig.HTTP_REST_PORT}`;
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Fleet ───

  async getFleetState(): Promise<FleetState> {
    return this._fetch<FleetState>('/fleet/state');
  }

  async getFleetStats(): Promise<FleetStats> {
    return this._fetch<FleetStats>('/fleet/stats');
  }

  // ─── Missions ───

  async createMission(input: {
    name: string;
    source?: Mission['source'];
    priority?: Mission['priority'];
    tasks?: Array<{ robotId: string; command: string }>;
    naturalLanguageInput?: string;
  }): Promise<Mission> {
    return this._fetch<Mission>('/missions', {
      method: 'POST',
      body: JSON.stringify({ source: 'MANUAL', priority: 'NORMAL', ...input }),
    });
  }

  async getMissions(status?: Mission['status']): Promise<Mission[]> {
    const qs = status ? `?status=${status}` : '';
    return this._fetch<Mission[]>(`/missions${qs}`);
  }

  async getMission(id: string): Promise<Mission> {
    return this._fetch<Mission>(`/missions/${id}`);
  }

  async updateMission(id: string, data: { status?: Mission['status'] }): Promise<Mission> {
    return this._fetch<Mission>(`/missions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMission(id: string): Promise<void> {
    await this._fetch<{ ok: boolean }>(`/missions/${id}`, { method: 'DELETE' });
  }

  async dispatchMission(id: string): Promise<{ ok: boolean; missionId: string; taskCount: number }> {
    return this._fetch(`/missions/${id}/dispatch`, { method: 'POST' });
  }

  async pauseMission(id: string): Promise<void> {
    await this._fetch(`/missions/${id}/pause`, { method: 'POST' });
  }

  async abortMission(id: string): Promise<void> {
    await this._fetch(`/missions/${id}/abort`, { method: 'POST' });
  }

  // ─── Tasks ───

  async addTask(missionId: string, task: { robotId: string; command: string }): Promise<MissionTask> {
    return this._fetch<MissionTask>(`/missions/${missionId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(missionId: string, taskId: string, status: TaskStatus): Promise<MissionTask> {
    return this._fetch<MissionTask>(`/missions/${missionId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // ─── AI Planner (Phase 3D) ───

  async planMission(input: {
    naturalLanguage: string;
    constraints?: { priority?: Mission['priority']; allowedRobotIds?: string[] };
  }): Promise<{ planningId: string; status: 'PLANNING'; message: string }> {
    return this._fetch('/plan/mission', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

export const kernelRestClient = new KernelRestClientImpl();
