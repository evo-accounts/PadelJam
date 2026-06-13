const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;

// In this pnpm monorepo the workspace packages (@padel/api, @padel/auth, @padel/i18n)
// declare react as a `*` peer, so pnpm can resolve them against a DIFFERENT physical
// copy of react/react-query/react-i18next than apps/mobile. Multiple copies of a
// context-providing library break React context across the package boundary:
// e.g. QueryClientProvider (app copy) + useQuery (@padel/api copy) -> "No QueryClient set",
// and the same class of bug for react-i18next. Force these singletons to resolve to the
// app's single copy regardless of which package imports them.
// Only force packages that exist at the app's node_modules root and are imported across the
// package boundary. Their transitive deps (e.g. @tanstack/query-core) then resolve naturally
// from the now-single parent, so they must NOT be listed here.
const SINGLETONS = ['react', 'react-dom', 'react-native', '@tanstack/react-query', 'react-i18next', 'i18next'];
const resolveSingleton = (name) => path.resolve(projectRoot, 'node_modules', name);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = SINGLETONS.find((m) => moduleName === m || moduleName.startsWith(m + '/'));
  if (singleton) {
    const rest = moduleName.slice(singleton.length); // '' or '/subpath'
    return context.resolveRequest(context, resolveSingleton(singleton) + rest, platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
