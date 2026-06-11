# pack-movie

Movie recommendations for the Embabel assistant — grounded in what the user
has rated, what's actually streamable in their country, and live OMDb
metadata.

This pack is a reimagining of the original
[`movie-finder`](https://github.com/embabel/movie-finder) reference agent as
an Embabel assistant pack. Where `movie-finder` was a standalone Spring Boot
app with hand-coded `@Action` planning, JPA persistence, and its own UI,
this pack ships only the things a pack can ship: APIs, types, a workflow
skill, and a personality. The chat LLM owns the workflow; the assistant
owns the persistence and the UI.

## What's in the pack

| Directory | What it contributes |
|---|---|
| `apis/` | Two OpenAPI 3 specs — OMDb (film metadata) and Streaming Availability (per-country streaming options). Calls go through `gateway.omdb.*` / `gateway.streamingAvailability.*` from `execute_javascript` / `execute_python`. |
| `types/movies.yml` | `Movie` (canonical metadata, keyed by IMDb id) and `MovieRating` (the user's score for a Movie). Read/written via the workspace repository tools. `MovieRating` declares `userAnchor: { predicate: RATED, direction: from-user }`, so the assistant auto-emits `(User)-[:RATED]->(MovieRating)` on every `create_entry`. |
| `skills/recommend-movie/` | "What should I watch?" / "where can I stream X?" — owns the OMDb + Streaming Availability workflow and the cardinal rules (don't default the country; the response field is `streamingOptions`, not `streamingInfo`). Activates only for the recommend / availability paths. |
| `skills/rate-movie/` | "I just watched X, give it N" — ensures the `Movie` record exists, then creates or updates the `MovieRating` with an explicit `OF` edge back to the Movie. The `RATED` user edge is automatic. |
| `skills/recall-movies/` | "What did I think of X?" / "what have I rated?" — reads `MovieRating` via `list_entries` for single-title recall, or Cypher for anything cross-cutting. |
| `personalities/roger/` | Ebert-style film-critic voice — used only by the recommend write-up. Rate confirmations and recall replies stay in the default assistant voice. |
| `src/api/movie.ts` | **Compiled convenience methods** authored in TypeScript: `movie.streaming` and `movie.details`. Thin orchestration over the raw OMDb / Streaming-Availability gateway ops; built to `dist/` and registered as `gateway.movie.*`. See "Compiled methods" below. |

## Why no MovieBuff entity?

The original `movie-finder` kept a `MovieBuff` JPA entity carrying the
user's country code, hobbies, preferred streaming services, "movie likes /
dislikes", and free-form `about` text. None of that is redeclared here.
The assistant already extracts and stores user-profile facts via the DICE
proposition pipeline ("user lives in AU", "user uses Netflix and Stan",
"user likes Tarantino") — re-modelling them as a parallel `MovieBuff`
entity would just create a second source of truth that drifts from the
proposition graph. The skill recalls those facts the same way it recalls
anything else about the user.

## Required environment variables

The assistant process needs both API keys set as environment variables:

```bash
export OMDB_API_KEY=<from https://www.omdbapi.com/apikey.aspx>
export X_RAPIDAPI_KEY=<from https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability/>
```

Both keys are deployment-level (one OMDb account, one RapidAPI account),
not per-user OAuth. End users do not need to authorize anything.

## Installation

Install via the assistant's pack manager. On install the pack contributes:

- `gateway.omdb.*` and `gateway.streamingAvailability.*` tool surfaces
  (visible inside `execute_javascript` / `execute_python`).
- The `Movie` and `MovieRating` types, surfaced through the workspace
  repository tools (`describe`, `list_entries`, `create_entry`,
  `update_entry`, `delete_entry`).
- The three skills above, activated by the chat LLM by name match against
  user phrasing.
- The `roger` personality, available to `recommend-movie` write-ups.

Ratings persist into the workspace graph store via
`NamedEntityDataRepository`. Both edges land on `create_entry` for a
`MovieRating` — the explicit `OF` to the Movie and the implicit
`RATED` to the User — so the schema projector exposes them to the
Cypher tool and the DICE proposition pipeline.

## Compiled methods (TypeScript)

Convenience methods in the `movie` namespace are authored in TypeScript under
`src/api/` and **compiled** — not declared in YAML. Each is a thin orchestration
over the pack's raw gateway ops. See `specs/PACK_COMPILER.md` in the assistant
repo for the full pipeline.

**Authoring.** One `export async function` per method, in
`src/api/<namespace>.ts` (the filename is the gateway namespace — `movie.ts` →
`gateway.movie.*`). Signature: `(ctx, args) => Promise<T>`. The JSDoc first
paragraph becomes the LLM-facing description; the `args` and return types become
the input/output JSON Schema.

```ts
import type { GenericGatewayContext } from "@embabel/runtime-types";

/** Where this movie is streaming in a country (ISO-3166 alpha-2, lowercase). */
export async function streaming(
  ctx: GenericGatewayContext,
  args: { id: string; country: string },
): Promise<unknown> {
  return ctx.streamingAvailability.getShow({ id: args.id, country: args.country });
}
```

**Where it runs.** The compiled method body runs **in the pack sandbox**; the
gateway ops it calls (`ctx.streamingAvailability.*`, `ctx.omdb.*`) route back
through the **server**, which holds the API keys and makes the external HTTP
call. So convenience/computation is local; every credentialed call is
server-mediated.

**Build.**

```bash
npm install          # links @embabel/runtime-types (file: dep) + typescript
npm run build        # tsc -> dist/movie.js, then embabel-build-manifest -> dist/manifest.json
npm test             # vitest — handlers tested against a mocked gateway
npm run typecheck    # tsc --noEmit
```

`npm run build` produces:

- `dist/movie.js` — the compiled CommonJS handlers (seeded into the sandbox at
  `/workspace/pack-handlers/pack-movie/` and `require()`d there).
- `dist/manifest.json` — `{ version, entries: [{ namespace, name, description,
  inputSchema, outputSchema }] }`, read by the assistant's `PackHandlerLoader`
  to register `gateway.movie.streaming` / `gateway.movie.details` on the typed
  surface the LLM sees.

The workspace install step (`WorkspaceBootstrap`) runs `npm install && npm run
build` automatically when the pack is cloned, so `dist/` is regenerated on
install. `dist/` is gitignored.

**Adding a method:** add an `export async function` to `src/api/movie.ts`, add a
test in `tests/`, run `npm run build`. Done — no Kotlin, no YAML.
