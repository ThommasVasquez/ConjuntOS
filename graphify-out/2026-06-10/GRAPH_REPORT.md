# Graph Report - .  (2026-06-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 578 nodes · 797 edges · 79 communities (51 shown, 28 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee208829`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Analytics Event Batching|Analytics Event Batching]]
- [[_COMMUNITY_Analytics Event Batching|Analytics Event Batching]]
- [[_COMMUNITY_Analytics HTTP Client|Analytics HTTP Client]]
- [[_COMMUNITY_Analytics Request Retry|Analytics Request Retry]]
- [[_COMMUNITY_Minified Server Bundle|Minified Server Bundle]]
- [[_COMMUNITY_Minified Server Bundle|Minified Server Bundle]]
- [[_COMMUNITY_Supabase User Creation|Supabase User Creation]]
- [[_COMMUNITY_Realtime Auth Worker|Realtime Auth Worker]]
- [[_COMMUNITY_App Server Actions|App Server Actions]]
- [[_COMMUNITY_Supabase Admin Auth API|Supabase Admin Auth API]]
- [[_COMMUNITY_Supabase Admin Auth API|Supabase Admin Auth API]]
- [[_COMMUNITY_Supabase Admin Auth API|Supabase Admin Auth API]]
- [[_COMMUNITY_Minified Server Bundle|Minified Server Bundle]]
- [[_COMMUNITY_Minified Server Bundle|Minified Server Bundle]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Middleware Bundle Internals|Middleware Bundle Internals]]
- [[_COMMUNITY_Middleware Bundle Internals|Middleware Bundle Internals]]
- [[_COMMUNITY_OpenTelemetry Metrics API|OpenTelemetry Metrics API]]
- [[_COMMUNITY_Postgres Wire Protocol|Postgres Wire Protocol]]
- [[_COMMUNITY_Postgres Wire Protocol|Postgres Wire Protocol]]
- [[_COMMUNITY_Next.js Request Handler|Next.js Request Handler]]
- [[_COMMUNITY_Postgres Result Parsing|Postgres Result Parsing]]
- [[_COMMUNITY_Postgres Client Pooling|Postgres Client Pooling]]
- [[_COMMUNITY_Next.js URL Parsing|Next.js URL Parsing]]
- [[_COMMUNITY_Minified Middleware Bundle|Minified Middleware Bundle]]
- [[_COMMUNITY_Minified Middleware Bundle|Minified Middleware Bundle]]
- [[_COMMUNITY_Minified Middleware Bundle|Minified Middleware Bundle]]
- [[_COMMUNITY_Minified Middleware Bundle|Minified Middleware Bundle]]
- [[_COMMUNITY_Middleware Response Helpers|Middleware Response Helpers]]
- [[_COMMUNITY_Realtime Auth Worker|Realtime Auth Worker]]
- [[_COMMUNITY_Realtime Auth Worker|Realtime Auth Worker]]
- [[_COMMUNITY_Minified Utility Code|Minified Utility Code]]
- [[_COMMUNITY_Minified Decode Utilities|Minified Decode Utilities]]
- [[_COMMUNITY_Task Queue Concurrency|Task Queue Concurrency]]
- [[_COMMUNITY_Minified Utility Code|Minified Utility Code]]
- [[_COMMUNITY_Response Redirect Helpers|Response Redirect Helpers]]
- [[_COMMUNITY_OpenTelemetry Metrics API|OpenTelemetry Metrics API]]
- [[_COMMUNITY_Route Tree Sorting|Route Tree Sorting]]
- [[_COMMUNITY_OpenTelemetry Metrics API|OpenTelemetry Metrics API]]
- [[_COMMUNITY_Route Tree Sorting|Route Tree Sorting]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]
- [[_COMMUNITY_Edge Request Handling|Edge Request Handling]]
- [[_COMMUNITY_Minified Error Logging|Minified Error Logging]]
- [[_COMMUNITY_Minified Error Logging|Minified Error Logging]]
- [[_COMMUNITY_Route Tree Sorting|Route Tree Sorting]]
- [[_COMMUNITY_Middleware Response Helpers|Middleware Response Helpers]]
- [[_COMMUNITY_Middleware Response Helpers|Middleware Response Helpers]]
- [[_COMMUNITY_Assembly Voting API|Assembly Voting API]]
- [[_COMMUNITY_Next.js Rendering Pipeline|Next.js Rendering Pipeline]]
- [[_COMMUNITY_Next.js Request Handler|Next.js Request Handler]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]
- [[_COMMUNITY_Edge Routing Worker|Edge Routing Worker]]

## God Nodes (most connected - your core abstractions)
1. `getOrCreateActiveAsamblea()` - 31 edges
2. `parseAsambleaState()` - 30 edges
3. `saveAsambleaState()` - 21 edges
4. `compilerOptions` - 16 edges
5. `ModelProxy` - 14 edges
6. `logError()` - 10 edges
7. `conjunto-app v0.1.0 Application` - 9 edges
8. `discoverUrl()` - 8 edges
9. `useViewTransition()` - 7 edges
10. `POST()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Logo: Energy Soft Media vendor wordmark (SVG)` --conceptually_related_to--> `conjunto-app v0.1.0 Application`  [AMBIGUOUS]
  public/energysoftmedia.svg → build_log.txt
- `Photo: aerial night view of futuristic clubhouse/event hall in residential complex` --conceptually_related_to--> `Reservas (Amenity Booking) Routes`  [AMBIGUOUS]
  public/images/hall.png → build_log.txt
- `Icon: file/document glyph (Next.js template asset)` --conceptually_related_to--> `Next.js Project README (create-next-app)`  [INFERRED]
  public/file.svg → README.md
- `Icon: globe glyph (Next.js template asset)` --conceptually_related_to--> `Next.js Project README (create-next-app)`  [INFERRED]
  public/globe.svg → README.md
- `Icon: browser window glyph (Next.js template asset)` --conceptually_related_to--> `Next.js Project README (create-next-app)`  [INFERRED]
  public/window.svg → README.md

## Import Cycles
- None detected.

## Communities (79 total, 28 thin omitted)

### Community 0 - "Analytics Event Batching"
Cohesion: 0.11
Nodes (45): GET(), injectDbEnv(), POST(), GET(), injectDbEnv(), POST(), AgendaItem, AsambleaAsistencia (+37 more)

### Community 1 - "Analytics Event Batching"
Cohesion: 0.06
Nodes (16): inter, jetbrainsMono, metadata, montserrat, plusJakartaSans, viewport, metadata, Providers() (+8 more)

### Community 2 - "Analytics HTTP Client"
Cohesion: 0.06
Nodes (8): injectDbEnv(), POST(), GET(), GET(), GET(), GET(), GET(), { auth, signIn, signOut, handlers }

### Community 3 - "Analytics Request Retry"
Cohesion: 0.06
Nodes (32): dependencies, @auth/prisma-adapter, @google/generative-ai, gsap, @gsap/react, @hookform/resolvers, lucide-react, @mmmike/web-push (+24 more)

### Community 4 - "Minified Server Bundle"
Cohesion: 0.09
Nodes (17): POST(), vapidKeys, db, proxyCache, GET(), PUT(), POST(), PUT() (+9 more)

### Community 5 - "Minified Server Bundle"
Cohesion: 0.13
Nodes (24): Next.js Agent Rules, conjunto-app v0.1.0 Application, Next.js Production Build Log, Next.js 15.1.0 Framework, Prisma Client v7.6.0, Reservas (Amenity Booking) Routes, Project Instructions (CLAUDE.md), Logo: Energy Soft Media vendor wordmark (SVG) (+16 more)

### Community 6 - "Supabase User Creation"
Cohesion: 0.09
Nodes (6): FeedItem, CelebrationModalProps, MODULES, SearchContext, SearchModalProps, SUGGESTIONS

### Community 7 - "Realtime Auth Worker"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "App Server Actions"
Cohesion: 0.12
Nodes (16): compat, __dirname, __filename, devDependencies, @cloudflare/next-on-pages, eslint, prisma, tailwindcss (+8 more)

### Community 9 - "Supabase Admin Auth API"
Cohesion: 0.12
Nodes (4): Conversation, Message, ResidentInfo, supabase

### Community 12 - "Minified Server Bundle"
Cohesion: 0.19
Nodes (8): ProfileContent(), Theme, ThemeContext, ThemeContextType, ThemeProvider(), useTheme(), BrandedFooter(), BrandedFooterProps

### Community 13 - "Minified Server Bundle"
Cohesion: 0.19
Nodes (7): GET(), POST(), DiagnosticResult, GET(), discoverUrl(), GET(), GET()

### Community 14 - "Auth Middleware"
Cohesion: 0.21
Nodes (10): CitofoniaPage(), IPaquete, IVisita, Tab, CallContext, CallContextType, CallProvider(), CallState (+2 more)

### Community 15 - "Middleware Bundle Internals"
Cohesion: 0.20
Nodes (3): CATEGORIES, Clasificado, BottomSheetProps

### Community 16 - "Middleware Bundle Internals"
Cohesion: 0.22
Nodes (3): AgendaItem, ResidentOpinion, SpeakingTurn

### Community 19 - "Postgres Wire Protocol"
Cohesion: 0.43
Nodes (6): buildUserPrompt(), callGemini(), getMockResponse(), POST(), SearchBody, SearchContext

### Community 22 - "Postgres Result Parsing"
Cohesion: 0.50
Nodes (3): GET(), MOCK_CLASIFICADOS, POST()

### Community 24 - "Postgres Client Pooling"
Cohesion: 0.83
Nodes (3): getLocalFallback(), injectDbEnv(), POST()

### Community 25 - "Next.js URL Parsing"
Cohesion: 0.50
Nodes (3): GET(), MOCK_INMUEBLES, POST()

### Community 26 - "Minified Middleware Bundle"
Cohesion: 0.83
Nodes (3): GET(), injectDbEnv(), POST()

### Community 29 - "Minified Middleware Bundle"
Cohesion: 0.50
Nodes (3): exclude, include, version

### Community 30 - "Middleware Response Helpers"
Cohesion: 0.83
Nodes (3): check(), resolveAny, resolveCw

### Community 31 - "Realtime Auth Worker"
Cohesion: 0.67
Nodes (3): regions, run(), testRegion()

### Community 33 - "Minified Utility Code"
Cohesion: 0.50
Nodes (3): { createClient }, dotenv, supabase

### Community 34 - "Minified Decode Utilities"
Cohesion: 0.67
Nodes (3): connections, main(), tryConnect()

### Community 35 - "Task Queue Concurrency"
Cohesion: 0.67
Nodes (3): passwords, run(), test()

### Community 36 - "Minified Utility Code"
Cohesion: 0.83
Nodes (3): getLocalTranslation(), injectDbEnv(), POST()

## Ambiguous Edges - Review These
- `conjunto-app v0.1.0 Application` → `Logo: Energy Soft Media vendor wordmark (SVG)`  [AMBIGUOUS]
  public/energysoftmedia.svg · relation: conceptually_related_to
- `Reservas (Amenity Booking) Routes` → `Photo: aerial night view of futuristic clubhouse/event hall in residential complex`  [AMBIGUOUS]
  public/images/hall.png · relation: conceptually_related_to

## Knowledge Gaps
- **155 isolated node(s):** `version`, `include`, `exclude`, `__filename`, `__dirname` (+150 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `conjunto-app v0.1.0 Application` and `Logo: Energy Soft Media vendor wordmark (SVG)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Reservas (Amenity Booking) Routes` and `Photo: aerial night view of futuristic clubhouse/event hall in residential complex`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ModelProxy` connect `Supabase Admin Auth API` to `Minified Server Bundle`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `PUT()` connect `Postgres Wire Protocol` to `Analytics HTTP Client`, `Minified Server Bundle`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `logError()` connect `Supabase Admin Auth API` to `Minified Server Bundle`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `version`, `include`, `exclude` to the rest of the system?**
  _155 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Analytics Event Batching` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._