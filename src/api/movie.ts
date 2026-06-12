import { Entity } from "@embabel/runtime-types";
import type { MovieRating } from "../types/movie";

/**
 * A film in the knowledge graph. Identity is `imdbId`.
 *
 * Extending `Entity` is the whole declaration: it makes the host recognise
 * `Movie` as a type, hydrates an in-scope object's fields onto `this`, and gives
 * it `neighbors()` for free. Each async method below is an affordance callable on
 * that object — `movie.streaming({ country: "us" })` — with no `ctx`/`self`
 * plumbing: `this` is the movie, `this.gateway` reaches the APIs the pack brings
 * in (where the credentials live, server-side).
 */
export class Movie extends Entity {
  /** IMDb id — the identity key (e.g. "tt0114367"). */
  imdbId!: string;
  title?: string;
  year?: string;
  genre?: string;
  director?: string;
  runtimeMinutes?: string;

  /**
   * Where this movie is streaming in a country (ISO-3166 alpha-2, lowercase —
   * e.g. 'us', 'au').
   */
  async streaming(args: { country: string }): Promise<unknown> {
    return this.gateway.streamingAvailability.getShow({ id: this.imdbId, country: args.country });
  }

  /**
   * Fresh OMDb metadata (full plot, ratings, runtime) for this movie.
   */
  async details(): Promise<unknown> {
    return this.gateway.omdb.getMovie({ i: this.imdbId, plot: "full" });
  }

  /**
   * Record the user's rating of this movie (1–10). Recording IS making the link:
   * createEntry against MovieRating auto-emits (User)-[:RATED]->(MovieRating) and
   * upserts by imdbId, so a re-rate updates in place. The same gateway op the
   * card's star widget calls.
   */
  async rate(args: { rating: number; notes?: string; watchedOn?: string }): Promise<unknown> {
    const data: MovieRating = {
      imdbId: this.imdbId,
      title: this.title,
      rating: args.rating,
      notes: args.notes,
      watchedOn: args.watchedOn,
    };
    return this.gateway.repository.createEntry({ type: "MovieRating", data });
  }
}
