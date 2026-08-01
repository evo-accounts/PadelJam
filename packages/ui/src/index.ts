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
export { renderCss, cssVarName } from './generate/css.ts';
