# Navigation Patterns

## React Navigation v6 Setup

React Navigation is the standard navigation library for React Native. Install the core plus
the navigators you need:

```bash
npx expo install @react-navigation/native react-native-screens react-native-safe-area-context
npx expo install @react-navigation/native-stack @react-navigation/bottom-tabs @react-navigation/drawer
```

Wrap your app in `NavigationContainer`:

```ts
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Detail" component={DetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## TypeScript Type-Safe Navigation

Define a param list type for every navigator to get full TypeScript inference:

```ts
// types/navigation.ts
export type RootStackParamList = {
  Home: undefined;
  Detail: { itemId: string; title: string };
  Profile: { userId: string };
  Settings: undefined;
};

export type TabParamList = {
  Feed: undefined;
  Search: undefined;
  Notifications: undefined;
  Account: undefined;
};

// Type-safe navigation prop in a screen component
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";

type DetailProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Detail">;
  route: RouteProp<RootStackParamList, "Detail">;
};

function DetailScreen({ navigation, route }: DetailProps) {
  const { itemId, title } = route.params; // fully typed
  return <Button title="Go Back" onPress={() => navigation.goBack()} />;
}
```

Use `useNavigation<NativeStackNavigationProp<RootStackParamList>>()` in deeply nested
components to avoid prop drilling.

## Nested Navigators

A tabs navigator inside a stack navigator is the most common pattern:

```ts
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Detail" component={DetailScreen} />
    </Stack.Navigator>
  );
}
```

When navigating to a screen inside a nested navigator, use `navigate` with the nested route:
```ts
navigation.navigate("Tabs", { screen: "Feed" });
```

## Deep Linking Configuration

Deep links map URLs to screens. Configure in the `NavigationContainer`:

```ts
const linking = {
  prefixes: ["myapp://", "https://myapp.com"],
  config: {
    screens: {
      Home: "",
      Detail: "items/:itemId",
      Profile: "profile/:userId",
      Settings: "settings",
    },
  },
};

<NavigationContainer linking={linking}>
```

For universal links (iOS) and app links (Android), configure the associated domain in
your native project and verify the `apple-app-site-association` / `assetlinks.json` files
on your server.

Handle incoming links when the app is already open:
```ts
import { Linking } from "react-native";
useEffect(() => {
  const subscription = Linking.addEventListener("url", ({ url }) => {
    // navigate based on url
  });
  return () => subscription.remove();
}, []);
```

## Authentication Flow: Auth Gate Pattern

Never put auth screens and app screens in the same navigator — it creates back-navigation
security issues. Instead, conditionally render entire navigators:

```ts
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SplashScreen />;

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
```

When `isAuthenticated` changes from false to true, React Navigation automatically shows the
app navigator with no back button to the auth screens. The auth screens are unmounted and
not in the history stack.

## Back Button Handling on Android

Android's hardware back button fires `navigation.goBack()` by default. Override it for
specific screens:

```ts
import { useFocusEffect } from "@react-navigation/native";
import { BackHandler } from "react-native";

function ConfirmationScreen({ navigation }) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        // Return true to prevent default back behavior
        showExitConfirmationDialog();
        return true;
      });
      return () => sub.remove();
    }, [])
  );
}
```

## Screen Options and Header Customization

```ts
<Stack.Navigator
  screenOptions={{
    headerStyle: { backgroundColor: "#1a1a2e" },
    headerTintColor: "#fff",
    headerTitleStyle: { fontWeight: "700" },
    animation: "slide_from_right",
  }}
>
  <Stack.Screen
    name="Detail"
    component={DetailScreen}
    options={({ route }) => ({
      title: route.params.title,
      headerRight: () => <ShareButton />,
      headerBackTitle: "Back",
    })}
  />
</Stack.Navigator>
```

## Navigation State Persistence

Persist and restore navigation state across app restarts:

```ts
const PERSISTENCE_KEY = "NAVIGATION_STATE_V1";

export function App() {
  const [initialState, setInitialState] = useState();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function restore() {
      const savedState = await AsyncStorage.getItem(PERSISTENCE_KEY);
      if (savedState) setInitialState(JSON.parse(savedState));
      setIsReady(true);
    }
    if (!__DEV__) restore(); // only persist in production
    else setIsReady(true);
  }, []);

  if (!isReady) return null;

  return (
    <NavigationContainer
      initialState={initialState}
      onStateChange={(state) =>
        AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state))
      }
    >
      <RootNavigator />
    </NavigationContainer>
  );
}
```