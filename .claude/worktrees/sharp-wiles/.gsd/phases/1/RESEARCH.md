# Phase 1 Research: Base tech stack for Universal Adapter Edge Node

## Context
The "Universal Robot Adapter" must ingest telemetry from vendor APIs or raw ROS2 DDS streams under edge-computing conditions (spotty Wi-Fi, low-power generic ARM/x86 boards), with absolute spatial and temporal safety guarantees. We must process telemetries deterministically and forward them.

## Candidates for Middleware Base
1. **C++ (ROS2 C++ Client - rclcpp)**: Industry standard. Highly performant but memory safety overhead is high. Requires heavy CMake setups which slow down iterations.
2. **Rust (ROS2 Rust Client - rclrs)**: High performance with provable memory safety and fearless concurrency. Best for state-machine safety critical workloads ("Zero Hallucination"). The ROS2 rust ecosystem (`rclrs`) is maturing rapidly.
3. **Go (ROS2 Go - rcutils/cgo bound or ROS2-web-bridge)**: Superior for backend microservices and REST/gRPC wrappers, but typically less favored for hard-deterministic edge systems due to Garbage Collection pauses (latency jitter).

## Decision
**Rust** is selected for Phase 1. 
- Why: It forces a safety-first mindset. Memory and thread safety guarantees map directly to the "Zero Hallucination" and deterministic safety constraints of the prompt.
- Implementation: Using `tokio` for async scheduling and `rclrs` for ROS2 data ingestion.

## Other Constraints Found
- We need to define standard JSON schema payloads for the frontend bridging (React/Next.js) because pushing native DDS directly to the browser is heavy and complex. WebRTC/WebSockets with protobuf or strict JSON will serve as the broker format.
