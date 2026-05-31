---
name: recommend-movie
description: Recommend a film to watch tonight, or report where a specific title is streamable. Activate this skill BEFORE any OMDb or Streaming Availability call when the user asks "what should I watch", asks for a recommendation, or asks where they can stream a specific film. Do NOT activate for recording a rating (use rate-movie) or recalling one (use recall-movies).
---

# Recommend a Movie

You are helping the user pick a film to watch tonight, or telling them
where a film they've named is streamable. The pack ships two APIs
(`omdb`, `streaming_availability`), the `Movie` and `MovieRating`
workspace types, and the `roger` personality (Roger-Ebert-style voice
for the write-up).

## Namespaces

Calls go through `gateway.<ns>.<method>(args)` from inside
`execute_javascript` or `execute_python`. Never call them as top-level
tools.

| Namespace | Notes |
|---|---|
| `gateway.omdb.*` | OpenAPI-typed. One method: `getMovie`. Pass exactly ONE of `i` (IMDb id, cheapest), `t` (exact title), `s` (search). |
| `gateway.streaming_availability.*` | OpenAPI-typed. `getShow({id, country})` when you have an IMDb id; `searchShowsByTitle({country, title})` when you don't. |

## Cardinal rules

> The first two are the ways this skill fails in the wild. Re-read them
> every turn before writing a script against
> `gateway.streaming_availability.*`. Not optional.

1. **NEVER default the country. ASK.** The user's country lives in
   their profile (DICE extracts it from chat as "user lives in &lt;X&gt;")
   and is surfaced in your context block as `country: <code>`. If you
   cannot see a country there, **return a short clarifying message**
   (`"Which country are you in? I need this to check streaming."`)
   and STOP — do not call `getShow` until the user replies. Defaulting
   to `'us'` returns a confident wrong answer the user can't catch.
2. **The `getShow` response field is `streamingOptions`, NOT
   `streamingInfo`.** Plausible-but-wrong field name; defensive branch
   falsely reports "not available". Real shape:
   ```js
   const r = await gateway.streaming_availability.getShow({ id, country });
   // r.streamingOptions[country] is an array of StreamingOption,
   // each with { service: { id, name, ... }, type, link, ... }
   ```
   When in doubt, `console.log(JSON.stringify(r, null, 2))` before
   reading fields.
3. **Don't fabricate IMDb ids, ratings, or streaming availability.**
   Every id comes from an OMDb call; every "available on Netflix"
   claim comes from a Streaming Availability call.
4. **Voice.** For the write-up, switch to the `roger` personality
   (sharp, image-led, one human observation per paragraph). For
   clarification / status messages, stay in the default assistant voice.

## "What should I watch?"

1. **Recall what the user has rated** so you don't recommend something
   they've already seen. One Cypher read is enough — pull
   `MovieRating` nodes for the current user and read `imdbId` and
   `rating`. Empty list is fine; just skip the exclusion.
2. **Recall preferences** from the user's profile (favourite
   directors, genres they avoid, mood). These are normal propositions
   you already see in your context. If the request is vague ("something
   good"), ask ONE clarifying question (mood / genre / runtime) before
   proceeding.
3. **Generate candidates** — 5–8 films in your head that match the
   preferences and aren't in the rated list. Don't show this list yet.
4. **Verify each candidate via OMDb.** `gateway.omdb.getMovie({s: title})`,
   pick the right `imdbID`, then `getMovie({i: imdbID})` for the full
   record. Drop any candidate OMDb can't find — almost certainly a
   hallucination.
5. **Filter by streaming.** For each verified candidate,
   `gateway.streaming_availability.getShow({id: imdbID, country})`.
   Keep only films with at least one `subscription` or `free` option
   in `r.streamingOptions[country]`. If you know which services the
   user subscribes to (DICE will have those facts), prefer titles
   available on those.
6. **Write up the top 3** in the `roger` voice. One paragraph each.
   Markdown link to the streaming option's `link`. Lead with the image,
   not the plot summary.

## "Where can I stream X?"

1. Resolve via OMDb to get the IMDb id (skip if the user already gave
   it or you have a Movie record for it).
2. Call `gateway.streaming_availability.getShow({id, country})`.
3. Render the streaming options as a short markdown list, grouped by
   `type` (subscription / free / rent / buy), each entry a markdown
   link to `streamingOption.link`. Include `quality` if `uhd`, and
   `price.formatted` for rent/buy.

## Common pitfalls

- **OMDb returns HTTP 200 on misses.** Check `Response: 'False'` and
  read the `Error` field. Don't treat a miss as an error to retry.
- **OMDb's `i`/`t`/`s` are mutually exclusive.** Pass exactly one.
- **Streaming Availability without `country` returns every country
  in the world.** Always pass `country`.
- **Streaming Availability uses its own `id`**, not the IMDb id, in
  the `Show.id` field. Join on `Show.imdbId` when bridging back to
  `Movie.imdbId`. The path parameter to `getShow` is the IMDb id
  (with the `tt` prefix), not the SA id.
- **Don't exclude rented/bought titles entirely** — surface them
  after subscription/free, since some users don't mind paying.
