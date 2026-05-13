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
| `types/movies.yml` | `Movie` (canonical metadata, keyed by IMDb id) and `MovieRating` (the user's score for a Movie). Available via the workspace repository tools. |
| `skills/recommend-movie/` | The workflow narrative the chat LLM follows: recall what the user has rated, ask one clarifying question, look up candidates in OMDb, filter by streaming availability, write up the top three. Activates whenever the user asks "what should I watch", mentions a film they've just seen, or asks where they can stream a title. |
| `personalities/roger/` | An Ebert-style film-critic voice for the write-up itself. Status messages stay in the default assistant voice. |

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

This pack is currently Phase 0 — it installs and the types / skill /
persona load, but rating persistence depends on framework work in the
assistant repo (graph-backed `RepositoryStore` + relations on `create_entry`)
that's tracked separately. Until that lands, ratings persist to the
workspace's YAML store and are visible to `list_entries` but not to the
Cypher tool or DICE recall.
