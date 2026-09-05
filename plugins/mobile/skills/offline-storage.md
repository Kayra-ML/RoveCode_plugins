# Offline Storage

## AsyncStorage vs MMKV

**AsyncStorage** is the legacy key-value store, async by design but slow due to bridge overhead.
It stores data as plain text with no encryption. Fine for small, infrequently read values.

**MMKV** (by WeChat) uses memory-mapped files and runs synchronously on the JS thread without
bridge calls. It is 10–30x faster than AsyncStorage for reads:

```ts
import { MMKV } from "react-native-mmkv";

const storage = new MMKV({ id: "user-storage" });

// Synchronous — no await needed
storage.set("theme", "dark");
const theme = storage.getString("theme"); // "dark"
storage.set("onboardingComplete", true);
const done = storage.getBoolean("onboardingComplete");

// Encrypted storage
const secureStorage = new MMKV({
  id: "secure-storage",
  encryptionKey: userDerivedKey,
});
```

Use MMKV for all new projects. Migrate AsyncStorage to MMKV with the `@react-native-async-storage/async-storage`
drop-in compatibility layer from MMKV docs.

## WatermelonDB for Complex Relational Data

WatermelonDB is built for large, complex datasets. It uses SQLite under the hood, is lazy by
default (queries only run when observed), and syncs efficiently with a server:

```ts
import { Database, Model, field, relation } from "@nozbe/watermelondb";

class Post extends Model {
  static table = "posts";
  @field("title") title!: string;
  @field("body") body!: string;
  @relation("authors", "author_id") author!: Author;
}

const database = new Database({
  adapter: new SQLiteAdapter({ schema }),
  modelClasses: [Post, Author, Comment],
});

// Observable queries — React components re-render when data changes
const posts = await database.get<Post>("posts").query(
  Q.where("published", true),
  Q.sortBy("created_at", Q.desc)
).fetch();
```

Use WatermelonDB when your app has multiple related models, large record counts, or
needs to sync with a backend.

## Offline-First Architecture

Offline-first means the app works fully without a network connection, syncing changes
when connectivity returns:

```
User Action → Local Storage → UI Update (instant)
                           ↓ (background)
                        Sync Queue → API → Confirm
```

**Optimistic updates:** apply the change locally immediately, then sync to the server.
Roll back if the server rejects it:

```ts
async function likePost(postId: string) {
  // 1. Update local state immediately (optimistic)
  await database.write(async () => {
    const post = await database.get<Post>("posts").find(postId);
    await post.update(p => { p.likesCount += 1; p.likedByMe = true; });
  });

  // 2. Add to sync queue
  await syncQueue.add({ type: "LIKE_POST", postId });

  // 3. Attempt sync (background)
  syncQueue.flush().catch(async () => {
    // 4. Rollback on failure
    await database.write(async () => {
      const post = await database.get<Post>("posts").find(postId);
      await post.update(p => { p.likesCount -= 1; p.likedByMe = false; });
    });
  });
}
```

## Conflict Resolution Strategies

When two devices edit the same record offline, you must resolve the conflict on sync:

**Last-write-wins:** the most recent timestamp wins. Simple, loses data when clocks are skewed.

**Server-wins:** server state always wins. Simple, but users lose local changes they expected
to keep.

**Merge:** combine non-conflicting fields. If two users edit different fields of the same
record, both edits are preserved.

**User-prompted:** show a diff UI and ask the user to choose. Best for high-stakes data.

For most apps, last-write-wins with a server-side `updatedAt` timestamp is sufficient.

## Network Status Detection with NetInfo

```ts
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState<string>("unknown");

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
      setConnectionType(state.type);
    });
    return unsubscribe;
  }, []);

  return { isConnected, connectionType, isCellular: connectionType === "cellular" };
}
```

Use `isInternetReachable` (not just `isConnected`) for actual internet access — a device
can be connected to WiFi without internet access.

## Background Sync

For syncing when the app is backgrounded, use Expo's background fetch or React Native
Background Fetch:

```ts
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

const SYNC_TASK = "background-sync";

TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await syncQueue.flush();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register on app start
await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
  minimumInterval: 15 * 60, // 15 minutes minimum (OS may delay)
  stopOnTerminate: false,
  startOnBoot: true,
});
```

Background fetch is best-effort — the OS may delay or skip it to conserve battery.

## Secure Storage for Sensitive Data

AsyncStorage and MMKV store data unencrypted (MMKV supports encryption but the key must
be stored somewhere). For tokens, passwords, and PII, use the device's secure enclave:

```ts
import * as SecureStore from "expo-secure-store";

// Write — stored in iOS Keychain / Android Keystore
await SecureStore.setItemAsync("auth_token", token, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

// Read
const token = await SecureStore.getItemAsync("auth_token");

// Delete on logout
await SecureStore.deleteItemAsync("auth_token");
```

SecureStore values are inaccessible to other apps and are backed by hardware security
where available (Secure Enclave on iOS, StrongBox on Android).

## Storage Size Limits

Platform limits to be aware of:
- AsyncStorage: 6MB default on Android (configurable), no enforced limit on iOS
- MMKV: limited by available RAM and disk — practical limit several GB
- SecureStore: 2KB per item limit on iOS (store a key, not the encrypted data itself)
- SQLite (WatermelonDB): effectively unlimited, limited by disk space

For large binary data (images, audio, video), store the file on disk and persist only the
file path in your key-value or relational store.