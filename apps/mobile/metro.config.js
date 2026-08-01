const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
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

/**
 * Install the singleton forcing on top of whatever resolver `cfg` already has,
 * delegating to it for everything else.
 *
 * Written as a wrapper rather than an assignment because it has to be applied
 * LAST — see the composition note below.
 */
function withSingletons(cfg) {
  const inner = cfg.resolver.resolveRequest;

  cfg.resolver.resolveRequest = (context, moduleName, platform) => {
    // stream-chat-expo pulls in react-native native codegen internals that don't
    // exist on web. Redirect them to a no-op stub so the web bundle doesn't fail.
    if (platform === 'web' && moduleName.includes('codegenNativeComponent')) {
      return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'stubs/nativeComponent.web.js') };
    }

    const singleton = SINGLETONS.find((m) => moduleName === m || moduleName.startsWith(m + '/'));
    if (singleton) {
      const rest = moduleName.slice(singleton.length); // '' or '/subpath'
      return context.resolveRequest(context, resolveSingleton(singleton) + rest, platform);
    }
    return (inner ?? context.resolveRequest)(context, moduleName, platform);
  };

  return cfg;
}

// ORDER IS LOAD-BEARING. `withStorybook` REPLACES resolver.resolveRequest rather
// than composing with it, so applying it after the singleton forcing silently
// deletes that forcing — and the symptom is not a resolver error but a runtime
// "No QueryClient set", a long way from this file. Storybook goes on first; the
// singletons wrap whatever it produced.
//
// `enabled` gates the ~2.9 MB Storybook runtime out of ordinary builds. The E2E
// harness turns it on for every build so suite 00 can screenshot the gallery
// (see scripts/e2e/run.mjs).
module.exports = withSingletons(
  withStorybook(config, {
    enabled: process.env.EXPO_PUBLIC_STORYBOOK === '1',
    configPath: path.resolve(projectRoot, '.rnstorybook'),
  }),
);
