import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
// Note: global header (Aegis wordmark, E-Stop, tabs) lives in App.tsx
import { useMissionStore } from '../store/useMissionStore';
import { HardwareFactory } from '../drivers';
import { RegistryService } from '../services/RegistryService';
import { kernelSocket } from '../services/KernelSocketService';
import { KernelConfig } from '../services/KernelConfig';
import type { RobotEntry, TelemetryPacket, RobotTier } from '../types';
import { C } from '../theme';

const CARD_MIN_WIDTH = 320;
const TELEMETRY_INTERVAL_MS = 2000;
const TIERS: RobotTier[] = ['Humanoid', 'Quadruped', 'Logistics', 'Aerial', 'Specialized'];

// ─────────── Battery Bar ───────────

function BatteryBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={bat.track}>
      <View style={[bat.fill, { width: `${Math.max(0, Math.min(100, value))}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const bat = StyleSheet.create({
  track: { height: 3, borderRadius: 99, backgroundColor: C.border, overflow: 'hidden', marginTop: 4 },
  fill: { height: 3, borderRadius: 99 },
});

// ─────────── Status Dot ───────────

function StatusDot({ state }: { state: TelemetryPacket['connectionState'] }) {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'CONNECTED') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else if (state === 'CONNECTING') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.2, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      anim.setValue(1);
    }
  }, [state, anim]);

  const dotColor =
    state === 'CONNECTED' ? C.online :
    state === 'CONNECTING' ? C.info :
    state === 'ERROR' ? C.error :
    C.textMuted;

  return (
    <Animated.View style={[sd.dot, { backgroundColor: dotColor, opacity: state === 'ERROR' || state === 'DISCONNECTED' ? 1 : anim }]} />
  );
}

const sd = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─────────── Robot Detail Panel ───────────

type RobotControlState = 'running' | 'paused' | 'stopped';

function RobotDetailPanel({ robot, telemetry }: { robot: RobotEntry; telemetry: TelemetryPacket | undefined }) {
  const updateTelemetry = useMissionStore((s) => s.updateTelemetry);
  const [controlState, setControlState] = useState<RobotControlState>('running');

  const rows: { label: string; value: string }[] = [
    { label: 'Driver', value: HardwareFactory.resolveProtocol(robot) },
    { label: 'Transport', value: robot.middleware.transport },
    ...(robot.middleware.distribution ? [{ label: 'Distribution', value: robot.middleware.distribution }] : []),
    { label: 'Coord standard', value: robot.coordinate_frames.standard },
    { label: 'Frames', value: robot.coordinate_frames.frames.join(', ') },
    { label: 'E-STOP latency', value: `${robot.state_logic.estop_latency_ms} ms` },
    { label: '3D mesh', value: robot.state_logic.mesh_stream_available ? 'Available' : 'Unavailable' },
    ...(robot.model_path ? [{ label: 'Model path', value: robot.model_path }] : []),
    ...(telemetry ? [
      { label: 'Joints', value: `${telemetry.jointStates.length} DOF` },
      { label: 'Yaw', value: `${telemetry.pose.yaw.toFixed(1)}°` },
      { label: 'Pitch', value: `${telemetry.pose.pitch.toFixed(1)}°` },
      { label: 'Roll', value: `${telemetry.pose.roll.toFixed(1)}°` },
    ] : []),
  ];

  const handlePause = useCallback(() => {
    if (controlState === 'stopped') return;
    if (controlState === 'paused') {
      setControlState('running');
      if (telemetry) {
        updateTelemetry(robot.id, { ...telemetry, connectionState: 'CONNECTED' });
      }
    } else {
      setControlState('paused');
      if (telemetry) {
        updateTelemetry(robot.id, { ...telemetry, connectionState: 'CONNECTING' });
      }
    }
  }, [controlState, telemetry, robot.id, updateTelemetry]);

  const handleEstop = useCallback(() => {
    setControlState('stopped');
    const driver = HardwareFactory.getDriver(robot.id);
    driver?.sendEstop();
    if (telemetry) {
      updateTelemetry(robot.id, { ...telemetry, connectionState: 'ERROR' });
    }
  }, [telemetry, robot.id, updateTelemetry]);

  const handleResume = useCallback(() => {
    setControlState('running');
    if (telemetry) {
      updateTelemetry(robot.id, { ...telemetry, connectionState: 'CONNECTED' });
    }
  }, [telemetry, robot.id, updateTelemetry]);

  return (
    <View style={dp.container}>
      {rows.map((row, i) => (
        <View key={row.label} style={[dp.row, i > 0 && dp.rowBorder]}>
          <Text style={dp.label}>{row.label}</Text>
          <Text style={dp.value} numberOfLines={1}>{row.value}</Text>
        </View>
      ))}

      {/* Robot control buttons */}
      <View style={dp.controlRow}>
        {controlState === 'stopped' ? (
          <TouchableOpacity style={dp.resumeBtn} onPress={handleResume} activeOpacity={0.8}>
            <Text style={dp.resumeText}>Resume</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[dp.pauseBtn, controlState === 'paused' && dp.pauseBtnActive]}
              onPress={handlePause}
              activeOpacity={0.8}
            >
              <Text style={[dp.pauseText, controlState === 'paused' && dp.pauseTextActive]}>
                {controlState === 'paused' ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={dp.estopBtn} onPress={handleEstop} activeOpacity={0.8}>
              <Text style={dp.estopText}>Emergency stop</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {controlState === 'stopped' && (
        <Text style={dp.stoppedNote}>
          Emergency stop issued · {robot.state_logic.estop_latency_ms} ms response
        </Text>
      )}
    </View>
  );
}

const dp = StyleSheet.create({
  container: { marginTop: 8, borderTopWidth: 1, borderColor: C.border, paddingTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  rowBorder: { borderTopWidth: 1, borderColor: C.borderSub },
  label: { fontSize: 12, color: C.textMuted, flex: 1 },
  value: { fontSize: 12, fontFamily: 'monospace', color: C.textSec, flex: 2, textAlign: 'right' },
  controlRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  pauseBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pauseBtnActive: {
    borderColor: C.warning,
    backgroundColor: '#FFFBEB',
  },
  pauseText: { fontSize: 13, fontWeight: '500', color: C.textSec },
  pauseTextActive: { color: C.warning },
  estopBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.error,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  estopText: { fontSize: 13, fontWeight: '500', color: C.error },
  resumeBtn: {
    flex: 1,
    backgroundColor: C.online,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  resumeText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  stoppedNote: {
    fontSize: 11,
    color: C.error,
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});

// ─────────── Robot Card ───────────

function RobotCard({ robot, telemetry }: { robot: RobotEntry; telemetry: TelemetryPacket | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const battery = telemetry?.battery ?? 0;
  const cpuTemp = telemetry?.cpuTemp ?? 0;
  const connectionState = telemetry?.connectionState ?? 'DISCONNECTED';
  const threshold = robot.state_logic.battery_critical_threshold;

  const batteryColor =
    battery <= threshold ? C.error :
    battery <= threshold + 10 ? C.warning :
    C.text;

  const cpuColor =
    cpuTemp >= 75 ? C.error :
    cpuTemp >= 60 ? C.warning :
    C.text;

  return (
    <View style={rc.container}>
      {/* Row 1 — Identity */}
      <View style={rc.identityRow}>
        <View style={rc.identityLeft}>
          <View style={[rc.tierDot, { backgroundColor: C.tier[robot.class] }]} />
          <Text style={rc.modelName} numberOfLines={1}>{robot.model}</Text>
        </View>
        <StatusDot state={connectionState} />
      </View>

      {/* Row 2 — ID + Protocol */}
      <Text style={rc.idLine} numberOfLines={1}>
        {robot.id}
        <Text style={rc.idSep}> · </Text>
        {HardwareFactory.resolveProtocol(robot)}
      </Text>

      {/* Row 3 — Metrics */}
      <View style={rc.metricsRow}>
        <View style={rc.metricCell}>
          <Text style={rc.metricLabel}>Battery</Text>
          <Text style={[rc.metricValue, { color: batteryColor }]}>{battery}%</Text>
          <BatteryBar value={battery} color={batteryColor} />
        </View>
        <View style={[rc.metricCell, rc.metricDivider]}>
          <Text style={rc.metricLabel}>CPU Temp</Text>
          <Text style={[rc.metricValue, { color: cpuColor }]}>{cpuTemp}°C</Text>
        </View>
      </View>

      {/* Row 4 — Expand */}
      <TouchableOpacity style={rc.expandBtn} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={rc.expandText}>Details  {expanded ? '∧' : '›'}</Text>
      </TouchableOpacity>

      {expanded && <RobotDetailPanel robot={robot} telemetry={telemetry} />}
    </View>
  );
}

const rc = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identityLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  tierDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  modelName: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  idLine: { fontSize: 12, fontFamily: 'monospace', color: C.textSec },
  idSep: { color: C.textMuted },
  metricsRow: { flexDirection: 'row', gap: 0 },
  metricCell: { flex: 1 },
  metricDivider: { paddingLeft: 12, borderLeftWidth: 1, borderColor: C.border },
  metricLabel: { fontSize: 11, color: C.textMuted, marginBottom: 2 },
  metricValue: { fontSize: 16, fontFamily: 'monospace', fontWeight: '600' },
  expandBtn: { alignSelf: 'flex-start' },
  expandText: { fontSize: 12, color: C.textMuted },
});

// ─────────── Fleet Summary Row ───────────

function FleetSummaryRow({ robots }: { robots: RobotEntry[] }) {
  const telemetry = useMissionStore((s) => s.telemetry);
  const registry = RegistryService.getInstance();
  const stats = registry.getFleetStats();
  const onlineCount = robots.filter((r) => telemetry[r.id]?.connectionState === 'CONNECTED').length;

  const cells = [
    { value: `${robots.length}`, label: 'units' },
    { value: `${onlineCount}`, label: 'online' },
    { value: `${stats.avgEstopLatency} ms`, label: 'avg E-STOP' },
  ];

  return (
    <View style={fsr.container}>
      {cells.map((cell, i) => (
        <React.Fragment key={cell.label}>
          {i > 0 && <View style={fsr.divider} />}
          <View style={fsr.cell}>
            <Text style={fsr.value}>{cell.value}</Text>
            <Text style={fsr.label}>{cell.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const fsr = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  cell: { flex: 1, alignItems: 'center' },
  value: { fontSize: 22, fontWeight: '700', color: C.text },
  label: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  divider: { width: 1, backgroundColor: C.border, marginVertical: 4 },
});

// ─────────── Tier Filter Bar ───────────

function TierFilterBar({
  activeTier,
  onSelect,
  robots,
}: {
  activeTier: RobotTier | null;
  onSelect: (tier: RobotTier | null) => void;
  robots: RobotEntry[];
}) {
  const counts: Record<string, number> = {};
  robots.forEach((r) => { counts[r.class] = (counts[r.class] ?? 0) + 1; });
  const allActive = activeTier === null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={tf.scroll}
      contentContainerStyle={tf.content}
    >
      <TouchableOpacity
        style={[tf.chip, allActive && tf.chipActive]}
        onPress={() => onSelect(null)}
        activeOpacity={0.7}
      >
        <Text style={[tf.chipText, allActive && tf.chipTextActive]}>
          All · {robots.length}
        </Text>
      </TouchableOpacity>

      {TIERS.filter((t) => (counts[t] ?? 0) > 0).map((tier) => {
        const active = activeTier === tier;
        return (
          <TouchableOpacity
            key={tier}
            style={[
              tf.chip,
              active && tf.chipActive,
              active && { borderLeftWidth: 3, borderLeftColor: C.tier[tier] },
            ]}
            onPress={() => onSelect(active ? null : tier)}
            activeOpacity={0.7}
          >
            <Text style={[tf.chipText, active && tf.chipTextActive]}>
              {tier} · {counts[tier] ?? 0}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const tf = StyleSheet.create({
  scroll: { backgroundColor: C.bg, borderBottomWidth: 1, borderColor: C.border },
  content: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: C.surfaceSub },
  chipActive: { backgroundColor: C.accentSub },
  chipText: { fontSize: 13, fontWeight: '500', color: C.textSec },
  chipTextActive: { color: C.accent },
});

// ─────────── Dashboard Screen ───────────

export const DashboardScreen = () => {
  const robots = useMissionStore((s) => s.robots);
  const updateTelemetry = useMissionStore((s) => s.updateTelemetry);
  const telemetryMap = useMissionStore((s) => s.telemetry);
  const [activeTier, setActiveTier] = useState<RobotTier | null>(null);
  const { width } = useWindowDimensions();

  const tickTelemetry = useCallback(() => {
    robots.forEach((robot) => {
      let driver = HardwareFactory.getDriver(robot.id);
      if (!driver) {
        driver = HardwareFactory.createDriver(robot);
        driver.connect();
      }
      updateTelemetry(robot.id, driver.getTelemetry());
    });
  }, [robots, updateTelemetry]);

  useEffect(() => {
    if (robots.length === 0) return;

    if (KernelConfig.USE_KERNEL) {
      // Real mode: KernelSocketService feeds the store via WebSocket.
      // Simulation interval is skipped — kernel pushes data to us.
      kernelSocket.connect();
      return () => {
        // Don't disconnect on unmount — kernel connection is app-lifetime.
        // kernelSocket.disconnect() is called only on full app teardown.
      };
    }

    // Simulation mode: existing Phase 2 behavior unchanged.
    tickTelemetry();
    const interval = setInterval(tickTelemetry, TELEMETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [robots, tickTelemetry]);

  const filteredRobots = activeTier ? robots.filter((r) => r.class === activeTier) : robots;
  const numCols = Math.max(1, Math.floor((width - 32) / CARD_MIN_WIDTH));
  const cardWidth = (width - 32 - (numCols - 1) * 12) / numCols;

  const rows: RobotEntry[][] = [];
  for (let i = 0; i < filteredRobots.length; i += numCols) {
    rows.push(filteredRobots.slice(i, i + numCols));
  }

  return (
    <View style={ds.container}>
      <FleetSummaryRow robots={robots} />
      <TierFilterBar activeTier={activeTier} onSelect={setActiveTier} robots={robots} />

      {filteredRobots.length === 0 ? (
        <View style={ds.empty}>
          <Text style={ds.emptyIcon}>○</Text>
          <Text style={ds.emptyTitle}>No robots in this category</Text>
          <Text style={ds.emptyBody}>Select a different filter or check fleet connection.</Text>
        </View>
      ) : (
        <ScrollView style={ds.scroll} contentContainerStyle={ds.scrollContent} showsVerticalScrollIndicator={false}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={ds.row}>
              {row.map((robot) => (
                <View key={robot.id} style={{ width: cardWidth }}>
                  <RobotCard robot={robot} telemetry={telemetryMap[robot.id]} />
                </View>
              ))}
              {row.length < numCols &&
                Array.from({ length: numCols - row.length }).map((_, i) => (
                  <View key={`sp-${i}`} style={{ width: cardWidth }} />
                ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const ds = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyIcon: { fontSize: 48, color: C.border, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.textSec, textAlign: 'center', marginBottom: 8 },
  emptyBody: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
});
