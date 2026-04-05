/**
 * HttpServer — REST API on port 7402.
 *
 * Phase 3A routes: /health, /fleet/*
 * Phase 3B routes: /missions/* (CRUD + dispatch/pause/abort)
 */

import express, { Request, Response } from 'express';
import type { KernelHealth, MissionStatus, TaskStatus } from '../../../shared-types/src';
import type { FleetStateAggregator } from '../agents/FleetStateAggregator';
import type { MissionStore } from '../store/MissionStore';
import type { MissionDispatcherAgent } from '../agents/MissionDispatcherAgent';
import type { PlannerAgent } from '../agents/PlannerAgent';

const API_VERSION = '0.1.0';

export function createHttpServer(opts: {
  port: number;
  fleetState: FleetStateAggregator;
  missionStore: MissionStore;
  dispatcher: MissionDispatcherAgent;
  planner: PlannerAgent;
  getAgentStatuses: () => KernelHealth['agents'];
  getUptime: () => number;
}): { listen: () => void; close: () => void } {
  const { port, fleetState, missionStore, dispatcher, planner, getAgentStatuses, getUptime } = opts;

  const app = express();
  app.use(express.json());

  // CORS for local dev
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // ─── Health ───

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'OK',
      uptime: getUptime(),
      robotsLoaded: fleetState.getAllRobots().length,
      agents: getAgentStatuses(),
      version: API_VERSION,
    } satisfies KernelHealth);
  });

  // ─── Fleet (Phase 3A) ───

  app.get('/api/v1/fleet/state', (_req: Request, res: Response) => {
    res.json(fleetState.getFleetState());
  });

  app.get('/api/v1/fleet/robots', (_req: Request, res: Response) => {
    res.json(
      fleetState.getAllRobots().map((e) => ({
        ...e.config,
        connectionState: e.telemetry.connectionState,
        battery: e.telemetry.battery,
        lastUpdate: e.telemetry.serverTimestamp,
      }))
    );
  });

  app.get('/api/v1/fleet/robots/:id', (req: Request, res: Response) => {
    const entry = fleetState.getRobotEntry(req.params['id'] as string);
    if (!entry) { res.status(404).json({ error: `Robot not found` }); return; }
    res.json(entry);
  });

  app.get('/api/v1/fleet/stats', (_req: Request, res: Response) => {
    res.json(fleetState.getStats());
  });

  // ─── Missions (Phase 3B) ───

  /** Create a new mission */
  app.post('/api/v1/missions', (req: Request, res: Response) => {
    const { name, source = 'MANUAL', priority = 'NORMAL', naturalLanguageInput, deadline, tasks } = req.body as {
      name: string;
      source?: 'MANUAL' | 'AI_GENERATED';
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      naturalLanguageInput?: string;
      deadline?: number;
      tasks?: Array<{ robotId: string; command: string }>;
    };

    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    const mission = missionStore.create({ name, source, priority, naturalLanguageInput, deadline });

    // Bulk-create tasks if provided
    if (tasks?.length) {
      missionStore.addTasks(
        mission.id,
        tasks.map((t) => ({ robotId: t.robotId, command: t.command }))
      );
    }

    res.status(201).json(missionStore.get(mission.id));
  });

  /** List missions (optional ?status= filter) */
  app.get('/api/v1/missions', (req: Request, res: Response) => {
    const status = req.query['status'] as MissionStatus | undefined;
    res.json(missionStore.getAll(status ? { status } : undefined));
  });

  /** Get a single mission with all tasks */
  app.get('/api/v1/missions/:id', (req: Request, res: Response) => {
    const mission = missionStore.get(req.params['id'] as string);
    if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
    res.json(mission);
  });

  /** Update mission status/name */
  app.patch('/api/v1/missions/:id', (req: Request, res: Response) => {
    const { status } = req.body as { status?: MissionStatus };
    const missionId = req.params['id'] as string;

    if (status) {
      const updated = missionStore.updateStatus(missionId, status);
      if (!updated) { res.status(404).json({ error: 'Mission not found' }); return; }
      res.json(updated);
      return;
    }
    res.status(400).json({ error: 'No updatable fields provided' });
  });

  /** Delete a mission */
  app.delete('/api/v1/missions/:id', (req: Request, res: Response) => {
    const deleted = missionStore.delete(req.params['id'] as string);
    if (!deleted) { res.status(404).json({ error: 'Mission not found' }); return; }
    res.json({ ok: true });
  });

  // ─── Mission Actions ───

  /** Dispatch mission — begin DAG execution */
  app.post('/api/v1/missions/:id/dispatch', async (req: Request, res: Response) => {
    const missionId = req.params['id'] as string;
    const mission = missionStore.get(missionId);
    if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
    if (mission.tasks.length === 0) { res.status(400).json({ error: 'Mission has no tasks' }); return; }

    const ok = await dispatcher.dispatch(missionId);
    if (!ok) { res.status(409).json({ error: 'Mission already active or could not dispatch' }); return; }

    res.json({ ok: true, missionId, taskCount: mission.tasks.length });
  });

  /** Pause an active mission */
  app.post('/api/v1/missions/:id/pause', (req: Request, res: Response) => {
    const ok = dispatcher.pause(req.params['id'] as string);
    if (!ok) { res.status(404).json({ error: 'Mission not active' }); return; }
    res.json({ ok: true });
  });

  /** Abort a mission (marks remaining tasks FAILED) */
  app.post('/api/v1/missions/:id/abort', (req: Request, res: Response) => {
    const ok = dispatcher.abort(req.params['id'] as string);
    if (!ok) { res.status(404).json({ error: 'Mission not found' }); return; }
    res.json({ ok: true });
  });

  // ─── Tasks ───

  /** Add a task to a mission */
  app.post('/api/v1/missions/:id/tasks', (req: Request, res: Response) => {
    const { robotId, command } = req.body as { robotId: string; command: string };
    if (!robotId || !command) { res.status(400).json({ error: 'robotId and command are required' }); return; }

    const task = missionStore.addTask(req.params['id'] as string, { robotId, command });
    if (!task) { res.status(404).json({ error: 'Mission not found' }); return; }
    res.status(201).json(task);
  });

  /** Update a task's status */
  app.patch('/api/v1/missions/:id/tasks/:taskId', (req: Request, res: Response) => {
    const { status } = req.body as { status?: TaskStatus };
    if (!status) { res.status(400).json({ error: 'status is required' }); return; }

    const task = missionStore.updateTaskStatus(
      req.params['id'] as string,
      req.params['taskId'] as string,
      status
    );
    if (!task) { res.status(404).json({ error: 'Mission or task not found' }); return; }
    res.json(task);
  });

  // ─── AI Planner (Phase 3D) ───

  /**
   * POST /api/v1/plan/mission
   * Start async AI mission planning. Returns immediately with a planningId.
   * Progress arrives via WebSocket AGENT_EVENT { agentId: 'AI_PLANNER' } events.
   * On PLAN_COMPLETE the payload includes missionId for dispatch.
   */
  app.post('/api/v1/plan/mission', (req: Request, res: Response) => {
    const { naturalLanguage, constraints } = req.body as {
      naturalLanguage: string;
      constraints?: { priority?: string; allowedRobotIds?: string[] };
    };

    if (!naturalLanguage?.trim()) {
      res.status(400).json({ error: 'naturalLanguage is required' });
      return;
    }

    if (!planner.isReady) {
      res.status(503).json({
        error: 'AI Planner not available',
        hint: 'Set ANTHROPIC_API_KEY environment variable and restart the kernel',
      });
      return;
    }

    const planningId = `plan-${Date.now()}`;

    planner.planAsync({
      planningId,
      naturalLanguage: naturalLanguage.trim(),
      constraints: constraints as { priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; allowedRobotIds?: string[] } | undefined,
    });

    res.json({ planningId, status: 'PLANNING', message: 'Mission planning started — watch WebSocket for progress' });
  });

  // ─── Fallback ───
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    listen: () => {
      server = app.listen(port, () => {
        console.log(`[HttpServer] REST API on http://0.0.0.0:${port}/api/v1`);
      });
    },
    close: () => server?.close(),
  };
}
