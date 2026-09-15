/**
 * Raise every CocoaPods target to the app's own deployment target.
 *
 * WHY THIS EXISTS. `platform :ios, '16.4'` in the Podfile sets the app target
 * and the pod library targets, but CocoaPods gives each pod's RESOURCE BUNDLE
 * target the platform its podspec declares instead. Several dependencies still
 * say 9.0, 11.0, 12.0, 12.4 or 13.4 there. Xcode 26 warned about that; Xcode 27
 * makes it a hard error — "the range of supported deployment target versions is
 * 15.0 to 27.0.x" — and the build stops before compiling a line. The machine was
 * upgraded to Xcode 27 on 2026-09-15 and every end-to-end run failed at once.
 *
 * WHY A PLUGIN AND NOT A PODFILE EDIT. `apps/mobile/ios` is gitignored: it is
 * `expo prebuild` output, so anything written there is lost on the next
 * regeneration and is invisible to every other checkout. A config plugin is the
 * supported way to make a Podfile change durable.
 *
 * WHY NOT `expo-build-properties`. Its `ios.deploymentTarget` writes the value
 * into Podfile.properties.json, which feeds the `platform :ios` line — exactly
 * the setting that already says 16.4 and already does NOT reach resource
 * bundles. It would not fix this.
 *
 * The loop only ever RAISES a target, so a pod that legitimately wants a higher
 * minimum than the app keeps it.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/** Lets the CI job detect a Podfile generated before this plugin existed. */
const MARKER = '@generated begin padeljam-pod-deployment-target';

const snippet = (target) => `
    # ${MARKER} — do not edit by hand.
    # See apps/mobile/plugins/withPodMinimumDeploymentTarget.js for why.
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_configuration|
        current = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < ${target}
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${target}'
        end
      end
    end
    # @generated end padeljam-pod-deployment-target
`;

module.exports = function withPodMinimumDeploymentTarget(config, { target = '16.4' } = {}) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfile = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      const source = fs.readFileSync(podfile, 'utf8');

      if (source.includes(MARKER)) return mod;

      // Append inside the existing `post_install do |installer|` block, after
      // react_native_post_install has finished rewriting build settings — doing
      // it before would let that call put the low values back.
      const anchor = `      :ccache_enabled => ccache_enabled?(podfile_properties),
    )`;
      if (!source.includes(anchor)) {
        throw new Error(
          'withPodMinimumDeploymentTarget: the expected post_install block was not found in the ' +
            'generated Podfile. Expo changed its template — update the anchor in this plugin.',
        );
      }

      fs.writeFileSync(podfile, source.replace(anchor, anchor + '\n' + snippet(target)));
      return mod;
    },
  ]);
};

module.exports.MARKER = MARKER;
