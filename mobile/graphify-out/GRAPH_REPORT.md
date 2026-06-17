# Graph Report - mobile  (2026-06-17)

## Corpus Check
- 53 files · ~48,042 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 350 nodes · 382 edges · 45 communities (34 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d479bdf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `useAuth` - 13 edges
2. `scripts` - 7 edges
3. `useWsSubscription()` - 6 edges
4. `api` - 6 edges
5. `ApiError` - 5 edges
6. `Welcome to your Expo app 👋` - 5 edges
7. `editor.codeActionsOnSave` - 4 edges
8. `ProfileHeader()` - 4 edges
9. `LiquidGlass()` - 4 edges
10. `useWsStore` - 4 edges

## Surprising Connections (you probably didn't know these)
- `AppLayout()` --calls--> `useAuth`  [INFERRED]
  app/(app)/_layout.tsx → src/hooks/useAuth.ts
- `AuthGate()` --calls--> `useAuth`  [EXTRACTED]
  app/_layout.tsx → src/hooks/useAuth.ts
- `Index()` --calls--> `useAuth`  [EXTRACTED]
  app/index.tsx → src/hooks/useAuth.ts
- `ProfileHeader()` --calls--> `useAuth`  [EXTRACTED]
  src/components/shell/ProfileHeader.tsx → src/hooks/useAuth.ts
- `ProfileHeader()` --calls--> `useWsSubscription()`  [EXTRACTED]
  src/components/shell/ProfileHeader.tsx → src/hooks/useWebSocket.ts

## Import Cycles
- 1-file cycle: `metro.config.js -> metro.config.js`

## Communities (45 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (94): AdminChatRequest, AdminChatThreadDto, AdminStatsDto, AnuncioDto, AreaComunDto, AsambleaDto, CatLocal, CatServicio (+86 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (51): dependencies, expo, expo-av, expo-blur, expo-clipboard, expo-constants, expo-device, expo-document-picker (+43 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (21): Index(), AuthGate(), useAuth, EventHandler, useWsStore, useWsSubscription(), WsEvent, WsState (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (13): api, ApiError, loadAuthToken(), RequestOptions, saveAuthToken(), LoginResponse, ProfileResponse, UserDto (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (9): NotificacionDto, ReservaDto, getNotifTarget(), greeting(), ProfileHeader(), UserDisplay, Sheet(), SheetProps (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (17): devDependencies, babel-plugin-module-resolver, @config-plugins/react-native-webrtc, tailwindcss, @types/react, typescript, main, name (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (7): ALL_APP_ROUTES, AppLayout(), TabDef, GlassCardProps, LiquidGlass(), LiquidGlassProps, styles

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (6): fill, automatic-gradient, groups, supported-platforms, circles, squares

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (6): Get a fresh project, Get started, Join the community, Learn more, Other setup steps, Welcome to your Expo app 👋

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (5): ButtonProps, ButtonVariant, CONTAINER, LABEL, SPINNER

### Community 11 - "Community 11"
Cohesion: 0.40
Nodes (4): editor.codeActionsOnSave, source.fixAll, source.organizeImports, source.sortMembers

### Community 12 - "Community 12"
Cohesion: 0.67
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

## Knowledge Gaps
- **210 isolated node(s):** `recommendations`, `source.fixAll`, `source.organizeImports`, `source.sortMembers`, `config` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 1` to `Community 5`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `useAuth` connect `Community 2` to `Community 3`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `api` connect `Community 3` to `Community 2`, `Community 4`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `recommendations`, `source.fixAll`, `source.organizeImports` to the rest of the system?**
  _210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.021052631578947368 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0392156862745098 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0846774193548387 - nodes in this community are weakly interconnected._