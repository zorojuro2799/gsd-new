# REQUIREMENTS.md

> **Purpose**: Exact testable constraints for the Ralph Loop execution engine.

## Format
| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| REQ-01 | Must initialize project with `npx create-expo-app@latest -t expo-template-blank-typescript` ensuring SDK 54+. | SPEC.md Core | Pending |
| REQ-02 | Must enable the New Architecture (Fabric) in `app.json` (`"newArchEnabled": true`). | SPEC.md Core | Pending |
| REQ-03 | Must configure `WatermelonDB` with `expo-sqlite` as the local-first database adapter for Mission State caching. | SPEC.md Data | Pending |
| REQ-04 | Must implement a persistent E-Stop button that survives React Native navigation stack changes (overlay layout). | SPEC.md Safety | Pending |
| REQ-05 | Must integrate `three.js` via `expo-gl` for rendering the 3D Digital Twin map without blocking the JS thread. | SPEC.md WebGL | Pending |
| REQ-06 | Must establish a ROS2 WebSocket client using robust reconnection logic and binary data (BSON/Protobuf) decoding. | SPEC.md Telemetry | Pending |
| REQ-07 | UI must exclusively use dark-mode industrial palettes (Slate, Amber warnings, Crimson criticals, high contrast). | SPEC.md UX | Pending |

## Execution Directives
- **Zero Hallucination UI**: Stop making up gradient buttons. Use flat, borders, monospace fonts for data (`JetBrains Mono` or similar), and clear padding.
- **Offline Sync Layer**: Define the schema up-front for WatermelonDB. Models: `Mission`, `Task`, `Robot`.
