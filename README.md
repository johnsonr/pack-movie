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
| `apis/` | Two OpenAPI 3 specs — OMDb (film metadata) and Streaming Availability (per-country streaming options). Calls go through `gateway.omdb.*` / `gateway.streaming_availability.*` from `execute_javascript` / `execute_python`. |
| `types/movies.yml` | `Movie` (canonical metadata, keyed by IMDb id) and `MovieRating` (the user's score for a Movie). Read/written via the workspace repository tools. `MovieRating` declares `userAnchor: { predicate: RATED, direction: from-user }`, so the assistant auto-emits `(User)-[:RATED]->(MovieRating)` on every `create_entry`. |
| `skills/recommend-movie/` | "What should I watch?" / "where can I stream X?" — owns the OMDb + Streaming Availability workflow and the cardinal rules (don't default the country; the response field is `streamingOptions`, not `streamingInfo`). Activates only for the recommend / availability paths. |
| `skills/rate-movie/` | "I just watched X, give it N" — ensures the `Movie` record exists, then creates or updates the `MovieRating` with an explicit `OF` edge back to the Movie. The `RATED` user edge is automatic. |
| `skills/recall-movies/` | "What did I think of X?" / "what have I rated?" — reads `MovieRating` via `list_entries` for single-title recall, or Cypher for anything cross-cutting. |
| `personalities/roger/` | Ebert-style film-critic voice — used only by the recommend write-up. Rate confirmations and recall replies stay in the default assistant voice. |

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

- `gateway.omdb.*` and `gateway.streaming_availability.*` tool surfaces
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
