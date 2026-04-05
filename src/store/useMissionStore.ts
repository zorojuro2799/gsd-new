/**
 * Aegis Fleet Orchestrator — Mission Store
 * 
 * Global state via Zustand with AsyncStorage persistence.
 * Provides "Resume on Crash" — mission state survives app restarts.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RobotEntry, MissionStatus, MissionTask, TelemetryPacket, WsAgentEvent } from '../types';

// ─────────── State Shape ───────────

interface MissionState {
  // Fleet
  robots: RobotEntry[];
  telemetry: Record<string, TelemetryPacket>;

  // Mission
  missionStatus: MissionStatus;
  missionTasks: MissionTask[];

  // Hydration flag
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  // Kernel connection state (Phase 3A)
  kernelConnected: boolean;
  setKernelConnected: (connected: boolean) => void;

  // Kernel mission tracking (Phase 3B)
  // The ID the kernel assigned to the current mission (null = local-only or no mission)
  currentMissionId: string | null;
  setCurrentMissionId: (id: string | null) => void;

  // Agent alerts (Phase 3C) — last 50 CRITICAL/WARNING events from the kernel
  agentAlerts: WsAgentEvent[];
  addAgentAlert: (event: WsAgentEvent) => void;
  clearAgentAlerts: () => void;

  // Fleet actions
  loadRobots: (robots: RobotEntry[]) => void;
  addRobot: (robot: RobotEntry) => void;
  removeRobot: (robotId: string) => void;
  updateTelemetry: (robotId: string, packet: TelemetryPacket) => void;

  // Mission actions
  setMissionStatus: (status: MissionStatus) => void;
  addTask: (task: MissionTask) => void;
  updateTaskStatus: (taskId: string, status: MissionTask['status']) => void;

  // Mission reset
  clearMissions: () => void;

  // Emergency
  triggerGlobalEstop: () => void;
  clearEstop: () => void;
}

// ─────────── Store ───────────

export const useMissionStore = create<MissionState>()(
  persist(
    (set) => ({
      robots: [],
      telemetry: {},
      missionStatus: 'IDLE',
      missionTasks: [],
      _hasHydrated: false,
      kernelConnected: false,
      currentMissionId: null,
      agentAlerts: [],

      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setKernelConnected: (connected) => set({ kernelConnected: connected }),
      setCurrentMissionId: (id) => set({ currentMissionId: id }),

      addAgentAlert: (event) =>
        set((state) => ({
          // Keep last 50 alerts, newest first
          agentAlerts: [event, ...state.agentAlerts].slice(0, 50),
        })),

      clearAgentAlerts: () => set({ agentAlerts: [] }),

      loadRobots: (robots) => set({ robots }),

      addRobot: (robot) =>
        set((state) => {
          if (state.robots.some((r) => r.id === robot.id)) return state;
          return { robots: [...state.robots, robot] };
        }),

      removeRobot: (robotId) =>
        set((state) => ({
          robots: state.robots.filter((r) => r.id !== robotId),
        })),

      updateTelemetry: (robotId, packet) =>
        set((state) => ({
          telemetry: { ...state.telemetry, [robotId]: packet },
        })),

      setMissionStatus: (status) => set({ missionStatus: status }),

      addTask: (task) =>
        set((state) => ({
          missionTasks: [...state.missionTasks, task],
        })),

      updateTaskStatus: (taskId, status) =>
        set((state) => ({
          missionTasks: state.missionTasks.map((t) =>
            t.id === taskId ? { ...t, status } : t
          ),
        })),

      clearMissions: () => set({ missionTasks: [], missionStatus: 'IDLE' }),

      triggerGlobalEstop: () => set({ missionStatus: 'EMERGENCY' }),
      clearEstop: () => set({ missionStatus: 'IDLE' }),
    }),
    {
      name: 'aegis-mission-state',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist fleet config and mission state, NOT live telemetry
      partialize: (state) => ({
        robots: state.robots,
        missionStatus: state.missionStatus,
        missionTasks: state.missionTasks,
        currentMissionId: state.currentMissionId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
