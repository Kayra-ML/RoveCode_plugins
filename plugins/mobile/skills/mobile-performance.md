# Mobile Performance

## The Three Threads

React Native runs on three separate threads. Understanding which work happens where is the
foundation of performance optimization:

**JavaScript Thread** — all React rendering logic, state updates, and business logic. Runs
on the JS engine (Hermes or V8). If this thread is busy, the app feels unresponsive.

**UI Thread (Main Thread)** — all native view updates and touch event processing. If this
thread is blocked, the app appears frozen. The UI thread must complete 60 frames per second
(16ms per frame) for smooth animation.

**Native Thread** — async native module calls (networking, file I/O, storage). Generally
operates independently without blocking the other threads.

The "bridge" is the bottleneck: serialized JSON messages passed between JS and native threads.
Heavy bridge traffic causes jank.

## Hermes Engine

Hermes is Meta's JavaScript engine optimized for React Native. Enable it in all new projects:

```gradle
// android/app/build.gradle
project.ext.react = [
    enableHermes: true
]
```

Hermes benefits:
- Pre-compiled bytecode — reduces time-to-interactive by 25–50%
- Lower memory footprint than V8
- Faster garbage collection tuned for mobile
- Built-in Chrome debugging support

iOS enables Hermes automatically in RN 0.70+. For older versions, set `hermes_enabled` to
`true` in your Podfile.

## New Architecture: JSI, Fabric, TurboModules

The legacy bridge serializes all JS↔native communication to JSON. The New Architecture
replaces it with direct C++ bindings:

**JSI (JavaScript Interface)** — C++ API that lets JS hold references to native objects and
call native methods synchronously without serialization.

**Fabric** — the new rendering system. The UI tree is computed in C++ instead of crossing
the bridge. Enables concurrent rendering and smoother interactions.

**TurboModules** — native modules loaded lazily, accessed via JSI. Eliminates the upfront
cost of registering all native modules at startup.

Enable in React Native 0.71+:
```ts
// android/gradle.properties
newArchEnabled=true
// ios/Podfile
:hermes_enabled => true
```

## Avoiding Bridge Bottlenecks

Even without the New Architecture, minimize bridge traffic:

```ts
// BAD — measures layout on every render, crossing the bridge
function BadComponent() {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* triggers re-render and another bridge call */}
    </View>
  );
}

// GOOD — use useWindowDimensions for screen dimensions (no bridge call)
import { useWindowDimensions } from "react-native";
function GoodComponent() {
  const { width } = useWindowDimensions();
  return <View style={{ width: width * 0.9 }} />;
}
```

Pass configuration to native modules in one call rather than many small calls. Batch
style updates with `StyleSheet.create` to reduce bridge serialization.

## InteractionManager.runAfterInteractions

Defer expensive work until after animations and interactions complete:

```ts
import { InteractionManager } from "react-native";

function ExpensiveScreen() {
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      // This runs after navigation transition animation completes
      loadExpensiveData().then(() => setDataLoaded(true));
    });
    return () => task.cancel();
  }, []);
}
```

Never load heavy data synchronously during navigation transitions. The JS thread is busy
running the animation; competing work causes dropped frames.

## useFocusEffect for Screen Focus Work

Data that should refresh when returning to a screen belongs in `useFocusEffect`, not
`useEffect`:

```ts
import { useFocusEffect } from "@react-navigation/native";

function ProfileScreen() {
  useFocusEffect(
    useCallback(() => {
      // Runs every time screen comes into focus
      loadProfile();
      return () => {
        // Optional cleanup when screen loses focus
      };
    }, [])
  );
}
```

`useEffect` runs once on mount. `useFocusEffect` runs on every focus — critical for screens
that display data that can change while the user navigates away.

## Preventing Unnecessary Re-Renders

React Native re-renders are expensive because they cross the bridge to update native views.
Profile with the React DevTools Profiler before optimizing:

```ts
// React.memo with custom comparison
const UserCard = React.memo(
  ({ user, onPress }: { user: User; onPress: (id: string) => void }) => {
    return <Pressable onPress={() => onPress(user.id)}><Text>{user.name}</Text></Pressable>;
  },
  (prev, next) => prev.user.id === next.user.id && prev.user.name === next.user.name
);

// Zustand selectors prevent re-renders on unrelated state changes
const userName = useStore((state) => state.user.name); // only re-renders when name changes
const user = useStore((state) => state.user);           // re-renders on any user property change
```

## Flipper Profiling

Flipper is the official debugging and profiling tool for React Native:

```bash
# Enable in development builds (disabled in production)
# iOS: Podfile includes FlipperKit by default in RN 0.62+
# Android: android/app/src/debug/java/.../ReactNativeFlipper.java
```

Key Flipper plugins for performance:
- **Hermes Debugger** — CPU profiling and heap snapshots
- **React DevTools** — component tree, props, renders
- **Network** — inspect all HTTP requests and responses
- **Layout** — inspect native view hierarchy and measure layout

## Perf Monitor

Enable the built-in performance monitor for quick frame rate inspection:

- Shake the device → "Perf Monitor" (development mode)
- Shows JS FPS and UI FPS in real time
- Target: both above 58 FPS during interactions
- JS FPS drops indicate JS thread overload
- UI FPS drops indicate expensive layout or native rendering

## Detecting Janky Animations

Janky animations (< 60 FPS) have two primary causes:

1. **JS thread overload:** state updates or logic running during animation. Move animations
   to Reanimated 2 (UI thread) to isolate from JS work.

2. **Expensive layout:** shadow, border-radius, and overflow on deeply nested views trigger
   expensive layout passes. Flatten view hierarchies and use `shouldRasterizeIOS` /
   `renderToHardwareTextureAndroid` for complex static layers:

```ts
<View
  shouldRasterizeIOS={true}
  renderToHardwareTextureAndroid={true}
  style={styles.complexCard}
>
  {/* Complex but rarely changing content */}
</View>
```

Measure first with the Perf Monitor. Optimize only confirmed bottlenecks.