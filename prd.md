# PRD — Aegis Fleet Orchestrator (React Native / Expo 54+)

> **Target Persona**: Principal Robotics Systems Architect
> **Objective**: Mobile Aegis Fleet Orchestrator C2 Node

## Vision
Aegis Fleet Orchestrator is a mission-critical Multi-Robot Coordination Platform (MRCP) designed for industrial maintenance fleets. This document specifies the mobile/tablet application layer—a "Single Pane of Glass" acting as a command-and-control (C2) node. It interfaces seamlessly with Tesla Optimus Gen 2, Boston Dynamics Spot, ANYmal, and Skydio drones.

## Core Technical Mandates
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
   - Offline-capable dispatching: Cached in WatermelonDB while in a dead-zone.
3. **Hardware-First E-Stop**:
   - A persistent, unblockable UI overlay component for Fleet Halt (E-Stop).
   - Emits a UDP heartbeat. If tablet connection drops, fleet reverts to autonomous safe state.
4. **Digital Twin Telemetry**:
   - Sub-second UI updates bounding ROS2 JointState and Odometry streams. 
   - Throttle rendering to 30Hz to prevent mobile thermal degradation. Use JSI to bypass React state for high-frequency updates.

## Safety & Conflict Handling
- **Deadlock Resolution Override**: App provides an explicit interface to override conflicting states when AMRs share restricted geometry.
- **Telemetry Jitter Filtering**: UI employs Kalman filtering/interpolation so latency jitter doesn't cause UI flickering.

## Architecture Layers
- **Presentation**: React Native + Fabric + `NativeWind` (v4).
- **Offline Logic**: `WatermelonDB` + `expo-sqlite`. Zustand for fast volatile UI state.
- **Data Sink (ROS2)**: WebSockets -> JSI -> `Three.js` canvas (`expo-gl`).
- **Security**: mTLS backend communication.

## Execution Requirements
1. Must initialize project with `npx create-expo-app@latest -t expo-template-blank-typescript` ensuring SDK 54+.
2. Must enable the New Architecture (Fabric) in `app.json` (`"newArchEnabled": true`).
3. Must integrate `three.js` via `expo-gl` without blocking the JS thread.
4. Define WatermelonDB schemas up-front: `Mission`, `Task`, `Robot`.
5. UI must exclusively use dark-mode industrial palettes (Slate, Amber warnings, Crimson criticals).
6. **No "childish" mobile trends**. Use flat, defined borders, clear data typography (e.g., monospace arrays).
