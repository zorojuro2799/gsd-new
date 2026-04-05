# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v1.0

## Must-Haves
- [ ] Universal Robot Adapter Layer (ROS2/Zenoh based).
- [ ] High-throughput state engine handling heterogeneous platform telemetry.
- [ ] WebGL based React 3D Digital Twin visualization.
- [ ] Mission Logic Engine capable of executing multi-stage DAG workflows.
- [ ] Foundational spatial deconfliction logic.

## Phases

### Phase 1: The Kernel
**Status**: ⬜ Not Started
**Objective**: Build the Universal Robot Adapter and basic state-machine. Establish foundational ROS2 / data structure middleware to handle basic vendor integration and telemetry ingestion into InfluxDB + PostgreSQL.

### Phase 2: The Orchestrator
**Status**: ⬜ Not Started
**Objective**: Develop the mission planning UI and centralized sequential task dispatching. Include state tracking for successful task execution, failures, and robot transitions.

### Phase 3: The Intelligence
**Status**: ⬜ Not Started
**Objective**: Implement automated conflict resolution and multi-robot spatial deconfliction. Introduce dynamic routing fail-safes to prevent robots from deadlocking in industrial corridors.

### Phase 4: Hardening
**Status**: ⬜ Not Started
**Objective**: End-to-End testing, rigorous security auditing, role-based access control (RBAC) instantiation, and load testing simulating 100+ concurrent hardware units connected over degrading network links.

## Future Roadmap (Post v1.0)
- **Predictive Maintenance**: Ingest historical InfluxDB data to train AI models predicting robot joint/component failures before they occur in the field.
- **Autonomous Handoff**: Complex multi-robot collaborations where payloads are swapped autonomously on the factory floor without human intervention.
- **Digital Twin Integration**: Full NVIDIA Omniverse / Isaac Sim synchronization for seamless sim-to-real bridging and scenario testing prior to deployment.
