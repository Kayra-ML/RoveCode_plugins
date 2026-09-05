# React Native Patterns

## Expo vs Bare React Native

**Expo (Managed Workflow)** is the right starting point for most apps:
- Single command setup: `npx create-expo-app MyApp`
- OTA updates via EAS Update without app store re-submission
- Pre-built native modules for camera, notifications, location, and sensors
- Expo Go for instant device testing during development

**Bare React Native** when:
- You need a native module with no Expo equivalent
- You are integrating into an existing native iOS/Android codebase
- You require full control over the Xcode/Android Studio build configuration

Expo's "bare workflow" bridges both: start managed, eject to bare when needed. The decision
is reversible but migration is costly. Default to Expo managed and only eject when blocked.

## StyleSheet.create vs Inline Styles

`StyleSheet.create()` validates styles at startup and sends the style object ID across the
bridge instead of the full style object on every render:

```ts
// Preferred — styles sent once, referenced by ID
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
});

function Screen() {
  return <View style={styles.container}><Text style={styles.title}>Hello</Text></View>;
}

// Avoid for static styles — creates a new object on every render
function Screen() {
  return <View style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>...</View>;
}
```

Inline styles are acceptable for dynamic values that change per render:
```ts
<View style={[styles.container, { opacity: animValue }]} />
```

## FlatList Optimization

FlatList is the primary virtualized list component. Without optimization, long lists cause
serious jank:

```ts
<FlatList
  data={items}
  // Required for keying — use a stable unique ID, not array index
  keyExtractor={(item) => item.id.toString()}

  // Enables skip-render for off-screen items
  removeClippedSubviews={true}

  // Pre-renders items before they scroll into view (default: 10)
  windowSize={5}

  // Tell RN exact item height to skip layout measurement
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}

  // Batch updates (reduce re-renders from rapid scroll)
  updateCellsBatchingPeriod={50}
  maxToRenderPerBatch={10}

  renderItem={({ item }) => <MemoizedItem item={item} />}
/>
```

Always `React.memo` the `renderItem` component. Without memoization, the entire list
re-renders on parent state changes.

## Platform-Specific Code

Use `Platform.select` for small differences, separate files for large ones:

```ts
import { Platform, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
  }),
});

// Platform-specific files — RN auto-resolves:
// Button.ios.tsx    ← used on iOS
// Button.android.tsx ← used on Android
// Button.tsx        ← fallback
```

## useCallback and useMemo for List Items

Callback props passed to list items must be stable across renders. Without `useCallback`,
the callback reference changes on every parent render, defeating `React.memo`:

```ts
function ItemList({ items, userId }) {
  // Stable reference — only changes when userId changes
  const handlePress = useCallback((itemId: string) => {
    navigation.navigate("Detail", { itemId, userId });
  }, [userId, navigation]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items]
  );

  return <FlatList data={sortedItems} renderItem={({ item }) =>
    <ItemRow item={item} onPress={handlePress} />
  } />;
}
```

## Reanimated 2 for Smooth Animations

React Native's built-in `Animated` API runs on the JS thread and can drop frames during
JS-heavy work. Reanimated 2 runs animations on the UI thread:

```ts
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming
} from "react-native-reanimated";

function BouncyButton({ onPress }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.95); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
      />
    </Animated.View>
  );
}
```

Use `withSpring` for natural bounce, `withTiming` for precise easing control, and
`withSequence` / `withDelay` for chained animations.

## SafeAreaView and Keyboard Avoidance

Always wrap screen content in `SafeAreaView` from `react-native-safe-area-context` (not
the built-in one) for correct insets on notched devices and dynamic islands:

```ts
import { SafeAreaView } from "react-native-safe-area-context";

function Screen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* form content */}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

## Image Optimization with FastImage

The default `Image` component re-downloads images on every mount and does not cache
aggressively. `react-native-fast-image` uses SDWebImage (iOS) and Glide (Android):

```ts
import FastImage from "react-native-fast-image";

<FastImage
  style={{ width: 200, height: 200 }}
  source={{
    uri: "https://cdn.example.com/avatar.jpg",
    priority: FastImage.priority.normal,
    cache: FastImage.cacheControl.immutable,
  }}
  resizeMode={FastImage.resizeMode.cover}
/>
```

Preload images before they appear on screen:
```ts
FastImage.preload([
  { uri: "https://cdn.example.com/hero.jpg" },
]);
```