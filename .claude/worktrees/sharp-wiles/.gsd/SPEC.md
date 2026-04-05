# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Aegis Fleet Orchestrator is a mission-critical Multi-Robot Coordination Platform (MRCP) designed for heterogeneous industrial maintenance fleets. It eliminates vendor lock-in by providing a "Single Pane of Glass" orchestration layer, synchronizing Boston Dynamics Spot, ANYbotics, crawlers, and drones into a unified, deterministic mission workflow.

## Goals
1. **Provide a Universal Vendor-Agnostic Interface**: Abstract underlying proprietary APIs across various robotics platforms via an Adapter Layer.
2. **Deterministic Mission Orchestration**: Sequence complex workflows spanning multiple robot types with guarantee of execution or safe degradation.
3. **High-Fidelity Real-Time Telemetry**: Ensure sub-second latency for 3D localization monitoring (SLAM), battery/health streams, and system state using high-throughput time-series platforms.
4. **Safety-Critical Fault Processing**: Implement uncompromising spatial deconfliction and deterministic Emergency Stop protocols tailored for industrial safety constraints.

## Non-Goals (Out of Scope)
- Real-time teleoperation/joysticking for primary operations (system relies on autonomous sequence mapping).
- Consumer/hobbyist robotic platforms support.
- Natural Language LLM interactions (focus is deterministic industrial rule engines).
- Proprietary SLAM engine development (relying on onboard vendor SLAM or standardized 3D localization streams).

## Users
- **Plant Operators / Shift Managers**: Need a high-level view to monitor overall facility health and mission statuses.
- **Maintenance Engineers**: Need the ability to dispatch specific tasks (e.g., thermal inspection) directly to the right robot on the floor.
- **Safety Analysts**: Need deterministic geofencing control and E-Stop capabilities.

## Product Requirements (PRD)

### Fleet Hierarchy
- **Heterogeneous Capability Mapping**: The system must intelligently handle routing based on platform capabilities.
  - Examples: A drone is assigned aerial visual inspection/scouting; a Boston Dynamics Spot is dispatched to transport payload or navigate stairs.
- **Resource Pooling**: Robots are assigned to generic capability pools rather than hard-coded IDs where possible.

### Mission Orchestration (Mission Logic Engine)
- **Sequential Task Dispatching**: The ability for users to construct directed acyclic graphs (DAGs) representing sequential and parallel robot tasks across vendors.
- **State Machine Engine**: Robust state tracking ensuring transitions from task to task only occur upon verified completion.

### Telemetry & State
- **Real-Time 3D Localization**: Accurate pose data ingestion in a unified coordinate frame (e.g., converting vendor odometry/SLAM to global coordinates).
- **Vitals Monitoring**: Continous ingestion of ROS2 diagnostics (battery, joint temperatures, network latency).

### Conflict Resolution
- **Spatial Deconfliction**: Prevent physical robot collisions via dynamic multi-agent pathfinding and spatial geometry overlap detection.
- **Deadlock Resolution**: Deterministic strategies to handle when two robots end up contesting the same corridor.

### Safety Constraints
- **E-Stop Protocols**: Global and per-robot deterministic Halt commands bridging directly into the hardware safety loops.
- **Restricted-Zone Geofencing**: Immutable physical boundaries; enforcing hard stops if dead reckoning drifts towards a restricted area.

## Constraints
- **Network**: Deployment environment features spotty industrial Wi-Fi and intermittent private 5G; architecture must prioritize edge-first processing to handle disconnects gracefully.
- **Latency**: Telemetry jitter must not cause false-positive collision avoidance reactions.
- **Safety**: "Production" means integrating with multi-ton industrial equipment; fail-open or ambiguous state is strictly forbidden.

## Success Criteria
- [ ] Universal Robot Adapter integrates with at least 2 separate vendor SDKs simultaneously natively processing telemetries.
- [ ] Mission Logic Engine successfully dispatches a multi-stage sequential mission involving 2 different robot classes.
- [ ] End-to-end telemetry pipeline displays 3D digital twins updating faithfully in the frontend.
- [ ] Safe Spatial Deconfliction is structurally proven to halt robots within a 2-meter proximity threshold.
