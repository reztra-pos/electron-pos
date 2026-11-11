module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest/setup.js'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@noble|nativewind|react-native-css-interop|lucide-react-native|react-native-svg|react-native-reanimated|react-native-worklets)/)'],
  testTimeout: 120000,
  // the flow test talks to a real server: don't wait for its keep-alive sockets after the last test
  forceExit: true,
};