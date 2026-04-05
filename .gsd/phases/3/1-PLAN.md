---
phase: 3
plan: 1
wave: 0
---

# Plan 3.1: Stabilize Web Rendering (Bugfix)

## Objective
Fix the fatal white screen error preventing web rendering before building out the intelligence layer.

## Context
- .gsd/SPEC.md
- App.tsx
- package.json

## Tasks

<task type="auto">
  <name>Debug Expo Web Blank Screen</name>
  <files>App.tsx package.json</files>
  <action>
    - Inject ErrorBoundary into App.tsx to catch root rendering errors.
    - Resolve missing web polyfills or aliasing for lucide-react-native/react-native-svg on the web bundle.
  </action>
  <verify>npx expo export --platform web</verify>
  <done>The web page renders without a JavaScript crash.</done>
</task>

## Success Criteria
- [ ] Expo Web works without a white screen error.
