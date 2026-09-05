# Push Notifications

## FCM and APNs Architecture

Push notifications flow through two separate systems depending on platform:

**Firebase Cloud Messaging (FCM)** handles Android push delivery (and optionally iOS via FCM
routing to APNs). Your server sends a message to FCM; FCM delivers it to the device.

**Apple Push Notification service (APNs)** is the only way to deliver push notifications to
iOS devices. All push messages to iOS ultimately go through APNs, whether sent directly or
via FCM.

The flow:
```
Your Server → FCM API → FCM servers → Android device
Your Server → APNs API → Apple servers → iOS device
Your Server → FCM API → FCM → APNs → iOS device (FCM routing)
```

For React Native, use Expo Notifications or React Native Firebase to abstract this complexity.

## Expo Notifications

Expo Notifications provides a unified API across iOS and Android:

```ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  // projectId from app.json → extra.eas.projectId
  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  })).data;

  // Store token on your server, associated with the user
  await api.registerPushToken(token);
  return token;
}
```

## Permission Request Timing

Never request notification permission on app launch. Users who see a permission prompt
before they understand the app's value deny it at a rate above 70%.

Best practice:
1. Let the user experience the app's value first
2. Show an in-app explainer screen: "Stay updated on your orders" with a "Enable notifications"
   button
3. Only call `requestPermissionsAsync()` after the user taps that button
4. If denied, provide a path to enable in Settings: `Linking.openSettings()`

```ts
function NotificationPromptScreen() {
  async function handleEnable() {
    const token = await registerForPushNotifications();
    if (!token) {
      Alert.alert(
        "Notifications blocked",
        "Open Settings to enable notifications for this app.",
        [{ text: "Open Settings", onPress: () => Linking.openSettings() }]
      );
    }
  }
  return <Button title="Enable Notifications" onPress={handleEnable} />;
}
```

## Notification Categories and Actions

Interactive notifications let users act without opening the app:

```ts
await Notifications.setNotificationCategoryAsync("message", [
  {
    identifier: "reply",
    buttonTitle: "Reply",
    textInput: { submitButtonTitle: "Send", placeholder: "Type a reply..." },
  },
  {
    identifier: "mark-read",
    buttonTitle: "Mark as Read",
    isDestructive: false,
  },
]);
```

Handle actions in your notification response listener:
```ts
Notifications.addNotificationResponseReceivedListener((response) => {
  const { actionIdentifier, userText } = response;
  if (actionIdentifier === "reply") {
    sendReply(response.notification.request.content.data.messageId, userText);
  }
});
```

## Background vs Foreground Notifications

**Foreground notifications:** app is open. Controlled by `setNotificationHandler` — you decide
whether to show an alert, play sound, or set a badge.

**Background notifications:** app is closed or backgrounded. The OS shows the notification
directly without running your JS. The user can tap to bring the app to the foreground.

**Silent/data notifications:** a notification with `content-available: 1` (iOS) that wakes
the app in the background briefly to process data without showing a UI. Use for background
sync, not for user-visible updates. iOS heavily throttles these.

```ts
// Add listener for taps on notifications (foreground and background)
const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  if (data.screen) {
    navigation.navigate(data.screen, data.params);
  }
});
return () => subscription.remove();
```

## Deep Linking from Notifications

Include navigation data in the notification payload:

```json
{
  "to": "ExponentPushToken[xxx]",
  "title": "New message from Alice",
  "body": "Hey, are you free tomorrow?",
  "data": {
    "screen": "Conversation",
    "params": { "conversationId": "conv_123" }
  }
}
```

Handle on both cold start and foreground tap:
```ts
// Cold start — app was not running
const lastNotification = await Notifications.getLastNotificationResponseAsync();
if (lastNotification) handleNotificationTap(lastNotification);

// App running — user taps notification
Notifications.addNotificationResponseReceivedListener(handleNotificationTap);
```

## Notification Scheduling

Schedule local notifications without a server:

```ts
// Schedule a reminder 1 hour from now
await Notifications.scheduleNotificationAsync({
  content: { title: "Reminder", body: "Check your tasks for today" },
  trigger: { seconds: 3600 },
});

// Repeating notification at a specific time
await Notifications.scheduleNotificationAsync({
  content: { title: "Daily standup", body: "Time for your standup!" },
  trigger: {
    hour: 9,
    minute: 30,
    repeats: true,
  },
});

// Cancel all scheduled notifications
await Notifications.cancelAllScheduledNotificationsAsync();
```

## Android Notification Channels

Android 8+ requires notification channels. Each channel has its own sound and importance level:

```ts
if (Platform.OS === "android") {
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync("updates", {
    name: "App Updates",
    importance: Notifications.AndroidImportance.LOW,
  });
}
```

## Token Refresh Handling

Push tokens expire or change when the user reinstalls the app, restores from backup, or
in some OS update scenarios. Always handle token refresh:

```ts
Notifications.addPushTokenListener(async (token) => {
  // Token changed — update on server
  await api.updatePushToken(oldToken, token.data);
});
```

On logout, always unregister the token from your server and remove it locally to stop
notifications for the signed-out user.