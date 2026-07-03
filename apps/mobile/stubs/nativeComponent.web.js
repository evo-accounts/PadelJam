// Stub for react-native codegenNativeComponent on web — the real module
// uses the native codegen infrastructure that doesn't exist on web.
// stream-chat-expo imports it transitively; returning View is a safe no-op.
const { View } = require('react-native');
module.exports = function codegenNativeComponent(_name, _opts) {
  return View;
};
