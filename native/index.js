/**
 * Reztra POS — Android (tablet + phone)
 * @format
 */
import './global.css';
import { AppRegistry, LogBox } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

LogBox.ignoreLogs(['ImageBackground is deprecated']);
AppRegistry.registerComponent(appName, () => App);
