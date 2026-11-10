module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: ['react-native-worklets/plugin'], // must stay last (Reanimated 4)
};
