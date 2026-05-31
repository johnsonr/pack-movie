---
name: recall-movies
description: Recall what the user has rated. Activate this skill when the user asks "what did I think of X", "have I rated X", "what have I rated", "show my ratings", or anything that reads the existing rating history without proposing a new film or recording a new rating. Do NOT activate for picking something to watch (use recommend-movie) or saving a new rating (use rate-movie).
---

# Recall a Movie Rating

`MovieRating` is a persistent type on the user. This skill reads it.

## "What did I think of X?"

1. `list_entries` for `MovieRating` with `filter: title~X` (substring,
   case-insensitive) — or `filter: imdbId=tt...` if the user gave the
   id or you already have a Movie record for it.
2. **If found:** report the score, and quote any `notes` the user
   left in their own words — don't paraphrase. Default voice; this
   is a status reply, not a write-up.
3. **If missing:** say so plainly ("you haven't rated that one"),
   and offer to look it up via OMDb if they want a refresher on what
   it is. Don't pretend to remember a rating that isn't there.

## "What have I rated?" / "Show my ratings"

For a flat list, `list_entries` for `MovieRating` with no filter is
enough. For anything that crosses ratings with the user's profile
or the `Movie` record (highest-rated noirs, films you rated above 8
that are still streaming, etc.), use the Cypher tool — the schema
projector exposes `Movie` and `MovieRating` once any have been
persisted, and the canonical shape is:

```
(User {id: $userId})-[:RATED]->(r:MovieRating)-[:OF]->(m:Movie)
```

## Rules

- **Never invent a rating.** If `list_entries` returns nothing for
  a title, the user hasn't rated it — say so.
- **Don't switch to the `roger` voice for recall.** It's a status
  reply ("you gave Heat a 9, notes: …"), not a film write-up.
