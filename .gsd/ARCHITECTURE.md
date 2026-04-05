# ARCHITECTURE.md

> **Status**: `FINALIZED`
> **Subsystem**: Mobile Tablet C2 Node (Aegis Fleet Orchestrator)

## System Context
The React Native mobile/tablet application serves as the edge boundary "Single Pane of Glass." It interfaces directly with the ROS2 Edge Kernel running on the facility's localized Intranet. 

## Architectural Layers (Mobile Client)

### 1. Presentation Layer (Fabric / New Arch)
- **Engine**: React Native (Expo SDK 54+).
- **Renderer**: Fabric (synchronous native rendering, eliminating layout jumps).
- **Styling**: `NativeWind` (Tailwind for RN, New Arch compatible) or `StyleSheet`.
- **Navigation**: `Expo Router` (file-based routing, native stack capability).

### 2. State & Conflict Resolution (Offline-First)
- **Database**: `WatermelonDB` utilizing `expo-sqlite`.
  - Chosen for lazy-loading massive lists of telemetry logs without thrashing memory.
  - Implements the "Sync" primitive out-of-the-box allowing the app to reconcile state when the industrial 5G connection drops and reconnects.
- **Ephemeral State**: Zustand for fast global UI state (like currently selected robot or active modal) that does not need database persistence.

### 3. Telemetry Ingestion (The Sink)
- **Data Transport**: WebSockets connecting to the ROS2 `rosbridge_server` or a custom unified Rust adapter.
- **Handling Strategy**: 
  - To prevent thermal throttling, telemetry updates (100Hz+) are debounced or piped directly via Reanimated shared values/JSI references if manipulating the UI thread.
  - `Odometry` and `JointState` messages bypass React state to directly update the `Three.js` scene objects traversing the `expo-gl` bridge.

### 4. Hardware Interaction (Digital Twin)
- **3D Canvas**: `expo-three` running on `@react-native-community/expo-gl`.
- Uses lightweight loaded GLTF/URDF parsed models for Optimus, Spot, Husky. 
- Map data utilizes pre-loaded static facility bounds overlaid with dynamic poses.

### 5. Security & Network
- App strictly connects over mTLS (Mutual TLS) to the Edge Node.
- Unblockable UI layer for E-STOP emitting UDP heartbeats to bypass TCP overhead.
