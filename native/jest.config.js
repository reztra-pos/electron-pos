module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest/setup.js'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@noble|nativewind|react-native-css-interop|lucide-react-native|react-native-svg|react-native-reanimated|react-native-worklets)/)'],
  testTimeout: 120000,
};
