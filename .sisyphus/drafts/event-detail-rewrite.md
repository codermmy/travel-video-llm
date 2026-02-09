# Draft: Event Detail Page Rewrite (RN Native Only)

## Requirements (confirmed)
- Rewrite `mobile/app/events/[eventId].tsx` in steps; plan only (no code).
- Keep existing data fetching + error handling logic; do not change API call paths.
- Layout to preserve: cover image + title + meta info + stats + story + photo grid.
- Must not use any third-party UI components (e.g. `expo-linear-gradient`, `@expo/vector-icons`, `react-native-safe-area-context`).
- Consider Android New Architecture stability; crash happens ~1s after navigation (data already returned).

## Decisions (confirmed)
- Photo grid safety hardening: conditional enable (start minimal; switch to FlatList/partition only if crash persists or photo count is large).
- Next step: start execution based on the plan.

## Technical Decisions
- TBD: Safe area handling without `react-native-safe-area-context` (likely `StatusBar` + `Platform.select` + padding + `SafeAreaView` from `react-native` if available, else manual top inset).
- Replace icons with RN-native fallback (prefer text + simple `View` shapes); prioritize stability over icon fidelity.

## Research Findings
- Current event detail page: `mobile/app/events/[eventId].tsx`
  - Third-party UI deps in this file: `react-native-safe-area-context` (`useSafeAreaInsets`), `@expo/vector-icons` (`Ionicons`).
  - Data fetch + error handling already guarded: `isMountedRef` + `latestRequestIdRef`, `try/catch/finally`, retry button.
  - Layout sections present: cover image + title + meta row (date/location) + stats row + story + photo grid.
  - Safe-area usage points: ScrollView `paddingBottom: insets.bottom + 20`; floating back button `top: insets.top + 10`.
- API call path for detail is `/api/v1/events/${eventId}` in `mobile/src/services/api/eventApi.ts` (must not change).
- Event detail type `EventDetail` in `mobile/src/types/event.ts`.

## Plan File
- Drafted executable plan: `.sisyphus/plans/event-detail-page-rewrite.md`

## Open Questions
- Which RN version / Expo SDK? (affects availability of `SafeAreaView` from `react-native`).
- Are we allowed to temporarily remove icons (fallback to text) to prioritize stability?

## Scope Boundaries
- INCLUDE: Only event detail page rewrite; minimal supporting utilities/components if already in repo.
- EXCLUDE: New dependencies; API changes; redesigning overall IA/navigation.
