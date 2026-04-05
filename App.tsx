import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  Text,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { MissionPlannerScreen } from './src/screens/MissionPlannerScreen';
import { useMissionStore } from './src/store/useMissionStore';
import { RegistryService } from './src/services/RegistryService';
import { C } from './src/theme';

// ─────────── Error Boundary ───────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.error, padding: 24 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Render error</Text>
          <ScrollView style={{ marginTop: 16 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.error?.toString()}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: 'monospace', marginTop: 12 }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// ─────────── Global Header ───────────

type Tab = 'fleet' | 'mission';

function GlobalHeader({
  activeTab,
  onTabChange,
  isWide,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  isWide: boolean;
}) {
  const robots = useMissionStore((s) => s.robots);
  const missionStatus = useMissionStore((s) => s.missionStatus);
  const triggerGlobalEstop = useMissionStore((s) => s.triggerGlobalEstop);
  const clearEstop = useMissionStore((s) => s.clearEstop);
  const isEmergency = missionStatus === 'EMERGENCY';

  const [confirmStep, setConfirmStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetConfirm = useCallback(() => {
    setConfirmStep(0);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleEstopPress = useCallback(() => {
    if (confirmStep === 0) {
      setConfirmStep(1);
      timerRef.current = setTimeout(resetConfirm, 4000);
    } else if (confirmStep === 1) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmStep(2);
      timerRef.current = setTimeout(resetConfirm, 4000);
    } else {
      resetConfirm();
      triggerGlobalEstop();
    }
  }, [confirmStep, resetConfirm, triggerGlobalEstop]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const statusColor = C.missionStatus[missionStatus] ?? C.textMuted;
  const statusLabel = missionStatus.charAt(0) + missionStatus.slice(1).toLowerCase();

  // Emergency state — full-width warning bar
  if (isEmergency) {
    return (
      <View style={[gh.container, gh.emergencyBar]}>
        <View style={gh.left}>
          <Text style={gh.wordmark}>Aegis</Text>
        </View>
        <Text style={gh.emergencyLabel}>Fleet halted — emergency stop active</Text>
        <TouchableOpacity style={gh.clearBtn} onPress={clearEstop} activeOpacity={0.8}>
          <Text style={gh.clearBtnText}>Clear emergency</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Confirmation step
  if (confirmStep > 0) {
    return (
      <View style={[gh.container, gh.confirmBar]}>
        <Text style={gh.confirmLabel}>
          {confirmStep === 1
            ? `Stop all ${robots.length} units?`
            : 'This will halt the entire fleet. Are you sure?'}
        </Text>
        <View style={gh.confirmActions}>
          <TouchableOpacity onPress={resetConfirm} activeOpacity={0.7} style={gh.cancelBtn}>
            <Text style={gh.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[gh.confirmBtn, confirmStep === 2 && gh.confirmBtnFinal]}
            onPress={handleEstopPress}
            activeOpacity={0.8}
          >
            <Text style={[gh.confirmBtnText, confirmStep === 2 && { color: '#fff' }]}>
              {confirmStep === 1 ? 'Yes, continue' : 'Confirm stop'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={gh.container}>
      {/* Left: wordmark */}
      <View style={gh.left}>
        <Text style={gh.wordmark}>Aegis</Text>
      </View>

      {/* Center: tabs (always shown; on wide both panels render but tabs still show focus) */}
      <View style={gh.tabs}>
        <TouchableOpacity
          style={[gh.tab, activeTab === 'fleet' && gh.tabActive]}
          onPress={() => onTabChange('fleet')}
          activeOpacity={0.7}
        >
          <Text style={[gh.tabText, activeTab === 'fleet' && gh.tabTextActive]}>Fleet</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[gh.tab, activeTab === 'mission' && gh.tabActive]}
          onPress={() => onTabChange('mission')}
          activeOpacity={0.7}
        >
          <Text style={[gh.tabText, activeTab === 'mission' && gh.tabTextActive]}>Mission</Text>
        </TouchableOpacity>
      </View>

      {/* Right: status + E-Stop */}
      <View style={gh.right}>
        <View style={gh.statusPill}>
          <View style={[gh.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[gh.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <TouchableOpacity style={gh.estopBtn} onPress={handleEstopPress} activeOpacity={0.8}>
          <Text style={gh.estopText}>E-Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const gh = StyleSheet.create({
  container: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  emergencyBar: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    height: 52,
  },
  confirmBar: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    height: 52,
  },
  left: { flex: 1 },
  wordmark: { fontSize: 18, fontWeight: '700', color: C.text },
  tabs: { flexDirection: 'row', gap: 2 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: C.surfaceSub },
  tabText: { fontSize: 14, fontWeight: '500', color: C.textMuted },
  tabTextActive: { color: C.text },
  right: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12 },
  estopBtn: { borderWidth: 1, borderColor: C.error, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  estopText: { fontSize: 13, fontWeight: '500', color: C.error },
  // Emergency
  emergencyLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: C.error, textAlign: 'center' },
  clearBtn: { backgroundColor: C.error, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  clearBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  // Confirmation
  confirmLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: C.text },
  confirmActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 5 },
  cancelText: { fontSize: 13, color: C.textSec },
  confirmBtn: {
    borderWidth: 1,
    borderColor: C.warning,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#FFFBEB',
  },
  confirmBtnFinal: { borderColor: C.error, backgroundColor: C.error },
  confirmBtnText: { fontSize: 13, fontWeight: '600', color: C.warning },
});

// ─────────── Main App ───────────

function MainApp() {
  const loadRobots = useMissionStore((s) => s.loadRobots);
  const robots = useMissionStore((s) => s.robots);
  const hasHydrated = useMissionStore((s) => s._hasHydrated);
  const [booted, setBooted] = useState(false);
  const [bootLog, setBootLog] = useState('Starting Aegis...');
  const [activeTab, setActiveTab] = useState<Tab>('fleet');
  const { width } = useWindowDimensions();
  const isWide = width >= 960;

  // Fallback: if AsyncStorage never fires onRehydrateStorage, force boot after 2s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!booted) {
        console.warn('[Aegis] Hydration timeout — booting without persisted state');
        setBooted(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasHydrated && !booted) {
      setBootLog('Hydrating state...');
      return;
    }

    if (booted && robots.length > 0) return; // already loaded from a previous run

    try {
      setBootLog('Loading robot registry...');
      const registry = RegistryService.getInstance();
      const count = registry.load();

      if (count === 0) {
        setBootLog('No robots found — check ROBOT_REGISTRY.json');
        setBooted(true);
        return;
      }

      const stats = registry.getFleetStats();
      setBootLog(`${count} robots · ${stats.totalTiers} tiers · ${stats.uniqueProtocols} protocols`);

      if (registry.validationWarnings.length > 0) {
        console.warn(`[Aegis] ${registry.validationWarnings.length} registry warnings`);
      }

      loadRobots(registry.robots);
      setTimeout(() => setBooted(true), 400);
    } catch (err) {
      console.error('[Aegis] Boot error:', err);
      setBootLog(`Boot error: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setBooted(true), 1000);
    }
  }, [hasHydrated, booted, robots.length, loadRobots]);

  if (!booted) {
    return (
      <View style={s.boot}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <Text style={s.bootLogo}>Aegis</Text>
        <Text style={s.bootSub}>Fleet Orchestrator</Text>
        <ActivityIndicator color={C.accent} size="small" style={{ marginTop: 32 }} />
        <Text style={s.bootLog}>{bootLog}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <GlobalHeader activeTab={activeTab} onTabChange={setActiveTab} isWide={isWide} />

      {isWide ? (
        // Desktop: both panels side by side
        <View style={s.row}>
          <View style={s.main}>
            <DashboardScreen />
          </View>
          <View style={s.aside}>
            <MissionPlannerScreen />
          </View>
        </View>
      ) : (
        // Mobile: one panel at a time
        <View style={s.fill}>
          {activeTab === 'fleet' ? <DashboardScreen /> : <MissionPlannerScreen />}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  row: { flex: 1, flexDirection: 'row' },
  main: { flex: 3, borderRightWidth: 1, borderColor: C.border },
  aside: { flex: 2, minWidth: 320, maxWidth: 480 },
  fill: { flex: 1 },
  boot: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  bootLogo: { fontSize: 36, fontWeight: '700', color: C.text },
  bootSub: { fontSize: 15, color: C.textSec, marginTop: 4 },
  bootLog: { fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 16 },
});
