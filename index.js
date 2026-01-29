// Polyfills MUST load before any other imports that might use them (e.g., Appwrite).
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

console.log('INDEX_BOOT: polyfills loaded');

import { registerRootComponent } from 'expo';

import App from './App';

// Surface the real underlying error early (before minified red-screen messages).
// This helps identify which module/import is crashing the bundle.
try {
	const errorUtils = global.ErrorUtils;
	if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
		const previousHandler =
			(typeof errorUtils.getGlobalHandler === 'function' && errorUtils.getGlobalHandler()) || null;

		errorUtils.setGlobalHandler((error, isFatal) => {
			try {
				console.error('GLOBAL_ERROR', {
					name: error?.name,
					message: error?.message,
					stack: error?.stack,
					isFatal,
				});
			} catch (_e) {
				// ignore
			}

			if (typeof previousHandler === 'function') {
				previousHandler(error, isFatal);
			}
		});
	}
} catch (_e) {
	// ignore
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
try {
	registerRootComponent(App);
} catch (e) {
	console.error('REGISTER_ROOT_COMPONENT_FAILED', e);
	throw e;
}
