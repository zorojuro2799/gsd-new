const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// ── Monorepo: watch packages/ directory ──
config.watchFolders = [
  workspaceRoot,
  path.resolve(projectRoot, 'packages'),
];

// ── Monorepo: resolve from project root first, then workspace root ──
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// ── pnpm: follow symlinks ──
config.resolver.unstable_enableSymlinks = true;

// ── Module resolution: avoid ESM-only packages with import.meta ──
// NOTE: Do NOT override resolverMainFields — Expo's default is platform-aware.
// Forcing ['react-native', 'browser', 'main'] breaks AsyncStorage on web
// because it loads the native (NativeModule) implementation instead of
// the localStorage implementation, causing a silent runtime crash.
config.resolver.unstable_enablePackageExports = false;

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
