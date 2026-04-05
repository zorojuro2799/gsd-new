# SPEC.md — Master Product Requirements Document (PRD)

> **Status**: `FINALIZED`
> **Target Persona**: Principal Robotics Systems Architect
> **Objective**: Mobile Aegis Fleet Orchestrator (React Native / Expo 54+)

## Vision
Aegis Fleet Orchestrator is a mission-critical Multi-Robot Coordination Platform (MRCP) designed for industrial maintenance fleets. This document specifies the mobile/tablet application layer—a "Single Pane of Glass" acting as a command-and-control (C2) node. It will seamlessly interact with Tesla Optimus Gen 2, Boston Dynamics Spot, ANYmal, and drones locally and securely.

## Core Technical Mandates (For Ralph Loop / Code Execution)
1. **Framework**: React Native with Expo SDK 54+ utilizing exclusively the **New Architecture** (JSI, Fabric, TurboModules). No legacy bridges.
2. **Platform Build**: Strict zero-config builds utilizing Expo Application Services (EAS).
3. **Data Sync / Local-First**: Intermittent connection handling via `WatermelonDB` (running on Expo SQLite) for offline-sync states and mission caching.
4. **Telemetry Bridge**: A ROS2 (Jazzy Jalisco LTS) to React Native bridge utilizing a JSI-bound WebSockets or gRPC client.
5. **UI/UX Aesthetics**: "Industrial-Clean" interface using principles from Untitled UI/shadcn. High-density data, strict dark-mode-first high-contrast palettes, preventing any "childish" mobile patterns.
6. **WebGL Rendering**: Real-time 3D Digital Twins integrated via `expo-gl` and `three.js` to render URDF models driven by Live ROS2 pose updates.

## Goals & Features
1. **Unified Dashboard**: 
   - Grid layout of all active assets (Humanoids, AMRs, UAVs).
   - High-contrast visual indicators: Battery (V), Link Latency (ms), and System State.
2. **Mission Orchestrator (Mission Builder)**:
   - A DAG (Directed Acyclic Graph) UI to sequence tasks.
   - Offline-capable dispatching: Shift managers can build and push a mission while offline (cached in WatermelonDB). When the router connection returns, WatermelonDB synchronizes the payload to the Edge kernel.
3. **Hardware-First E-Stop**:
   - A persistent, unblockable UI overlay component for Fleet Halt (E-Stop).
   - Designed to emit a UDP heartbeat. If the tablet loses connection, the fleet reverts to an autonomous safe state.
4. **Digital Twin Telemetry**:
   - Sub-second UI updates bounding the ROS2 JointState and Odometry streams. 
   - Throttle telemetry rendering to 30Hz to prevent mobile thermal degradation, using raw JSI to bypass React state reconciliations for high-frequency data.

## Non-Goals (Out of Scope)
- Direct joystick teleoperation.
- Cloud-first dependency (System must function if the facility loses internet but maintains local Wi-Fi/5G Intranet).
- Legacy React Native (Pre-0.73/Fabric) backward compatibility.

## Users
- **Plant Operators / Shift Managers**: Need a high-level view to monitor facility health, task statuses, and fleet whereabouts.
- **Safety Analysts**: Need immediate access to E-Stop and dead-reckoning boundary visualizations.

## Safety & Conflict Handling
- **Deadlock Resolution Override**: The app must provide an explicit interface to override conflicting states when two autonomous entities (e.g., a Spot and a Unitree G1) share restricted geometry. 
- **Telemetry Jitter Filtering**: UI must employ Kalman filtering (or visual smoothing interpolation) so network latency jitter doesn't cause UI flickering.

## Quality & Error Fixing Protocols (For Ralph)
When executing or fixing errors from this PRD:
1. **JSI Over JS**: For ANY high-throughput data (ROS2 streams), use JSI HostObjects; do not pass heavy arrays through JSON serialization across the React boundary.
2. **Reanimated**: All UI animations and gestures (like panning the 3D map) MUST run on the UI thread via `react-native-reanimated`.
3. **Styling Engine**: Use `NativeWind` v4 (which supports Fabric/New Arch) or strict fast stylesheets. Avoid heavy context-based themeing at runtime.
4. **Strict Typing**: TypeScript `strict: true`. No `any` types for ROS2 message payloads.
