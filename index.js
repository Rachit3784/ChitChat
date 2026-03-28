/**
 * @format
 */

// Polyfill for crypto.getRandomValues BEFORE any imports
if (typeof global.crypto !== 'object') {
  console.warn('[Polyfill] global.crypto missing, applying JS fallback...');
  global.crypto = {
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };
}

// Try to load the native module, but don't crash if it fails
try {
  require('react-native-get-random-values');
} catch (e) {
  console.warn('[Polyfill] react-native-get-random-values failed to load:', e.message);
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
