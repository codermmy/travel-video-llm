# Event Detail Page Rewrite (RN Native Only)

## TL;DR

> **Objective**: Rewrite `mobile/app/events/[eventId].tsx` UI using only React Native core components while preserving the existing data fetching + error handling logic and the current layout structure (cover/title/meta/stats/story/photo grid). This is a crash-mitigation rewrite for Android New Architecture.

**Non-negotiables**
- Keep API call path and logic intact: `eventApi.getEventDetail(eventId)` → `/api/v1/events/${eventId}` (`mobile/src/services/api/eventApi.ts`).
- Keep error/loading UX behavior intact (loading screen, error screen, retry/back).
- No new dependencies; do not introduce/require any third-party UI components.
- Remove usage of these third-party UI deps from this page: `react-native-safe-area-context`, `@expo/vector-icons`.

---

## Context & Starting Point

- Current implementation: `mobile/app/events/[eventId].tsx`
  - Uses `useSafeAreaInsets()` for padding + floating back button positioning.
  - Uses `Ionicons` for placeholders and meta/back icons.
  - Crash: occurs ~1s after entering this screen on Android New Architecture, after data has returned (suggests a render-time native crash or memory pressure during image/icon rendering, rather than network).

**Layout to preserve** (same information architecture)
1. Cover image
2. Title
3. Meta info (date/location)
4. Stats row (photoCount/status/emotion)
5. Story section
6. Photo grid

---

## Scope

IN
- Rewrite UI layout and styling inside `mobile/app/events/[eventId].tsx` only.
- Replace safe-area and icon usage with RN-core-only approaches.
- Optional safety hardening for photo grid rendering on Android (still RN-core-only).

OUT
- Any dependency changes / new libraries.
- Any API endpoint/path changes.
- Any navigation structure changes (route remains `/events/${id}` from `mobile/app/(tabs)/events.tsx`).

---

## Minimal Safe Implementation Strategy

The rewrite is staged to isolate crash causes and keep a safe rollback path.

Stage A (Minimum change to eliminate common native crash sources)
- Remove `react-native-safe-area-context` usage in this page.
- Remove `@expo/vector-icons` usage in this page.
- Keep all other logic/structure as close as possible.

Stage B (If crash persists)
- Address render-time pressure:
  - Virtualize the photo grid with RN `FlatList` + `numColumns=3`, or
  - Gate rendering (e.g., render first N thumbnails then “show more”) until stability is confirmed.

Stage C (If crash still persists)
- Add instrumentation and binary search sections to isolate culprit:
  - Temporarily disable cover image / photo grid rendering (one at a time) to identify which render branch triggers the crash.

---

## Key Risks & Mitigations

- Safe-area correctness without `react-native-safe-area-context`
  - Mitigation: use RN core `SafeAreaView` (if available in RN 0.81; it is) + Android `StatusBar.currentHeight` fallback.
- Loss of icon affordances
  - Mitigation: use text-based glyphs (e.g. "<", "\u2022") and label text ("日期"/"地点") to preserve readability.
- Photo grid causing memory churn / OOM on Android
  - Mitigation: switch grid to `FlatList` virtualization and consider `removeClippedSubviews` on Android.
- Behavioral regressions in data fetching
  - Mitigation: keep the existing fetch state machine and guards verbatim (mounted ref + requestId).

---

## Verification Strategy

No automated test infra exists for mobile UI in this repo; use manual verification + type/lint.

**Static checks**
- `cd mobile && npm run typecheck`
- `cd mobile && npm run lint`

**Android New Architecture reproduction**
- Run the same build mode that reproduces the crash (dev client / `expo run:android`).
- Capture evidence:
  - JS logs: Metro/Expo console output for `[EventDetail] ...`
  - Native logs: `adb logcat` around the crash timestamp (focus on `AndroidRuntime`, `ReactNative`, `libc`, `FATAL EXCEPTION`).

---

## TODOs (Step-by-step)

### 1) Baseline: reproduce + capture crash evidence

**What to do**
- Reproduce the crash on Android New Architecture with a known event that has photos.
- Capture:
  - The last JS logs from this screen (`[EventDetail] Fetching/Received data`).
  - The native stack trace from `adb logcat`.

**Acceptance criteria**
- You can answer: “Is this a native crash (process dies) or a JS fatal/redbox)?”
- You have a log snippet that points to a library/module or a render phase.

### 2) UI rewrite skeleton without third-party UI imports

**Files**
- `mobile/app/events/[eventId].tsx`

**What to do**
- Keep these blocks intact (copy as-is):
  - `useLocalSearchParams` → `eventId` extraction
  - state variables: `event/loading/error`
  - mounted/requestId guards
  - `fetchEventDetail` implementation and the `useEffect` that calls it
  - loading/error early returns
- Replace the top-level view tree with RN-core-only components.

**Acceptance criteria**
- The file has no imports from `react-native-safe-area-context` or `@expo/vector-icons`.
- The screen still loads, shows loading state, error state, and renders content when data returns.

### 3) Safe area replacement (RN core only)

**What to do**
- Replace `useSafeAreaInsets()` usage:
  - Bottom padding: use a fixed bottom padding + `SafeAreaView` for iOS, and/or a small constant for Android.
  - Back button top offset: compute a `topInset` using `StatusBar.currentHeight ?? 0` on Android; use `SafeAreaView` on iOS.
- Ensure the `StatusBar` configuration remains (currently `light-content`).

**Acceptance criteria**
- On Android: back button is not under the status bar.
- On iOS: content does not overlap the notch (within reasonable limits without third-party insets).

### 4) Icon removal and visual equivalents (RN core only)

**What to do**
- Replace `Ionicons` usages with:
  - Cover placeholder: centered `Text` (e.g. "暂无封面") or simple `View` mark.
  - Meta row: prefix labels like "日期:" / "地点:".
  - Back button: text glyph "<" or "返回".
- Ensure touch targets remain at least ~40x40 for the back button.

**Acceptance criteria**
- No `@expo/vector-icons` import remains in the file.
- Screen is navigable (back button works) and meta info remains readable.

### 5) Photo grid safety hardening (only if needed)

**Trigger**
- If crash still happens after Stage A, or if events can have large `photos.length` (suggested default threshold: >= 60).

**What to do**
- Convert photo grid rendering to a virtualized list using RN `FlatList` with `numColumns=3`.
- Add Android-specific stability/perf knobs if needed (e.g. `removeClippedSubviews` on Android, conservative `initialNumToRender`).
- Keep the same visual grid spacing and `PHOTO_SIZE` logic.

**Acceptance criteria**
- Entering the page with large photo counts no longer crashes.
- Scrolling remains smooth enough and images render progressively.

### 6) Manual QA checklist (regression-focused)

**What to verify**
- Loading state: spinner + “加载中...”
- Error state:
  - Missing eventId shows “缺少事件 ID”
  - Network/server failure shows “无法加载事件详情: ...”
  - “重试” triggers refetch and can recover
- Content state:
  - Cover renders or placeholder renders
  - Title renders
  - Date renders when `startTime` exists
  - Location renders when `locationName` exists
  - Stats row values render (photoCount/status/emotionTag)
  - Story renders only when `storyText` exists
  - Photo grid renders thumbnails (or “暂无照片”)

**Acceptance criteria**
- No crash after waiting >10 seconds on the screen (covers the “~1s later” crash symptom).
- No new warnings/errors in the console that indicate state updates after unmount.

---

## References (for the executor)

- Current screen to rewrite: `mobile/app/events/[eventId].tsx`
- Event detail API path (must not change): `mobile/src/services/api/eventApi.ts` (`getEventDetail` → `/api/v1/events/${eventId}`)
- Event detail types: `mobile/src/types/event.ts` (`EventDetail`, `EventPhotoItem`)
- Route entry into this screen: `mobile/app/(tabs)/events.tsx` (`router.push(`/events/${id}`)`)

---

## Notes on Android New Architecture

External evidence suggests `react-native-safe-area-context` has historically had compatibility issues or “experimental” support with Fabric/new architecture on Android (e.g. AppAndFlow’s docs + GitHub issues). While that doesn’t prove this runtime crash is caused by it, removing the dependency from the screen is a low-risk mitigation consistent with the rewrite constraints.
