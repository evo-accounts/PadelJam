import { View } from 'react-native';

/**
 * Entry route ("/"). Renders nothing visible — the Splash overlay in the root
 * layout sits on top while Boot resolves the session and redirects to the
 * correct route group. Having this route avoids landing on +not-found at start.
 */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#0B1F3A' }} />;
}
