import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMissionStore } from '../store/useMissionStore';
import { kernelRestClient } from '../services/KernelRestClient';
import { KernelConfig } from '../services/KernelConfig';
import type { MissionTask, MissionStatus } from '../types';
import { C } from '../theme';

// ─────────── Mission Templates ───────────

const MISSION_TEMPLATES = [
  { robotPrefix: 'quad-spot', command: 'Scout Zone A — Autonomous patrol with 3D LiDAR mapping' },
  { robotPrefix: 'hum-optimus', command: 'Perform maintenance — Inspect panel B7, torque check' },
  { robotPrefix: 'aer-matrice', command: 'Aerial survey — Grid flight pattern Zone C, RTK enabled' },
  { robotPrefix: 'amr-otto', command: 'Logistics run — Deliver payload Bay 3 → Bay 7' },
  { robotPrefix: 'quad-anymal', command: 'Thermal inspection — Pipe corridor sweep, IR mode' },
];

const STATUS_CYCLE: MissionStatus[] = ['IDLE', 'PLANNING', 'DEPLOYING', 'ACTIVE'];

// ─────────── Mission Progress Bar ───────────

function MissionProgressBar({ completed, total }: { completed: number; total: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pct = total > 0 ? completed / total : 0;
    Animated.timing(anim, { toValue: pct, duration: 400, useNativeDriver: false }).start();
  }, [completed, total, anim]);

  return (
    <View style={pb.track}>
      <Animated.View
        style={[
          pb.fill,
          { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 3, backgroundColor: C.border, width: '100%' },
  fill: { height: 3, backgroundColor: C.online },
});

// ─────────── Task Status Badge ───────────

const TASK_STATUS_BG: Record<MissionTask['status'], string> = {
  QUEUED: '#F8FAFC',
  EXECUTING: '#FFFBEB',
  COMPLETED: '#F0FDF4',
  FAILED: '#FEF2F2',
};

const TASK_STATUS_LABEL: Record<MissionTask['status'], string> = {
  QUEUED: 'Queued',
  EXECUTING: 'Executing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

// ─────────── Task Node ───────────

function TaskNode({
  task,
  index,
  isLast,
  missionId,
}: {
  task: MissionTask;
  index: number;
  isLast: boolean;
  missionId: string | null;
}) {
  const updateTaskStatus = useMissionStore((s) => s.updateTaskStatus);
  const kernelConnected = useMissionStore((s) => s.kernelConnected);
  const dotAnim = useRef(new Animated.Value(1)).current;
  const statusColor = C.taskStatus[task.status];

  const handlePress = useCallback(() => {
    const transitions: Record<MissionTask['status'], MissionTask['status']> = {
      QUEUED: 'EXECUTING',
      EXECUTING: 'COMPLETED',
      COMPLETED: 'QUEUED',
      FAILED: 'QUEUED',
    };
    const newStatus = transitions[task.status];

    Animated.sequence([
      Animated.timing(dotAnim, { toValue: 0, duration: 75, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 1, duration: 75, useNativeDriver: true }),
    ]).start();

    // Update local store immediately
    updateTaskStatus(task.id, newStatus);

    // Sync to kernel if connected
    if (KernelConfig.USE_KERNEL && kernelConnected && missionId) {
      kernelRestClient.updateTask(missionId, task.id, newStatus).catch((err: unknown) => {
        console.warn('[Planner] Task sync error:', err);
      });
    }
  }, [task.id, task.status, updateTaskStatus, dotAnim, missionId, kernelConnected]);

  const seqNum = `T${String(index + 1).padStart(2, '0')}`;
  const ts = new Date(task.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <View style={tn.container}>
      <View style={tn.spine}>
        <Animated.View style={[tn.dot, { backgroundColor: statusColor, opacity: dotAnim }]} />
        {!isLast && <View style={tn.line} />}
      </View>
      <TouchableOpacity style={tn.card} onPress={handlePress} activeOpacity={0.7}>
        <View style={tn.cardHeader}>
          <Text style={tn.seqNum}>{seqNum}</Text>
          <Text style={tn.robotId} numberOfLines={1}>{task.robotId}</Text>
          <View style={[tn.badge, { backgroundColor: TASK_STATUS_BG[task.status] }]}>
            <Text style={[tn.badgeText, { color: statusColor }]}>
              {TASK_STATUS_LABEL[task.status]}
            </Text>
          </View>
        </View>
        <Text style={tn.command}>{task.command}</Text>
        <Text style={tn.timestamp}>{ts}</Text>
      </TouchableOpacity>
    </View>
  );
}

const tn = StyleSheet.create({
  container: { flexDirection: 'row', minHeight: 64 },
  spine: { width: 24, alignItems: 'center', paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 1, flex: 1, backgroundColor: C.border, marginVertical: 3 },
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
    marginLeft: 4,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seqNum: { fontSize: 12, fontFamily: 'monospace', color: C.textMuted, flexShrink: 0 },
  robotId: { fontSize: 12, fontFamily: 'monospace', fontWeight: '500', color: C.textSec, flex: 1 },
  badge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '500' },
  command: { fontSize: 13, color: C.text, lineHeight: 19 },
  timestamp: { fontSize: 11, color: C.textMuted },
});

// ─────────── Planner Header ───────────

function PlannerHeader({
  onDispatch,
  dispatching,
}: {
  onDispatch: () => void;
  dispatching: boolean;
}) {
  const missionStatus = useMissionStore((s) => s.missionStatus);
  const tasks = useMissionStore((s) => s.missionTasks);
  const setStatus = useMissionStore((s) => s.setMissionStatus);
  const clearMissions = useMissionStore((s) => s.clearMissions);
  const setCurrentMissionId = useMissionStore((s) => s.setCurrentMissionId);
  const kernelConnected = useMissionStore((s) => s.kernelConnected);

  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const executing = tasks.filter((t) => t.status === 'EXECUTING').length;
  const total = tasks.length;

  const canDispatch =
    KernelConfig.USE_KERNEL &&
    kernelConnected &&
    total > 0 &&
    missionStatus !== 'ACTIVE' &&
    missionStatus !== 'EMERGENCY';

  const cycleStatus = useCallback(() => {
    if (missionStatus === 'EMERGENCY') return;
    if (KernelConfig.USE_KERNEL && kernelConnected) return; // kernel drives status
    const idx = STATUS_CYCLE.indexOf(missionStatus as MissionStatus);
    setStatus(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  }, [missionStatus, setStatus, kernelConnected]);

  const handleClear = useCallback(() => {
    clearMissions();
    setCurrentMissionId(null);
  }, [clearMissions, setCurrentMissionId]);

  const statusColor = C.missionStatus[missionStatus as keyof typeof C.missionStatus] ?? C.textMuted;
  const statusLabel = missionStatus.charAt(0) + missionStatus.slice(1).toLowerCase();

  const summaryParts: string[] = [];
  if (total > 0) {
    summaryParts.push(`${total} task${total !== 1 ? 's' : ''}`);
    if (completed > 0) summaryParts.push(`${completed} complete`);
    if (executing > 0) summaryParts.push(`${executing} executing`);
  }

  return (
    <View style={ph.container}>
      <View style={ph.left}>
        <Text style={ph.title}>Mission</Text>
        {summaryParts.length > 0 && (
          <Text style={ph.summary}>{summaryParts.join(' · ')}</Text>
        )}
      </View>
      <View style={ph.controls}>
        {/* Dispatch button — shown when kernel connected and tasks are queued */}
        {canDispatch && (
          <TouchableOpacity
            style={[ph.dispatchBtn, dispatching && ph.dispatchBtnDisabled]}
            onPress={onDispatch}
            activeOpacity={0.8}
            disabled={dispatching}
          >
            {dispatching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={ph.dispatchBtnText}>Dispatch</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Status pill — tappable in simulation mode, read-only in kernel mode */}
        <TouchableOpacity
          style={ph.statusPill}
          onPress={cycleStatus}
          activeOpacity={KernelConfig.USE_KERNEL && kernelConnected ? 1 : 0.7}
        >
          <View style={[ph.pillDot, { backgroundColor: statusColor }]} />
          <Text style={[ph.pillText, { color: statusColor }]}>{statusLabel}</Text>
        </TouchableOpacity>

        {total > 0 && (
          <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
            <Text style={ph.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const ph = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  summary: { fontSize: 12, color: C.textSec, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '500' },
  clearText: { fontSize: 13, color: C.error },
  dispatchBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  dispatchBtnDisabled: { opacity: 0.6 },
  dispatchBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});

// ─── AI Input Box ───────────

function AiInputBox({
  onPlan,
  planning,
  planSummary,
}: {
  onPlan: (text: string) => void;
  planning: boolean;
  planSummary: string;
}) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || planning) return;
    onPlan(trimmed);
    setText('');
  }, [text, planning, onPlan]);

  return (
    <View style={ai.container}>
      <View style={ai.labelRow}>
        <Text style={ai.label}>AI MISSION PLANNER</Text>
        {planning && <ActivityIndicator size="small" color={C.accent} style={{ marginLeft: 8 }} />}
      </View>
      {planSummary ? <Text style={ai.summary} numberOfLines={3}>{planSummary}</Text> : null}
      <View style={ai.inputRow}>
        <TextInput
          style={ai.input}
          value={text}
          onChangeText={setText}
          placeholder="e.g. Inspect sector 7 for thermal anomalies"
          placeholderTextColor={C.textMuted}
          editable={!planning}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          blurOnSubmit
        />
        <TouchableOpacity
          style={[ai.btn, (!text.trim() || planning) && ai.btnDisabled]}
          onPress={handleSubmit}
          disabled={!text.trim() || planning}
          activeOpacity={0.8}
        >
          <Text style={ai.btnText}>{planning ? '…' : 'Plan'}</Text>
        </TouchableOpacity>
      </View>
      {planning && (
        <Text style={ai.hint}>AI is building your mission — tasks appear below as they are generated</Text>
      )}
    </View>
  );
}

const ai = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.accentSub,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: C.accent, letterSpacing: 0.8 },
  summary: { fontSize: 12, color: C.textSec, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.bg,
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 52,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  hint: { fontSize: 11, color: C.textMuted, fontStyle: 'italic' },
});

// ─────────── Mission Planner Screen ───────────

export const MissionPlannerScreen = () => {
  const tasks = useMissionStore((s) => s.missionTasks);
  const robots = useMissionStore((s) => s.robots);
  const addTask = useMissionStore((s) => s.addTask);
  const setMissionStatus = useMissionStore((s) => s.setMissionStatus);
  const currentMissionId = useMissionStore((s) => s.currentMissionId);
  const setCurrentMissionId = useMissionStore((s) => s.setCurrentMissionId);
  const kernelConnected = useMissionStore((s) => s.kernelConnected);

  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const [generating, setGenerating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiPlanSummary, setAiPlanSummary] = useState('');

  // Build tasks from templates (used both in local and kernel paths)
  const buildTemplateTasks = useCallback(() => {
    return MISSION_TEMPLATES.flatMap((tmpl) => {
      const robot = robots.find((r) => r.id.startsWith(tmpl.robotPrefix));
      if (!robot) return [];
      return [{ robotId: robot.id, command: tmpl.command }];
    });
  }, [robots]);

  const generateMission = useCallback(async () => {
    if (generating) return;
    setGenerating(true);

    try {
      const templateTasks = buildTemplateTasks();
      if (templateTasks.length === 0) return;

      if (KernelConfig.USE_KERNEL && kernelConnected) {
        // Kernel mode: create mission on server, get back server-assigned IDs
        const mission = await kernelRestClient.createMission({
          name: `Maintenance Mission — ${new Date().toLocaleTimeString()}`,
          tasks: templateTasks,
        });

        // Store the kernel mission ID
        setCurrentMissionId(mission.id);
        setMissionStatus('PLANNING');

        // Load the server-created tasks (they have server-assigned IDs)
        mission.tasks.forEach((t) => addTask(t));
      } else {
        // Simulation mode: create tasks locally (existing behavior)
        templateTasks.forEach((t) => {
          addTask({
            id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            robotId: t.robotId,
            command: t.command,
            status: 'QUEUED',
            createdAt: Date.now(),
          });
        });
      }
    } catch (err) {
      console.warn('[Planner] Generate mission error:', err);
      // Fallback to local creation if kernel call fails
      buildTemplateTasks().forEach((t) => {
        addTask({
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          robotId: t.robotId,
          command: t.command,
          status: 'QUEUED',
          createdAt: Date.now(),
        });
      });
    } finally {
      setGenerating(false);
    }
  }, [generating, kernelConnected, buildTemplateTasks, addTask, setCurrentMissionId, setMissionStatus]);

  // Track aiPlanning state in KernelSocketService — set to false when PLAN_COMPLETE fires
  // We detect this by watching the task count grow while aiPlanning=true
  const prevTaskCount = useRef(tasks.length);
  useEffect(() => {
    if (aiPlanning && tasks.length > prevTaskCount.current) {
      prevTaskCount.current = tasks.length;
    }
  }, [tasks.length, aiPlanning]);

  const planWithAI = useCallback(async (naturalLanguage: string) => {
    if (aiPlanning) return;
    setAiPlanning(true);
    setAiPlanSummary('');

    // Clear existing tasks before AI plans a fresh mission
    useMissionStore.getState().clearMissions();
    useMissionStore.getState().setCurrentMissionId(null);

    try {
      await kernelRestClient.planMission({ naturalLanguage });
      // Tasks will appear via WebSocket PLAN_PROGRESS events
      // setAiPlanning(false) is called when PLAN_COMPLETE arrives (below)
    } catch (err) {
      console.warn('[Planner] AI plan request failed:', err);
      setAiPlanning(false);
      setAiPlanSummary('AI planning failed — kernel not connected or API key not set');
    }
  }, [aiPlanning, setCurrentMissionId]);

  // Listen for PLAN_COMPLETE / PLAN_ERROR to stop spinner and show summary
  const agentAlerts = useMissionStore((s) => s.agentAlerts);
  const lastAlert = agentAlerts[0];
  useEffect(() => {
    if (!aiPlanning) return;
    if (!lastAlert) return;
    if (lastAlert.agentId !== 'AI_PLANNER') return;
    if (lastAlert.eventKind === 'PLAN_COMPLETE') {
      const p = lastAlert.payload as { summary?: string };
      setAiPlanning(false);
      if (p.summary) setAiPlanSummary(p.summary);
    }
    if (lastAlert.eventKind === 'PLAN_ERROR') {
      const p = lastAlert.payload as { error?: string };
      setAiPlanning(false);
      setAiPlanSummary(`Error: ${p.error ?? 'Unknown planning error'}`);
    }
  }, [lastAlert, aiPlanning]);

  const dispatchMission = useCallback(async () => {
    if (!currentMissionId || dispatching) return;
    setDispatching(true);
    try {
      await kernelRestClient.dispatchMission(currentMissionId);
      setMissionStatus('ACTIVE');
      // Task status updates come back from kernel via WebSocket → KernelSocketService
    } catch (err) {
      console.warn('[Planner] Dispatch error:', err);
    } finally {
      setDispatching(false);
    }
  }, [currentMissionId, dispatching, setMissionStatus]);

  const showAiBox = KernelConfig.USE_KERNEL && kernelConnected;

  return (
    <KeyboardAvoidingView
      style={mp.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PlannerHeader onDispatch={dispatchMission} dispatching={dispatching} />
      {tasks.length > 0 && (
        <MissionProgressBar completed={completed} total={tasks.length} />
      )}

      {/* AI Input — only when kernel is connected */}
      {showAiBox && (
        <AiInputBox
          onPlan={planWithAI}
          planning={aiPlanning}
          planSummary={aiPlanSummary}
        />
      )}

      {tasks.length === 0 ? (
        <View style={mp.empty}>
          <Text style={mp.emptyIcon}>○</Text>
          <Text style={mp.emptyTitle}>No tasks queued yet.</Text>
          <Text style={mp.emptyBody}>
            {showAiBox
              ? 'Use the AI planner above, or generate from templates.'
              : 'Generate a mission to start task sequencing.'}
          </Text>
          <TouchableOpacity
            style={[mp.generateBtn, generating && mp.generateBtnDisabled]}
            onPress={generateMission}
            activeOpacity={0.85}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={mp.generateBtnText}>Generate from templates</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={mp.scrollContent} showsVerticalScrollIndicator={false}>
          {tasks.map((task, i) => (
            <TaskNode
              key={task.id}
              task={task}
              index={i}
              isLast={i === tasks.length - 1}
              missionId={currentMissionId}
            />
          ))}
          <TouchableOpacity
            style={[mp.addBtn, generating && mp.addBtnDisabled]}
            onPress={generateMission}
            activeOpacity={0.7}
            disabled={generating}
          >
            <Text style={mp.addBtnText}>Add template sequence</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

const mp = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 16, paddingBottom: 40 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: { fontSize: 48, color: C.border, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.textSec, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
  generateBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  addBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 12,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 13, color: C.textSec },
});
