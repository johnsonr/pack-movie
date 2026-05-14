---
name: recommend-movie
description: Movie recommendations grounded in what the user has actually rated, what's streamable in their country right now, and live OMDb metadata. Activate this skill BEFORE making any OMDb or Streaming Availability call when the user asks for a film to watch, mentions a movie they've just seen, asks "what should I watch", asks where they can stream a specific title, or wants to record a rating. Owns the full workflow from preference → recall → lookup → availability filter → write-up → optional rating.
---

# Recommend a Movie

You are helping the user pick a film to watch tonight, write up a film they
just saw, or remember what they thought of one they saw before. The pack
ships two APIs (`omdb`, `streaming_availability`), two persistent types
(`Movie`, `MovieRating`), and the `roger` personality. This skill stitches
them together.

## Namespaces

Calls go through `gateway.<ns>.<method>(args)` from inside `execute_javascript`
or `execute_python`. Never call them as top-level tools.

| Namespace | Notes |
|---|---|
| `gateway.omdb.*` | OpenAPI-typed. One method: `getMovie`. Pass exactly ONE of `i` (IMDb id, cheapest), `t` (exact title), `s` (search). |
| `gateway.streaming_availability.*` | OpenAPI-typed. `getShow({id, country})` when you have an IMDb id; `searchShowsByTitle({country, title})` when you don't. |

The `Movie` and `MovieRating` types are read/written via the workspace
repository tools (`describe`, `list_entries`, `create_entry`, `update_entry`,
`delete_entry`) — same surface every other typed entry uses.

For "what have I rated?" / "what did I think of X?" / general recall, use the
Cypher tool — the schema projector exposes `Movie` and `MovieRating` once any
have been persisted, and Cypher reaches across both plus the user's profile
in one query.

## Cardinal rules

> The first two rules below capture the two ways this skill has been seen
> to fail in the wild. Re-read them every turn before writing a script
> against `gateway.streaming_availability.*`. They are not optional.

1. **NEVER default the country. ASK.** The user's country lives in their
   profile (DICE extracts it from chat as "user lives in &lt;X&gt;") and is
   surfaced in your context block as `country: <code>`. If you cannot
   see a country there, the answer is to **ask the user**, not to guess.
   Defaulting to `'us'` (or `'gb'`, or any other country) when the user
   is in Australia returns wrong results AND the user can't tell you
   guessed — they get a confident "Fargo isn't streaming in your country"
   that is technically true for the country you guessed and totally
   misleading for theirs. This is THE most common failure mode of this
   skill. Examples:
   - WRONG: `const country = 'us'; // Assuming US`
   - WRONG: `const country = userCountry || 'us';`
   - RIGHT: derive `country` from the user-context block in this
     conversation; if absent, **return a short clarifying message**
     (`"Which country are you in? I need this to check streaming."`)
     and STOP — do not call `getShow` until the user replies.
2. **The `getShow` response field is `streamingOptions`, NOT
   `streamingInfo`.** This API is one of those where a plausible-but-wrong
   field name causes the script's defensive branch to falsely report
   "not available". The real shape is:
   ```js
   const r = await gateway.streaming_availability.getShow({ id, country });
   // r.streamingOptions[country] is an array of StreamingOption,
   // each with { service: { id, name, ... }, type, link, ... }
   ```
   - WRONG: `r.streamingInfo` — undefined, every defensive branch fires
   - WRONG: `r.streamingInfo[country]` — same
   - RIGHT: `r.streamingOptions?.[country]` — array of options, or undefined
     if the show has no streaming presence in that country
   When in doubt, log the response shape (`console.log(JSON.stringify(r,
   null, 2))`) before reading fields. The `Show` schema in the typed
   surface is also authoritative — read it.
3. **Don't fabricate IMDb ids, ratings, or streaming availability.** Every id
   comes from an OMDb call; every "available on Netflix" claim comes from a
   Streaming Availability call. Never guess.
4. **Reuse existing Movie records by `imdbId`.** Before `create_entry` for a
   new Movie, check whether one already exists (`list_entries` with
   `filter: imdbId=tt...`). The IMDb id is the canonical key.
5. **One MovieRating per (user, movie).** When the user re-rates a film,
   `update_entry` the existing record rather than creating a duplicate.
6. **Voice.** When writing up a recommendation or a rating, switch to the
   `roger` personality (Ebert-style: sharp, image-led, one human observation
   per paragraph). For status / clarification messages, stay in the default
   assistant voice.

## Workflow

### "What should I watch?"

1. **Recall what the user has rated** so you don't recommend something
   they've already seen. One Cypher read is enough — pull `MovieRating`
   nodes for the current user and read their `imdbId` and `rating`. If
   the list is empty, that's fine — fall through to step 2 with no
   exclusions.
2. **Recall preferences** the user has accumulated in chat — favourite
   directors, genres they avoid, mood for the evening. These are normal
   propositions on the user; you already see them in your context. If
   the user's request is vague ("something good"), ask one clarifying
   question (mood / genre / runtime) before proceeding.
3. **Generate candidates.** Propose 5–8 films in your head that match
   the preferences and aren't in the rated list. Don't show this list yet.
4. **Verify each candidate via OMDb.** Call `gateway.omdb.getMovie({s: title})`,
   pick the right `imdbID` from the search results, then
   `gateway.omdb.getMovie({i: imdbID})` for the full record. Drop any
   candidate OMDb can't find — it's almost certainly a hallucination on
   your side.
5. **Filter by streaming.** For each verified candidate, call
   `gateway.streaming_availability.getShow({id: imdbID, country})`. The
   response has the streaming list under `streamingOptions[country]`
   (NOT `streamingInfo` — see Cardinal rule 2). Keep only films with at
   least one `subscription` or `free` option in the user's country.
   Note the matching service(s) — if you know which services the user
   subscribes to (DICE will have those facts too), prefer titles
   available on those.
6. **Write up the top 3** in the `roger` voice. One paragraph each.
   Markdown link to the streaming option's `link`. Lead with the image,
   not the plot summary.

### "I just watched X, give it a 7"

1. **Resolve the film** via OMDb (`getMovie({s: 'X'})` then `getMovie({i: imdbID})`).
2. **Ensure the Movie record exists.** `list_entries` filtered by
   `imdbId=tt...`; if missing, `create_entry` for `Movie` with
   `imdbId`, `title`, `year`, `genre`, `director`, `runtimeMinutes`.
3. **Ensure the MovieRating is up to date.** `list_entries` for
   `MovieRating` filtered by `imdbId=tt...`; if missing, `create_entry`;
   if present, `update_entry` with the new rating.
4. **Confirm to the user** in one short line. No `roger` voice for the
   confirmation — this is a status message, not a write-up.

### "Where can I stream X?"

1. Resolve via OMDb to get the IMDb id (skip if the user already gave it
   or you have a Movie record).
2. Call `gateway.streaming_availability.getShow({id, country})`.
3. Render the streaming options as a short markdown list, grouped by
   `type` (subscription / free / rent / buy), with each entry as a
   markdown link to `streamingOption.link`. Include `quality` if it's
   `uhd` (notable) and `price.formatted` for rent/buy.

### "What did I think of X?"

1. `list_entries` for `MovieRating` filtered by `title~X` (substring) or
   `imdbId=tt...` if you can resolve it cheaply.
2. If found: report the rating and any `notes` they left, in the user's
   own words — don't paraphrase.
3. If missing: say so plainly ("you haven't rated that one"), and offer
   to look it up via OMDb if they want a refresher on what it is.

## Common pitfalls

- **OMDb returns HTTP 200 on misses.** Check `Response: 'False'` and
  read the `Error` field. Don't treat a miss as an error to retry.
- **OMDb's `i`/`t`/`s` are mutually exclusive.** Passing more than one is
  undefined behaviour. The skill always names exactly one mode per call.
- **Streaming Availability without `country` returns every country in the
  world** — don't do this. Always pass `country`.
- **Streaming Availability uses its own `id`**, not the IMDb id, in the
  `Show.id` field. Always join on `Show.imdbId` when bridging back to
  `Movie.imdbId`. The path parameter to `getShow` is the IMDb id (with
  the `tt` prefix), not the SA id.
- **Don't exclude rented/bought titles entirely** — surface them after
  the subscription/free options, since some users genuinely don't mind
  paying for a specific film.
- **Ratings are 1–10 whole numbers.** If the user gives a half-rating
  (7.5), round to nearest whole and confirm ("calling it an 8 — sound
  right?").
