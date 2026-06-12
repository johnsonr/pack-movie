/**
 * The fields a `Movie` method handler reads off the in-scope object. The
 * canonical schema lives in `types/movies.yml`; this is just the slice the
 * compiled methods need (identity is `imdbId`).
 */
export interface Movie {
  imdbId: string;
  title?: string;
  year?: string;
  genre?: string;
  director?: string;
  runtimeMinutes?: string;
}

/**
 * The current user's rating of a Movie. Identity is `imdbId`; the framework
 * anchors it to the user via `RATED` on create_entry, so one row per
 * (user, movie) — a re-rate updates in place. Canonical schema lives in
 * `types/movies.yml`; this is the slice the rate handler writes.
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
