# ARCHITECTURE.md

> **Status**: `DRAFT`

## System Context
The Aegis Fleet Orchestrator relies on a robust Edge-to-Cloud (or Edge-to-On-Prem) architecture optimized for deterministic execution, high availability, and spatial geometry correctness across heterogeneous fleets.

## Architecture Layers

### 1. The Adapter Layer (Middleware)
A vendor-agnostic middleware architecture bridging proprietary APIs into a common standard.
- **Protocol**: ROS2 (Robot Operating System 2) heavily utilized as the internal message broker using DDS (Data Distribution Service) for deterministic QoS guarantees.
- **Alternatively/Augmentatively**: Zenoh for high-throughput, low-latency cross-network communication (especially in spotty industrial Wi-Fi scenarios).
- **WebRTC**: Utilized for low-latency video and visual telemetry streams to bypass heavy TCP overheads.

### 2. Backend & Data (The State Engine)
- **Time-Series Database**: InfluxDB (or VictoriaMetrics) for ingesting high-throughput sensor logs, joint telemetry, network latency jitter, and battery health at sub-second intervals.
- **Relational Data**: PostgreSQL cluster used for relational fleet data, Multi-tenant RBAC (Role-Based Access Control) configurations, mission definitions, and audit logging.
- **Processing Layer**: High-performance Rust or Go services executing the Mission Logic Engine, enforcing rules engine constraints, and conducting spatial deconfliction computations.

### 3. Network Protocol & Edge-First Design
- Architecture specifically accounts for spotty industrial Wi-Fi and 5G connections.
- **Edge-First Processing**: The Adapter Layer runs as near to the robot as possible (sometimes as a payload computer), buffering telemetry during connection degradation and guaranteeing local fail-safes (local E-Stop geofences) regardless of backend connectivity.

### 4. Frontend Design System (The Single Pane of Glass)
- **Framework**: High-performance React / Next.js dashboard.
- **3D Digital Twins**: WebGL (Three.js or custom renderer) integration for precise 3D localization overviews, representing the industrial environment (from uploaded CAD/BIM) overlaying real-time URDF models of the varied robots.
- **Low-Latency Rendering**: Direct WebSocket/WebRTC updates bypassing standard REST for telemetry.

### 5. Security & Access Control
- **Multi-tenant RBAC**: Strict namespace isolation between different facility segments or operating teams.
- **E2E Encryption**: All Command-and-Control (C2) links must rely on mutual TLS (mTLS) or robust encrypted VPN tunnels.
- **Auditability**: Immutable audit trails for all mission dispatches and safety-override commands.

## Key Technical Terminology Validated
- `ROS2 / DDS`: For middleware and QoS (Quality of Service) telemetry distribution.
- `Zenoh`: Evaluated for high-performance edge-to-cloud data routing.
- `URDF` (Unified Robot Description Format): Used for mapping digital twin kinematics.
- `SLAM` (Simultaneous Localization and Mapping): Handling map frames and pose updates.
- `Latency Jitter` and `Dead Reckoning`: Edge logic heavily addresses these specifically for safety constraint guarantees.
