---
name: rate-movie
description: Record the user's rating of a film as a persistent MovieRating tied to its Movie record. Activate this skill BEFORE any tool call when the user mentions a film they've just watched, gives a film a score (e.g. "Heat — 9 out of 10"), or asks to save / update a rating. Do NOT activate for asking what to watch (use recommend-movie) or asking what they thought of a film they've already rated (use recall-movies).
---

# Record a Movie Rating

This skill is a single `execute_javascript` call. Run the script below — with
the user's title and rating substituted — and reply to the user with **exactly
the string it returns**. The return value carries the OMDb-resolved title and
IMDb id, which you do not have until the script has actually run: until then you
have nothing to tell the user, so do not write a "saved" message yourself.

OMDb is reachable only as `gateway.omdb`; the types only as
`gateway.repository.*`. The `*Entry` methods take a structured object
(`{type, data, relations}`) — never a `request:` string (that is the separate
`repository` playbook tool). `imdbId` is the identity key, so `createEntry`
MERGEs on it: no lookup first, and a re-rate of the same film updates in place.

```js
const userTitle = "The Matrix";   // the film the user named
const rating = 9;                 // whole number 1–10

const omdb = await gateway.omdb.getMovie({ t: userTitle }); // { s: userTitle } to search instead
if (!omdb || omdb.Response === "False")
  return `No film matching "${userTitle}" on OMDb — ask the user to confirm the title.`;
const imdbId = omdb.imdbID, title = omdb.Title;

await gateway.repository.createEntry({
  type: "Movie",
  data: { imdbId, title, year: omdb.Year, genre: omdb.Genre, director: omdb.Director },
});
await gateway.repository.createEntry({
  type: "MovieRating",
  data: { imdbId, title, rating },   // imdbId + rating are required; add notes/watchedOn if given
  relations: [{ predicate: "OF", to: { type: "Movie", imdbId } }],
});

return `Saved ${title} (${imdbId}) — ${rating}/10.`;
```

Rules:

- **Ratings are whole numbers 1–10.** Round a half-rating and confirm it back
  ("calling it an 8 — sound right?") before running.
- **Never invent an IMDb id or rating.** The id comes from OMDb; if OMDb returns
  nothing, relay that and stop — don't guess.
- The `(User)-[:RATED]->(MovieRating)` edge is added automatically — don't add it.
