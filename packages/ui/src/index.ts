/**
 * @padel/ui — the design tokens shared by apps/web and apps/mobile.
 *
 * DELIBERATELY DEPENDENCY-FREE AND COMPONENT-FREE. Both apps import this, and
 * `apps/web/next.config.ts` lists it in `transpilePackages`; adding React Native
 * components here would drag `react-native` into the web build graph, which is
 * the architecture this project explicitly chose not to have. Mobile primitives
 * live in `apps/mobile/components/ui/` until a second RN consumer exists.
 *
 * Everything is exported from the package ROOT rather than through subpath
 * exports, so Metro (Expo SDK 56), Turbopack and vitest all resolve it with no
 * extra configuration.
 *
 * The CSS GENERATOR is deliberately NOT exported here. It is build tooling for
 * scripts/tokens.mjs, and it imports with explicit `.ts` extensions so Node can
 * resolve it without a build step. Re-exporting it would drag those extensions
 * into every consumer's typecheck — apps/mobile's tsconfig has no
 * allowImportingTsExtensions, so `import '@padel/ui'` failed with TS5097 until
 * this boundary existed. Import it by path if you need it.
 */
export { palette, type Palette, type RampName } from './tokens/palette.ts';
export {
  semantic,
  light,
  dark,
  type SemanticName,
  type SemanticScheme,
} from './tokens/semantic.ts';
export { radius, RADIUS_BASE_PX, type Radius, type RadiusName } from './tokens/radius.ts';
export {
  text, space, weight, SPACE_STEP_PX,
  type Text, type TextName, type Space, type SpaceStep, type Weight, type WeightName,
} from './tokens/scale.ts';
