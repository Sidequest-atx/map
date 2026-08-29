import { registerRootComponent } from "expo";

// The background-location task must be defined at module scope before the app
// mounts, so iOS can deliver Glasses Walk breadcrumbs to a headless relaunch.
import "./src/glasses/trail";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
