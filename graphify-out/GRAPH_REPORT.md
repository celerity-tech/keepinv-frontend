# Graph Report - frontend  (2026-06-03)

## Corpus Check
- 54 files · ~26,900 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 408 nodes · 859 edges · 18 communities (10 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1a73f002`
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

## God Nodes (most connected - your core abstractions)
1. `Product` - 25 edges
2. `SupplierDetail` - 25 edges
3. `Location` - 22 edges
4. `AuditSession` - 20 edges
5. `Products` - 19 edges
6. `StockMovements` - 19 edges
7. `InventoryAudit` - 18 edges
8. `Categories` - 17 edges
9. `Locations` - 17 edges
10. `ProductForm` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Layout (App Shell Component)` --implements--> `Responsive App Shell (Rail + Drawer)`  [EXTRACTED]
  src/app/layout/layout.ts → src/app/layout/layout.html
- `Login Component` --implements--> `Keyboard-First Accessibility Pattern`  [EXTRACTED]
  src/app/modules/auth/login/login.ts → src/app/modules/auth/login/login.html
- `AssetWisePreset (PrimeNG Theme)` --conceptually_related_to--> `Keyboard-First Accessibility Pattern`  [INFERRED]
  src/app/theme/asset-wise-preset.ts → src/app/modules/auth/login/login.html
- `Layout (App Shell Component)` --implements--> `Signal-Based State Management`  [INFERRED]
  src/app/layout/layout.ts → src/app/modules/auth/services/auth.service.ts
- `authGuard (CanActivateFn)` --semantically_similar_to--> `guestGuard (CanActivateFn)`  [INFERRED] [semantically similar]
  src/app/modules/auth/guards/auth.guard.ts → src/app/modules/auth/guards/guest.guard.ts

## Hyperedges (group relationships)
- **Authentication Flow** — login_Login, authservice_AuthService, authmodel_AuthUser, authguard_authGuard, guestguard_guestGuard [EXTRACTED 0.95]
- **App Shell and Navigation** — layout_Layout, icon_LayoutIcon, categories_Categories, authservice_AuthService [EXTRACTED 0.85]
- **Bootstrap and Routing Configuration Chain** — main_bootstrap, appconfig_appConfig, approutes_routes, preset_AssetWisePreset [EXTRACTED 0.95]

## Communities (18 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (15): App, appConfig, routes, authGuard(), guestGuard(), authInterceptor(), NavItem, NavSection (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.16
Nodes (20): App (Root Component), appConfig (ApplicationConfig), Application Routes, authGuard (CanActivateFn), AuthUser / Login Models, AuthService, Categories Component, Shared Design Token Language (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (12): ProductDetail, NamedRecord, backendMessage(), httpErrorMessage(), FilterOption, ProductPage, ProductsService, Product (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (4): Locations, LocationsService, Location, LocationRequest

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (12): SupplierDetail, SuppliersService, Suppliers, platformMeta(), PlatformOption, Supplier, SUPPLIER_PLATFORMS, SupplierLink (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (32): AuditDetail, AuditRow, OUTCOME_ORDER, STATUS_CHIPS, StatusChip, Tally, TALLY_TONE, NamedRecord (+24 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (4): Categories, CategoriesService, Category, CategoryRequest

### Community 9 - "Community 9"
Cohesion: 0.40
Nodes (4): Categories — Keyboard Shortcuts, Custom shortcut, Focus management (no keypress required), Quick reference

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (13): environment, ApiResponse, PageMeta, PaginatedApiResponse, AddInventoryAuditScansResult, InventoryAuditPage, InventoryAuditService, StockMovementPage (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (14): StockMovementDetail, NamedRecord, StockMovementsService, StockMovements, MOVEMENT_TYPES, MovementDirection, movementTypeMeta(), MovementTypeOption (+6 more)

## Knowledge Gaps
- **30 isolated node(s):** `NavItem`, `NavSection`, `NEW_SHORTCUTS`, `NamedRecord`, `StatusChip` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `environment` connect `Community 13` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 7`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Product` connect `Community 3` to `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 11`, `Community 14`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **What connects `NavItem`, `NavSection`, `NEW_SHORTCUTS` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08534850640113797 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14393939393939395 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.07017543859649122 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.09176788124156546 - nodes in this community are weakly interconnected._
