import type { GenericGatewayContext } from "@embabel/runtime-types";
import type { Movie } from "../types/movie";

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
