import type { GenericGatewayContext } from "@embabel/runtime-types";
import type { Movie, MovieRating } from "../types/movie";

// Methods ON the Movie type. The three-parameter signature `(ctx, self, args)`
// — where `self` is a named type (`Movie`) — declares this as a method callable
// on an in-scope Movie object (`movie.streaming({ country })`), not a bare
// `gateway.movie.streaming(...)` function. The handler body runs in the pack
// sandbox; the gateway ops it calls (`ctx.omdb.*`, `ctx.streamingAvailability.*`)
// route back through the server, where the credentials live.

/**
 * Where this movie is streaming in a country (ISO-3166 alpha-2, lowercase —
 * e.g. 'us', 'au').
 */
export async function streaming(
  ctx: GenericGatewayContext,
  self: Movie,
  args: { country: string },
): Promise<unknown> {
  return ctx.streamingAvailability.getShow({ id: self.imdbId, country: args.country });
}

/**
 * Fresh OMDb metadata (full plot, ratings, runtime) for this movie.
 */
export async function details(
  ctx: GenericGatewayContext,
  self: Movie,
  _args: Record<string, never>,
): Promise<unknown> {
  return ctx.omdb.getMovie({ i: self.imdbId, plot: "full" });
}

/**
 * Record the user's rating of this movie (1–10). Recording IS making the link:
 * create_entry against MovieRating auto-emits (User)-[:RATED]->(MovieRating) and
 * upserts by imdbId, so a re-rate updates in place. The same gateway op the
 * card's star widget calls.
 */
export async function rate(
  ctx: GenericGatewayContext,
  self: Movie,
  args: { rating: number; notes?: string; watchedOn?: string },
): Promise<unknown> {
  const data: MovieRating = {
    imdbId: self.imdbId,
    title: self.title,
    rating: args.rating,
    notes: args.notes,
    watchedOn: args.watchedOn,
  };
  return ctx.repository.createEntry({ type: "MovieRating", data });
}
