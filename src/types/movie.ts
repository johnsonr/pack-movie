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
