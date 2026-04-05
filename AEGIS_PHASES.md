# AEGIS FLEET ORCHESTRATOR — MASTER ARCHITECTURE & PHASE BACKUP
> Last updated: 2026-04-04 | Status: ALL PHASES 3A–3D COMPLETE ✅ + Bug fixes

---

## WHAT IS THIS FILE
Full backup of all architecture decisions, phase plans, and build context.
Read this at the start of any new session to restore full context.

---

## WHAT'S BEEN BUILT (PHASES 1-2 COMPLETE)

**React Native / Expo 54 mobile app — 1,680 lines TypeScript, 0 compile errors**

| File | Lines | What it does |
|------|-------|-------------|
| `App.tsx` | ~400 | Root component, GlobalHeader, E-Stop 2-step confirm, dual-pane layout |
| `src/types/index.ts` | 102 | RobotEntry, TelemetryPacket, IDriver, MissionTask, ConnectionState |
| `src/theme.ts` | 37 | Dark-mode industrial palette (Slate/Amber/Crimson) |
| `src/services/RegistryService.ts` | 260 | Loads/validates ROBOT_REGISTRY.json, tier grouping, search |
| `src/drivers/index.ts` | 307 | 8-protocol simulated driver factory (Zenoh/gRPC/ROS2/VDA5050/MAVLink/WebRTC/REST/Generic) |
| `src/store/useMissionStore.ts` | 106 | Zustand + AsyncStorage global state |
| `src/screens/DashboardScreen.tsx` | 472 | Fleet telemetry grid, tier filtering, robot detail panels |
| `src/screens/MissionPlannerScreen.tsx` | 357 | DAG mission sequencer, task status cycling |
| `src/native/AegisBridge/AegisBridgeSpec.ts` | 76 | JSI TurboModule scaffold |
| `src/data/schema.ts` | 37 | WatermelonDB schema (defined, not yet wired) |
| `ROBOT_REGISTRY.json` | 30 robots | 5 tiers, 8 protocols, full metadata |

**What works:** Dashboard, mission planner, E-Stop UX, tier filtering, telemetry simulation
**What's fake:** All telemetry is simulated in-process. No real robots, no real API, no server.

---

## THE COMPETITIVE WEDGE

Everyone owns a slice — nobody owns the full stack:

| Layer | Owner today |
|-------|-------------|
| Robot hardware | Boston Dynamics, ANYbotics |
| Low-level autonomy | ROS2 ecosystem |
| Fleet monitoring | Formant, InOrbit |
| Warehouse orchestration | Locus, GreyOrange |
| Factory integration | Siemens, ABB |
| **Mission-level maintenance orchestration** | **NOBODY — this is the wedge** |

**Positioning:** "The Kubernetes for Industrial Robots"
**Differentiator:** Full pipeline — inspection → anomaly detection → repair dispatch — across heterogeneous, vendor-locked robot fleets.

---

## SYSTEM TOPOLOGY

```
┌─────────────────────────────────────────────────────────────┐
│                    PHYSICAL ROBOTS                          │
│  Spot/gRPC  ANYmal/ROS2  Optimus/Zenoh  OTTO/VDA5050        │
│  Matrice/PSDK  Go2/CycloneDDS  Atlas/BD-SDK  MiR/REST       │
└────────────────────────┬────────────────────────────────────┘
                         │ vendor-native protocols
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         EDGE KERNEL  (intranet server, no cloud needed)     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PROTOCOL ADAPTER RING                                │  │
│  │  Zenoh │ ROS2 │ gRPC │ VDA5050 │ MAVLink │ REST ...  │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        ▼                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  TELEMETRY AGGREGATION AGENT                          │  │
│  │  normalize → REP-105 → 30Hz downsample                │  │
│  └────────┬──────────────────────────────────────────────┘  │
│           │                                                 │
│  ┌────────▼────────┐ ┌────────────────┐ ┌───────────────┐  │
│  │ Anomaly         │ │ Spatial        │ │ Fleet State   │  │
│  │ Detection Agent │ │ Deconfliction  │ │ Aggregator    │  │
│  └────────┬────────┘ └───────┬────────┘ └───────┬───────┘  │
│           └─────────────┬────┘                  │          │
│                         ▼                       │          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MISSION ORCHESTRATION BUS                          │   │
│  │  MissionDispatcher │ RePlanner │ MaintenanceWorkflow│   │
│  └─────────────────────────────────────────────────────┘   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  API SERVER                                         │   │
│  │  :7400 UDP  — E-Stop fast-path (msgpack + HMAC)     │   │
│  │  :7401 WS   — Telemetry push stream                 │   │
│  │  :7402 HTTP — Mission CRUD + Fleet REST             │   │
│  │  :7403 WS   — Agent events (anomalies, alerts)      │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ intranet LAN / Wi-Fi 6 / 5G private
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  AI PLANNER SERVICE  (sidecar, same edge server)            │
│  NL Parser │ Task Decomposer │ Constraint Validator         │
│  Claude Sonnet 4.6 (primary) │ Ollama (offline fallback)   │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  MOBILE APP  (React Native / Expo 54 — Phases 1-2 done)    │
│                                                             │
│  KernelSocketService → useMissionStore → DashboardScreen   │
│  KernelRestClient → MissionPlannerScreen (NL input)        │
│  EstopService (UDP) │ WatermelonDB (offline cache)         │
└─────────────────────────────────────────────────────────────┘
```

---

## MONOREPO STRUCTURE (decided)

```
gsd-new/
├── App.tsx                     ← Expo app root (unchanged)
├── src/                        ← mobile app source (Phase 1-2)
│   ├── services/
│   │   ├── KernelSocketService.ts  ← NEW Phase 3A
│   │   ├── KernelRestClient.ts     ← NEW Phase 3B
│   │   ├── MissionSyncService.ts   ← NEW Phase 3B
│   │   └── EstopService.ts         ← NEW Phase 3A
│   ├── drivers/index.ts            ← kept as fallback simulation
│   └── ...existing files
├── packages/
│   ├── shared-types/           ← TypeScript types shared mobile ↔ server
│   ├── edge-kernel/            ← Node.js/TypeScript server (Phase 3A+)
│   └── ai-planner/             ← Claude tool-use planner (Phase 3D)
├── AEGIS_PHASES.md             ← THIS FILE
└── pnpm-workspace.yaml
```

---

## EDGE KERNEL — PORT MAP & PROTOCOLS

| Port | Protocol | Purpose | Auth |
|------|----------|---------|------|
| 7400 | UDP | E-Stop fast-path | HMAC-SHA256 |
| 7401 | WebSocket | Telemetry push stream | Bearer token |
| 7402 | HTTP REST | Mission CRUD + Fleet state | Bearer token |
| 7403 | WebSocket | Agent events | Bearer token |

**Why UDP for E-Stop:** TCP backpressure under congestion breaks the <200ms SLA. Fixed 30-byte UDP packet + HMAC hits robots in <20ms typical, <200ms worst case (matches registry `estop_latency_ms`).

---

## WEBSOCKET TELEMETRY PROTOCOL

**Client → Server (on connect):**
```json
{
  "type": "SUBSCRIBE",
  "filters": { "robotIds": "ALL", "minIntervalMs": 33, "fields": ["battery","pose","cpuTemp","connectionState"] },
  "clientId": "<uuid>"
}
```

**Server → Client (pushed at subscribed interval):**
```json
{
  "type": "TELEMETRY_BATCH",
  "sequenceId": 14291,
  "packets": [{
    "robotId": "quad-spot-01",
    "timestamp": 1743739200000,
    "serverTimestamp": 1743739200003,
    "battery": 78,
    "cpuTemp": 47,
    "connectionState": "CONNECTED",
    "pose": { "x": 12.4, "y": 8.1, "z": 0.0, "yaw": 1.57, "pitch": 0.0, "roll": 0.0 },
    "jointStates": [],
    "anomalyFlags": [],
    "missionTaskId": null
  }]
}
```

**Server → Client (agent events on port 7403):**
```json
{
  "type": "AGENT_EVENT",
  "agentId": "ANOMALY_DETECTION",
  "eventKind": "ANOMALY_DETECTED",
  "severity": "CRITICAL",
  "payload": { "robotId": "quad-spot-01", "ruleId": "battery_critical", "value": 12 },
  "timestamp": 1743739200000
}
```

---

## REST API SURFACE (/api/v1)

### Phase 3A (fleet read-only):
```
GET  /health               Kernel health + agent states
GET  /fleet/state          Full snapshot (all robots, telemetry, anomalies)
GET  /fleet/robots         Registry entries + connection state
GET  /fleet/robots/:id     Single robot full state
GET  /fleet/stats          Aggregate metrics
```

### Phase 3B (mission CRUD — added):
```
POST   /missions                    Create mission
GET    /missions                    List with ?status= filter
GET    /missions/:id                Full mission + task tree
PATCH  /missions/:id                Update status/name
POST   /missions/:id/dispatch       Start execution
POST   /missions/:id/pause          Pause
POST   /missions/:id/abort          Abort + stop robots
POST   /missions/:id/tasks          Add task
PATCH  /missions/:id/tasks/:taskId  Update task
```

---

## THE SIX AGENTS

### Agent 1: Telemetry Aggregation Agent
- Receives raw protocol payloads from adapters
- Normalizes to TelemetryPacketV2 (REP-105 frames, timestamp alignment, 30Hz cap)
- Emits onto event bus
- **Phase 3A:** SimulatedAdapter outputs (same as existing drivers, but server-side)
- **Phase 3B+:** Real protocol parsers replace simulation

### Agent 2: Mission Dispatcher Agent
- Builds DAG from task.dependsOn edges
- Translates RobotCommand (verb+zone+params) to protocol-native format
- Checks battery/connection/deconfliction before each dispatch
- Detects completion via telemetry (pose convergence)
- **Phase 3B**

### Agent 3: Anomaly Detection Agent
- 30Hz rule engine against live telemetry
- Rules loaded from `anomaly_rules.json`
- Sliding 5-second window per robot for trend detection
- CRITICAL anomalies auto-trigger maintenance workflows
- **Phase 3C**

### Agent 4: Spatial Deconfliction Agent
- Zone map loaded from `facility_map.json`
- Assigns robots to zones by pose bounding box
- EXCLUSIVE zones: 1 robot at a time
- Airspace: pairwise distance checks between aerial robots
- Floor corridors: velocity vector collision prediction
- **Phase 3C**

### Agent 5: Re-Planner Agent
- Triggered by task failure or robot going offline
- Fast-path: find same-tier replacement robot (<50ms, no AI call)
- If no replacement: call AI Planner /replan endpoint
- **Phase 3C**

### Agent 6: Maintenance Workflow Agent — THE DIFFERENTIATOR
- Declarative state machine from `maintenance_workflows.json`
- Full pipeline: inspection → anomaly → repair dispatch
- Example: thermal anomaly → drone visual confirm → quadruped thermal scan → humanoid repair
- Each stage creates WatermelonDB tasks visible in mobile DAG view
- **Phase 3C**

---

## AI PLANNER (Phase 3D)

**Pattern:** Tool-use, not free-form generation. LLM calls typed tools; server validates each call against live fleet state before accepting.

**Tools:**
- `create_mission(name, priority, deadline?)`
- `add_task(localId, robotId, verb, zone, sensorMode, dependsOn[], estimatedDurationMs, timeoutMs)`
- `explain_plan(summary, reasoning)` — shown to operator in UI
- `request_clarification(question, options[])` — when NL input is ambiguous

**Validation after every add_task:**
- robotId exists in registry
- battery > critical_threshold + 15%
- robot is CONNECTED
- robot tier matches verb capability
- no circular dependencies in dependsOn

**Models:**
- Primary: Claude Sonnet 4.6 via Anthropic API
- Fallback: Ollama local model (offline, requires GPU on edge server)

**API endpoints:**
```
POST /plan/mission          NL → mission plan
POST /plan/replan           Adapt mission on failure
POST /plan/anomaly-response Anomaly → response workflow
```

**Streaming:** As LLM calls tools, PLAN_PROGRESS events stream to mobile app via port 7403 WebSocket. Mobile shows live DAG construction.

---

## WATERMELONDB INTEGRATION (Phase 3B)

**Schema additions needed (existing schema preserved):**

Tasks table additions:
- `depends_on` (string — JSON array)
- `parameters` (string — JSON object)
- `timeout_ms` (number)
- `zone` (string)
- `verb` (string)
- `estimated_duration_ms` (number)
- `started_at` (number, nullable)
- `completed_at` (number, nullable)

Missions table additions:
- `priority` (string)
- `source` (string: MANUAL | AI_GENERATED)
- `deadline` (number, nullable)
- `nl_input` (string, nullable)
- `dispatched_at` (number, nullable)

**Offline-first sync:**
1. Offline: write to WatermelonDB with `status = 'PLANNING'`
2. Reconnect: MissionSyncService.pushPendingMissions() → POST /missions
3. Pull /fleet/state → merge into WatermelonDB

---

## INTEGRATION RULES (What doesn't change)

| Component | Status | Rule |
|-----------|--------|------|
| `DashboardScreen.tsx` | Keep | Reads `useMissionStore.telemetry` — source changes, component doesn't |
| `useMissionStore.updateTelemetry()` | Keep | Same Zustand action, fed by KernelSocketService instead of simulation |
| `RobotCard`, `TaskNode`, all UI | Keep | Untouched |
| `ROBOT_REGISTRY.json` | Keep | Source of truth for adapter factory on server too |
| `src/types/index.ts` | Extend | New V2 types added, old types preserved |
| E-Stop UX (2-step, 4s timeout) | Keep | UI preserved, backend path added |
| `src/drivers/index.ts` | Keep as fallback | Simulation still runs when kernel unreachable |

---

## BUILD ORDER

### PHASE 3A — Edge Kernel + Real Telemetry ✅ COMPLETE
Goal: Dashboard shows data from Edge Kernel WebSocket instead of in-process simulation.
Data is still simulated (server-side now), but the pipe is real.

Files created:
- `pnpm-workspace.yaml`
- `packages/shared-types/`
- `packages/edge-kernel/` (HTTP + WebSocket + UDP + SimulatedAdapters + TelemetryAgent)
- `src/services/KernelSocketService.ts`
- `src/services/KernelConfig.ts`
- Update `src/store/useMissionStore.ts` (add kernelConnected flag)
- Update `src/screens/DashboardScreen.tsx` (use KernelSocketService)

Verify:
1. `cd packages/edge-kernel && npm run dev`
2. Start Expo app
3. Dashboard shows live telemetry from kernel (same data, new pipe)
4. Change `KernelConfig.KERNEL_HOST` to a real server IP for production

### PHASE 3B — Mission CRUD + Dispatcher Agent ✅ COMPLETE
Goal: Missions persist to server. DAG executes against (simulated) robots.

Files created:
- Mission REST endpoints in edge-kernel HttpServer
- `packages/edge-kernel/src/agents/MissionDispatcherAgent.ts`
- `src/services/KernelRestClient.ts`
- `src/services/MissionSyncService.ts`
- Activate WatermelonDB (`src/data/index.ts` wired up)
- Update `MissionPlannerScreen.tsx` (calls REST instead of in-memory)

Verify:
1. Create mission in app
2. Check kernel logs show mission received
3. Kill app, restart, mission persists (WatermelonDB)
4. Dispatch mission, task status cycles via kernel

### PHASE 3C — Intelligence Agents ✅ COMPLETE
Goal: Anomaly detection + spatial deconfliction + maintenance workflows automated.

Files created:
- `packages/edge-kernel/src/bus/KernelEventBus.ts` — typed EventEmitter, singleton
- `packages/edge-kernel/src/agents/AnomalyDetectionAgent.ts` — 5-rule engine, cooldowns, CLEARED events
- `packages/edge-kernel/src/agents/SpatialDeconflictionAgent.ts` — zone bounds check, EXCLUSIVE zone enforcement
- `packages/edge-kernel/src/agents/RePlannerAgent.ts` — task_failed → find same-tier replacement → retryTask
- `packages/edge-kernel/src/agents/MaintenanceWorkflowAgent.ts` — 3 workflows: thermal/battery/connection
- `packages/edge-kernel/data/anomaly_rules.json`
- `packages/edge-kernel/data/facility_map.json` — 7 zones (docks, sectors, corridor, airspace)
- `packages/edge-kernel/data/maintenance_workflows.json`

Files modified:
- `TelemetryAgent.ts` — emits `kernelBus.emit('telemetry', packet)` on each tick
- `MissionDispatcherAgent.ts` — emits `task_failed` on bus; added `retryTask()`; 10% failure simulation
- `MissionStore.ts` — added `updateTaskRobot()` for replan reassignment
- `KernelApp.ts` — wires all 6 agents, shared broadcastEvent fn
- `src/types/index.ts` — added WsAgentEvent, AgentId, AgentEventKind
- `src/store/useMissionStore.ts` — added agentAlerts[], addAgentAlert(), clearAgentAlerts()
- `src/services/KernelSocketService.ts` — handles ANOMALY_DETECTED, ANOMALY_CLEARED, DECONFLICT_ALERT, REPLAN_TRIGGERED

Data flow:
  TelemetryAgent → kernelBus 'telemetry' → AnomalyDetectionAgent
    → CRITICAL → kernelBus 'anomaly_critical' → MaintenanceWorkflowAgent → new mission dispatched
  MissionDispatcherAgent → kernelBus 'task_failed' → RePlannerAgent → retryTask(newRobot)
  TelemetryAgent → kernelBus 'telemetry' → SpatialDeconflictionAgent → DECONFLICT_ALERT WS event

### PHASE 3D — AI Planner ✅ COMPLETE
Goal: Type natural language, watch mission DAG construct live.

Files created/modified:
- `packages/edge-kernel/src/agents/PlannerAgent.ts` — Claude Sonnet 4.6 tool-use planner
  - Tools: create_mission, add_task (with fleet validation), explain_plan
  - Per-tool validation: robotId exists, CONNECTED, battery > critical+10%
  - Async: HTTP POST returns immediately, tasks appear via WebSocket
- `packages/edge-kernel/src/server/HttpServer.ts` — added POST /api/v1/plan/mission
- `packages/edge-kernel/src/KernelApp.ts` — wires PlannerAgent
- `packages/edge-kernel/package.json` — added @anthropic-ai/sdk
- `src/services/KernelRestClient.ts` — added planMission()
- `src/services/KernelSocketService.ts` — handles PLAN_PROGRESS (adds tasks live), PLAN_COMPLETE, PLAN_ERROR
- `src/screens/MissionPlannerScreen.tsx` — AiInputBox component (NL text + Plan button + live summary)

Bug fixes (same session):
- `metro.config.js` — added watchFolders, pnpm symlink support, react-native mainField
- `app.json` — changed userInterfaceStyle dark→light (was causing blank screen)
- `App.tsx` — added 2s hydration fallback timeout (prevents infinite loading if AsyncStorage fails)

Setup:
  Set ANTHROPIC_API_KEY=sk-ant-... before running edge kernel
  Kernel falls back gracefully to STOPPED state if key is absent

Data flow:
  User types NL → POST /plan/mission → PlannerAgent.planAsync()
    → Claude tool loop: create_mission → add_task × N → explain_plan
    → Each add_task validated → PLAN_PROGRESS WS event → addTask() in store
    → Tasks appear live in DAG as AI generates them
    → PLAN_COMPLETE → setMissionId → operator presses Dispatch

---

## DECISIONS LOG

| Decision | Choice | Reason |
|----------|--------|--------|
| Repo structure | Monorepo (confirmed by user) | Shared TypeScript types between mobile + server |
| Edge Kernel runtime | TypeScript/Node.js | Sufficient for 900 pkt/sec; shared types; Rust adapter addon later if needed |
| AI model | Claude Sonnet 4.6 primary + Ollama fallback | Best tool-use; offline fallback for air-gapped facilities |
| Build order | 3A → 3B → 3C → 3D | Telemetry pipe first; everything builds on it |
| E-Stop protocol | UDP (not WebSocket) | TCP backpressure breaks <200ms SLA under load |
| Mission planning | Tool-use pattern (not free-form) | Eliminates hallucinated robot IDs and invalid zones |
| Simulation fallback | Keep existing drivers | Mobile app works standalone when kernel unreachable |
