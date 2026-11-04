# Phase 6 — Connections / Providers Interaction Audit

**Audit date:** 2026-11-04  
**AlphaWay base:** `main` at `892bd1374507ea13a95f94979ecd3e86b415cd52`  
**Reference:** `luqman-v1/9router-go@e328decc174015514f49c7046d4bde57690bedc9`  
**Scope:** provider registry, provider nodes, credential connections, probes, models, quotas, usage, and proxy assignment. This is a capability audit, not a Go-backend port plan.

## Executive finding

AlphaWay does **not** currently implement the same domain model as 9router-go Connections.

9router-go separates:
- **Provider node:** a provider endpoint / protocol namespace, with a node ID, URL prefix, API type, and optional node-level capacity policy.
- **Provider connection:** an individual account or credential attached to a provider, with its own auth type, priority, enabled state, probe/error metadata, model assignment, and optional proxy-pool binding.
- **Proxy pool:** a separately managed egress resource that can be bound to a connection or selected by provider strategy.
- **Model state:** built-in/catalog models plus provider/node-specific custom models, disabled state, capability metadata, probe state, and usage.

AlphaWay currently has:
- Fixed OpenCode and CodeBuddy provider adapters.
- One SQLite-backed custom-provider record per configured custom provider ID. Each record contains one base URL, one credential, one protocol, a manually configured model list, and one enabled flag.
- A global egress/proxy pool, not provider-account-specific proxy assignment.
- A merged global `/v1/models` catalog, not a per-connection model-management API.

Therefore the current `ProvidersView` is a **partial equivalent**, not a drop-in implementation of `ConnectionsView` / `ProviderDetailView`. A custom-provider row must not be described as a provider node with multiple connections.

## Reference contract: 9router-go

The pinned frontend calls the following API surface:

| Capability | Reference endpoint / operation | Data boundary |
|---|---|---|
| List and create credential connections | `GET /api/connections`, `POST /api/connections` | A connection has `provider`, `authType`, credential/data, priority, active state, default model, and provider-specific data. |
| Validate a credential before saving | `POST /api/providers/validate` | Returns `supported` separately from `valid`; an unsupported probe is not an invalid credential. |
| Edit, reorder, delete, test a connection | `PUT /api/connections/:id`, `POST /api/connections/:id/reorder`, `DELETE /api/connections/:id`, `POST /api/providers/:id/test` | Probe status and errors belong to the connection, not just to a provider configuration form. |
| List and manage provider nodes | `GET /api/provider-nodes`, `POST /api/provider-nodes`, `PUT /api/provider-nodes/:id`, `DELETE /api/provider-nodes/:id` | A node defines a compatible endpoint/prefix; it is distinct from each credential connection routed through it. |
| Validate a compatible node | `POST /api/provider-nodes/validate` | Validates a node URL/API type/model independently of a saved credential connection. |
| Manage node capacity | `PUT /api/provider-nodes/:id/limits`, `POST /api/provider-nodes/:id/quota/reset` | Node-level RPM, prompt TPM, concurrency, queue timeout, token quota, contract expiry, and resettable usage accounting. |
| Read models from a connection | `GET /api/providers/:id/models` | Per-connection upstream model discovery, separate from the global dashboard catalog. |
| Manage custom model catalog | `GET/POST /api/models/custom`, `DELETE /api/models/custom/:key`, `DELETE /api/providers/:id/models` | Supports single and bulk model registration/import, including explicit added/skipped results. |
| Model capabilities and disabled state | `GET /api/models/caps?provider=...`, `GET /api/models/disabled`, `PUT /api/models/disabled/:provider`, `POST /api/models/auto-disable` | Capability metadata includes reasoning/vision/search/jailbreak/context/output limits; disabled state and batch actions are provider-scoped. |
| Connection and provider-level actions | `PUT /api/connections/:id` and provider strategy settings | Supports per-connection enablement, bulk provider toggles, priority/reorder, sticky/rotation strategy, and per-connection proxy-pool assignment. |

The reference `ProviderConnection` includes a distinct `authType`, masked credential hint, priority, active state, test status, last error/model, assigned model, and provider-specific data. `ProviderNode` has its own ID/type/name/prefix/base URL/API type and a separate limits object. The Add Connection flow also supports single and bulk credential entry, provider-specific validation, provider auth modes, and proxy-pool selection.

The provider detail view combines connection management with model discovery, filtering, capability/status chips, model selection, batch tests, enable/disable/delete, custom-model add/import, quota/usage information, and per-connection proxy assignment. Those interactions depend on the reference API and persistence described above; they are not all frontend-only features.

## AlphaWay contract: what exists now

### Provider registry and persistence

- `src/providers/index.ts` defines only `opencode | codebuddy | custom` as provider classes.
- `src/providers/opencode.ts` owns the OpenCode adapter and model discovery.
- `src/providers/codebuddy.ts` owns one fixed CodeBuddy International adapter and its device-OAuth lifecycle. CodeBuddy's model list is a fixed in-code catalog.
- `src/core/custom-providers.ts` defines `CustomProvider` as `id`, `name`, `baseUrl`, `apiKey`, `protocol: openai | anthropic`, `models[]`, `enabled`, and `createdAt`.
- SQLite `custom_providers` has the corresponding columns: `id`, `name`, `base_url`, `api_key`, `protocol`, `models`, `enabled`, `created_at`. URL-embedded credentials and API keys are encrypted at rest; public list responses redact credentials.
- There is no `connections`, `provider_connections`, or `provider_nodes` table in the current migration schema.

### Current routes and meaning

| AlphaWay endpoint | Actual responsibility | What it does not imply |
|---|---|---|
| `GET /api/custom-providers` | Lists custom-provider configuration with redacted URL/key fields and `hasApiKey`. | Does not list multiple credential connections for one provider node. |
| `POST /api/custom-providers` | Creates or updates one custom-provider config record. | Does not create a provider node plus an independently managed account/connection. |
| `DELETE /api/custom-providers/:id` | Deletes one custom-provider record. | Does not cascade through a connection/model/usage graph like a provider-node lifecycle. |
| `POST /api/custom-providers/test` | Sends one ping request to the configured OpenAI Chat or Anthropic Messages endpoint. | Does not persist a connection test status, enumerate models, test every configured model, or report a measured latency/model count. |
| `POST /api/codebuddy/oauth/start`, `GET /api/codebuddy/oauth/poll?state` | Runs the fixed CodeBuddy International device OAuth flow and stores the encrypted upstream credential server-side. | Is not a generic OAuth/cookie credential manager for arbitrary providers or multiple CodeBuddy accounts. |
| `GET /v1/models`, `GET /api/models` | Returns the merged global catalog: discovered OpenCode models, the fixed CodeBuddy model list, and configured models from enabled custom-provider records. | Is not per-connection upstream model discovery, per-node model state, or a model capability/health API. |
| `GET /api/proxy`, `POST /api/proxy`, `POST /api/proxy/test`, `POST /api/proxy/pool/test` | Manages and probes AlphaWay's global egress proxy/pool configuration. | Does not assign a specific pool to a custom provider/account connection. |

The application mounts `models`, `auth`, `proxy`, and `custom-providers` routes. It does not mount a generic connections, provider-nodes, or models-management route. Repository code search also found no implementations for `/api/connections`, `/api/provider-nodes`, `/api/providers/:id/models`, `/api/models/custom`, `/api/models/caps`, or `/api/models/disabled`.

### Routing, proxy, quota, and usage semantics

- Custom-model routing is by configured provider ID prefix or exact configured model ID. `getAllModels()` adds the provider prefix to model IDs without one.
- `forwardToCustomProvider()` uses the runtime's direct `fetch()` path. The custom-provider engine does not import or call AlphaWay's egress/proxy module. Custom-provider traffic therefore has no per-provider proxy-pool binding and does not use the current global egress selection path.
- AlphaWay's global egress pool and its rotation strategy are real, but they rotate egress paths. They are not equivalent to rotating multiple upstream provider-account credentials.
- AlphaWay Plans and rate limiting enforce policy for the **incoming managed API key**. They are not provider-node RPM/TPM/concurrency/queue/quota limits.
- Usage accounting classifies traffic as `opencode`, `codebuddy`, or `custom`. It does not attribute usage to an individual custom-provider credential/connection ID.

## Operation-by-operation capability matrix

| 9router-go interaction | AlphaWay status | Audit result |
|---|---|---|
| Fixed provider cards and custom provider CRUD | Partial | Present in `ProvidersView`; custom provider is one config row, not a node/connection hierarchy. |
| Provider-node create/edit/delete and URL-prefix rename | Missing | No matching API, domain type, or SQLite table. |
| Multiple API-key/OAuth/cookie connections per node | Missing | One credential per custom-provider row; CodeBuddy is one fixed adapter/credential. |
| Single connection create/edit/delete | Partial | Create/update/delete is available at the custom-provider-record level only. |
| Bulk credential import and per-provider bulk enable/disable | Missing / partial | A custom provider can be enabled/disabled individually; no connection collection or bulk connection operation exists. |
| Generic auth-type selector and provider-specific auth validation | Partial | Only OpenAI/Anthropic custom-provider protocols and the fixed CodeBuddy OAuth flow exist. |
| Per-connection probe, persistent status, last error, priority and reorder | Partial / missing | One explicit custom-provider ping exists; its result is not stored. No connection status, account priority, reorder, or account failover model exists. |
| Per-connection proxy binding | Missing | Global egress pool exists, but no `proxyPoolId` on custom-provider config and custom-provider forwarding bypasses egress. |
| Per-connection upstream model list | Missing | Only global `/v1/models` aggregation exists. |
| Model search/filter, capability chips, disabled-model state | Missing as provider-scoped API | The current provider screen categorizes global models; it has no per-node capability/status contract or provider-scoped disabled list. |
| Per-model and batch model probes | Missing | The custom-provider ping submits one model; no model batch test or stored per-model health state exists. |
| Add custom model / import from upstream / bulk model import | Partial / missing | Custom-provider model IDs are entered into the provider config manually; no upstream `/models` importer or custom-model registry API exists. |
| Capability metadata (vision, search, reasoning, jailbreak, context/output limits) | Missing | No AlphaWay model-capabilities endpoint or persisted capability registry exists. |
| Node-level quota/limits and usage reset | Missing | AlphaWay Plan limits apply to the caller's managed API key, a different enforcement boundary. |
| Per-connection usage/health | Missing | Usage is grouped by provider class, not credential connection. |
| Provider auth metadata/catalog | Partial | Fixed OpenCode/CodeBuddy adapters and a few custom-provider form presets; no equivalent dynamic provider catalog/connection auth registry is exposed by AlphaWay. |

## Concrete contract defect found in the existing AlphaWay UI

`ProvidersView.handleTestCurrent()` displays a success message containing latency and valid-model count:

- `Latency: ${res.latencyMs || 0}ms`
- `(${res.modelsCount ?? parsedModels.length} models valid)`

But `POST /api/custom-providers/test` returns only `{ ok, status, message }` on success (and `{ ok: false, status, error }` for an upstream HTTP failure). It does not return `latencyMs` or `modelsCount`. The fallback therefore manufactures a `0ms` latency and describes the operator-entered model list as if the models were validated. That is not evidence from the backend.

**Resolution — PR #18:** the dashboard now reports the returned upstream HTTP status (or AlphaWay HTTP status if no upstream response exists), submits only one configured/default probe model, and explicitly states that the configured model list was not validated. The fabricated latency and model-count claims were removed. The route and browser regression tests passed all four required CI jobs and both CodeQL analyzers; PR #18 merged at `f626f8d0026acc21a6ad7d5af019a2dfa9743ba4`.

## Recommended implementation order

1. **Completed existing-contract correction (PR #18):** the custom-provider probe now reports only returned HTTP status/result and accurately scopes the single-model test; route and browser regressions are in place.
2. **Product/architecture decision before backend work:** decide whether AlphaWay needs the full node-plus-multiple-connections domain (including multiple upstream credentials, per-account rotation, auth type, proxy binding, per-connection usage and node limits), or only a lighter custom-provider registry. Do not infer this design from the 9router-go component layout alone.
3. If full node/connection behavior is required, design SQLite entities and migration boundaries first: provider node, credential connection, encrypted credential material, priority/status history, model overrides/imports, proxy binding, and usage attribution. Preserve single-tenant AlphaWay and the existing Bun/Hono runtime.
4. Add authenticated API contracts and service tests before exposing corresponding controls. Provider probes and model discovery require bounded timeouts, safe URL/egress validation, credential redaction, and explicit unsupported-probe semantics.
5. Migrate the Connections UI in independently reviewable slices only after the matching route/persistence behavior exists.

## Explicit non-parity boundaries

Do not relabel or fake:
- A custom-provider record as a provider node with multiple connections.
- Egress proxy rotation as upstream account rotation.
- Managed API-key Plans as provider-node limits.
- `/v1/models` global catalog as per-connection model discovery.
- A successful single-model HTTP ping as model enumeration or model health validation.
- CodeBuddy device OAuth as a generic provider OAuth framework.
