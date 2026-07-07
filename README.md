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
| `src/api/movie.ts` | The **`Movie` type** — a TypeScript class `extends Entity`. Its fields are the shape; its async methods (`movie.streaming`, `movie.details`, `movie.rate`, plus inherited `movie.neighbors`) are affordances callable on an in-scope object. Built to `dist/`. See "Type methods" below. |

## Sample queries

Run these in the Cypher console (Settings → Data → **Query**). Each virtual edge materializes on demand and
streams its stages in the console's **Trace** tab. Grouped by cost: instant (Neo4j only), generative (an LLM
call, ~20–40s), web-grounded (LLM + web search, ~30–60s).

> **Gotcha — keep virtual joins in the leading `MATCH` chain.** A virtual join (`SIMILAR_TO`, `SUGGESTS`,
> `HAS_REVIEW`, `HAS_MOVIE_TASTE_SUMMARY`, `AVAILABLE_ON`) is only materialized when it appears in the query's
> leading `MATCH` block. A virtual join placed **after a `WITH`** is NOT materialized (returns nothing). Put any
> `LIMIT`/`ORDER BY` at the END (after `RETURN`), and reach reviews by pinning a film (below), not by piping a
> recommendation subquery through a `WITH` into `HAS_REVIEW`.

**Instant**
```cypher
-- Your top-rated films
MATCH (me:AssistantUser)-[:RATED]->(r:MovieRating)
RETURN r.title, r.rating ORDER BY r.rating DESC, r.title LIMIT 15
```

**Generative (SIMILAR_TO / fan-IN summary / two-stage SUGGESTS)**
```cypher
-- Recommendations from films you LOVED, best-rated first, excluding what you've seen
MATCH (me:AssistantUser)-[:RATED]->(rt:MovieRating) WHERE rt.rating >= 8
MATCH (rt)-[:SIMILAR_TO]->(m:Movie)
WHERE NOT EXISTS { (me)-[:RATED]->(seen:MovieRating) WHERE seen.imdbId = m.imdbId }
RETURN DISTINCT m.title, m.year, m.director, m.imdbRating
ORDER BY m.imdbRating DESC LIMIT 15
```
```cypher
-- Your taste in ~100 words (a fan-IN aggregate node over all your ratings)
MATCH (me:AssistantUser)-[:HAS_MOVIE_TASTE_SUMMARY]->(ts:MovieTasteSummary)
RETURN ts.summary, ts.count
```
```cypher
-- Recommendations from your WHOLE taste — a two-stage chain (fan-IN summary → fan-OUT SUGGESTS).
-- This is the TasteBasedRecommendations view.
MATCH (me:AssistantUser)-[:HAS_MOVIE_TASTE_SUMMARY]->(ts:MovieTasteSummary)
MATCH (ts)-[:SUGGESTS]->(m:Movie)
WHERE NOT EXISTS { (me)-[:RATED]->(seen:MovieRating) WHERE seen.imdbId = m.imdbId }
RETURN DISTINCT m.title, m.year, m.imdbRating, m.plot,
       'https://www.imdb.com/title/' + m.imdbId + '/' AS imdbUrl
ORDER BY m.imdbRating DESC
```
```cypher
-- Films you'd probably HATE (SIMILAR_TO anchored on your LOW ratings)
MATCH (me:AssistantUser)-[:RATED]->(rt:MovieRating) WHERE rt.rating <= 4
MATCH (rt)-[:SIMILAR_TO]->(m:Movie)
WHERE NOT EXISTS { (me)-[:RATED]->(seen:MovieRating) WHERE seen.imdbId = m.imdbId }
RETURN DISTINCT m.title, m.year
```

**Filters + streaming (SIMILAR_TO ∩ AVAILABLE_ON ∩ SUBSCRIBES_TO)**
```cypher
-- French/Italian, pre-1980, under 100 minutes
MATCH (me:AssistantUser)-[:RATED]->(rt:MovieRating) WHERE rt.rating >= 8
MATCH (rt)-[:SIMILAR_TO]->(m:Movie)
WHERE NOT EXISTS { (me)-[:RATED]->(seen:MovieRating) WHERE seen.imdbId = m.imdbId }
  AND m.year < 1980 AND m.runtimeMinutes < 100
  AND (m.country CONTAINS 'France' OR m.country CONTAINS 'Italy')
RETURN DISTINCT m.title, m.year, m.country, m.runtimeMinutes
```
```cypher
-- Recommendations you can actually STREAM on a service you subscribe to
MATCH (me:AssistantUser)-[:RATED]->(rt:MovieRating) WHERE rt.rating >= 8
MATCH (rt)-[:SIMILAR_TO]->(m:Movie)
WHERE NOT EXISTS { (me)-[:RATED]->(seen:MovieRating) WHERE seen.imdbId = m.imdbId }
  AND EXISTS { MATCH (m)-[:AVAILABLE_ON]->(s:StreamingService)
               WHERE EXISTS { (me)-[:SUBSCRIBES_TO]->(:UserStreamingSubscription {serviceId: s.serviceId}) } }
RETURN DISTINCT m.title, m.year
```

**Web-grounded reviews (HAS_REVIEW → many MovieReview nodes)**
```cypher
-- Real published reviews of one film — pin the film by title, newest first
MATCH (m:Movie {title:'Stalker'})-[:HAS_REVIEW]->(r:MovieReview)
RETURN r.publication, r.reviewDate, r.sentiment, r.originalScore, r.verdict, r.url
ORDER BY r.reviewDate DESC
```

You can also click **Run** on the saved views in the console's **Views** tab: `MyFilmTaste`,
`MovieRecommendations`, `StreamableRecommendations`, `NoirRecommendations`, `MoviesYoullProbablyHate`, and
`TasteBasedRecommendations`.

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

## Type methods (TypeScript)

`Movie` is authored in TypeScript as a **class that `extends Entity`** under
`src/api/` — not declared in YAML. Its fields are the shape and its async methods
are affordances callable on an in-scope object: `movie.streaming({ country })`,
not a bare `gateway.movie.streaming(...)`. See
[`specs/PACK_TYPES.md`](../assistant/specs/PACK_TYPES.md) in the assistant repo
for the full model and [`specs/PACK_COMPILER.md`](../assistant/specs/PACK_COMPILER.md)
for the build pipeline.

**Authoring.** One class per type, in `src/api/<namespace>.ts` (the filename is
the namespace — `movie.ts` → `movie`). There is no `ctx`/`self` plumbing: `this`
is the object, `this.gateway` is the context. Each method's JSDoc first paragraph
becomes the LLM-facing description; its single `args` parameter and return type
become the input/output JSON Schema.

```ts
import { Entity } from "@embabel/runtime-types";

// Data shapes the methods read/write, declared alongside the type that uses them.
interface StreamingShow { streamingOptions?: Record<string, unknown[]> }
interface RatingEntry { id: string }
interface MovieRating { imdbId: string; title?: string; rating: number; notes?: string; watchedOn?: string }

// The gateway ops this type calls, typed. Until `embabel-pack sync` generates the
// host's `GatewayContext`, the pack types the slice it uses and reads it through
// `this.api`, so bodies and return types are fully typed — no `unknown`.
interface MovieGateway {
  streamingAvailability: { getShow(args: { id: string; country: string }): Promise<StreamingShow> };
  repository: { createEntry(args: { type: string; data: MovieRating }): Promise<RatingEntry> };
}

export class Movie extends Entity {
  imdbId!: string;
  title?: string;

  private get api(): MovieGateway {
    return this.gateway as unknown as MovieGateway;
  }

  /** Where this movie is streaming in a country (ISO-3166 alpha-2, lowercase). */
  async streaming(args: { country: string }): Promise<StreamingShow> {
    return this.api.streamingAvailability.getShow({ id: this.imdbId, country: args.country });
  }

  /** Record the user's rating (1–10); createEntry auto-emits (User)-[:RATED]->(MovieRating). */
  async rate(args: { rating: number; notes?: string; watchedOn?: string }): Promise<RatingEntry> {
    const data: MovieRating = { imdbId: this.imdbId, title: this.title, ...args };
    return this.api.repository.createEntry({ type: "MovieRating", data });
  }
}
```

Extending `Entity` also gives `movie.neighbors({ hops })` for free — graph
navigation (typed `NeighborNode[]`) with no per-type code. The whole type — its
fields, methods, result shapes (`StreamingShow`, `OmdbMovie`, `RatingEntry`), and
the `MovieRating` record it writes — lives in the single file `src/api/movie.ts`.

**Where it runs.** A method body runs **in the pack sandbox**; the gateway ops it
calls (`this.gateway.streamingAvailability.*`, `this.gateway.omdb.*`,
`this.gateway.repository.*`) route back through the **server**, which holds the
API keys and makes the external call. Convenience/composition is local; every
credentialed call is server-mediated.

**Testing.** `entityForTest` builds a real instance with its fields set and a
mock gateway injected — the same shape the host uses — so a method is tested in
milliseconds with no live server:

```ts
import { entityForTest, mockGateway } from "@embabel/runtime-types";
import type { GenericGatewayContext } from "@embabel/runtime-types";
import { Movie } from "../src/api/movie";

const movie = entityForTest(
  Movie,
  { imdbId: "tt0114367" },
  mockGateway<GenericGatewayContext>({ streamingAvailability: { getShow } }),
);
await movie.streaming({ country: "us" });
expect(getShow).toHaveBeenCalledWith({ id: "tt0114367", country: "us" });
```

**Build.**

```bash
npm install          # links @embabel/runtime-types (file: dep) + typescript + vitest
npm run build        # tsc -> dist/, vendor runtime, embabel-build-manifest -> dist/manifest.json
npm test             # vitest — methods tested against a mocked gateway
npm run typecheck    # tsc --noEmit
```

`npm run build` produces:

- `dist/api/movie.js` — the compiled CommonJS `Movie` class (seeded into the
  sandbox at `/workspace/pack-handlers/pack-movie/` and `require()`d there).
- `dist/node_modules/@embabel/runtime-types/` — the vendored CommonJS base class,
  so the seeded handler can `require("@embabel/runtime-types")` for `Entity`
  without a global install.
- `dist/manifest.json` — one entry per method, each carrying `onType: "Movie"`
  and `className: "Movie"`, read by the assistant's `PackHandlerLoader`.

The workspace install step (`WorkspaceBootstrap`) runs `npm install && npm run
build` automatically when the pack is cloned, so `dist/` is regenerated on
install. `dist/` is gitignored.

**Adding a method:** add an `async` method to the `Movie` class in
`src/api/movie.ts`, add a test in `tests/`, run `npm run build`. Done — no
Kotlin, no YAML.
