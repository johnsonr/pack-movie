/**
 * The current user's rating of a Movie. Identity is `imdbId`; the framework
 * anchors it to the user via `RATED` on createEntry, so one row per
 * (user, movie) — a re-rate updates in place. Canonical schema lives in
 * `types/movies.yml`; this is the slice the `Movie.rate` method writes.
 *
 * (`Movie` itself is a class — see `src/api/movie.ts` — so its shape and methods
 * live together. `MovieRating` is plain data the user writes, with no methods of
 * its own, so it stays an interface.)
 */
export interface MovieRating {
  /** IMDb id of the rated Movie — the identity key (same value as Movie.imdbId). */
  imdbId: string;
  /** Title, denormalised for cheap recall without a join. */
  title?: string;
  /** Score from 1 (terrible) to 10 (masterpiece). Whole numbers only. */
  rating: number;
  /** Optional one-line reaction in the user's own words. */
  notes?: string;
  /** Optional ISO-8601 date the user watched the movie. */
  watchedOn?: string;
}
