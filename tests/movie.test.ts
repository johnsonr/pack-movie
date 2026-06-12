/**
 * Tests for the `Movie` type's methods. Each runs against a MOCKED gateway (no
 * live server, no API keys): `entityForTest` builds a real `Movie` with its
 * fields set and the mock gateway injected — exactly what the host does at
 * runtime — so the method under test runs unchanged. We then assert it called
 * the right underlying gateway op with the right args.
 */
import { describe, it, expect, vi } from "vitest";
import { entityForTest, mockGateway } from "@embabel/runtime-types";
import type { GenericGatewayContext } from "@embabel/runtime-types";
import { Movie } from "../src/api/movie";

describe("Movie.streaming", () => {
  it("reads the movie's imdbId and the country arg, calls streamingAvailability.getShow", async () => {
    const getShow = vi
      .fn()
      .mockResolvedValue({ streamingOptions: { au: [{ service: "netflix", type: "subscription" }] } });
    const movie = entityForTest(
      Movie,
      { imdbId: "tt0113451" },
      mockGateway<GenericGatewayContext>({ streamingAvailability: { getShow } }),
    );

    const r = await movie.streaming({ country: "au" });

    expect(getShow).toHaveBeenCalledWith({ id: "tt0113451", country: "au" });
    expect(r).toMatchObject({ streamingOptions: { au: [{ service: "netflix" }] } });
  });
});

describe("Movie.details", () => {
  it("reads the movie's imdbId, calls omdb.getMovie with the full plot", async () => {
    const getMovie = vi.fn().mockResolvedValue({ Title: "Jade", imdbID: "tt0113451" });
    const movie = entityForTest(
      Movie,
      { imdbId: "tt0113451" },
      mockGateway<GenericGatewayContext>({ omdb: { getMovie } }),
    );

    const r = await movie.details();

    expect(getMovie).toHaveBeenCalledWith({ i: "tt0113451", plot: "full" });
    expect(r).toMatchObject({ Title: "Jade" });
  });
});

describe("Movie.rate", () => {
  it("writes a MovieRating from the movie's fields plus the rating args", async () => {
    const createEntry = vi.fn().mockResolvedValue({ id: "mr1" });
    const movie = entityForTest(
      Movie,
      { imdbId: "tt0113451", title: "Jade" },
      mockGateway<GenericGatewayContext>({ repository: { createEntry } }),
    );

    await movie.rate({ rating: 7, notes: "messy but fun" });

    expect(createEntry).toHaveBeenCalledWith({
      type: "MovieRating",
      data: { imdbId: "tt0113451", title: "Jade", rating: 7, notes: "messy but fun", watchedOn: undefined },
    });
  });
});

describe("Movie.neighbors (inherited from Entity)", () => {
  it("walks the graph from this movie's id via kg.neighbors — no per-type code", async () => {
    const neighbors = vi.fn().mockResolvedValue([{ id: "p1", label: "Person", name: "Linda Fiorentino" }]);
    const movie = entityForTest(
      Movie,
      { id: "movie-tt0113451", imdbId: "tt0113451" },
      mockGateway<GenericGatewayContext>({ kg: { neighbors } }),
    );

    const r = await movie.neighbors({ hops: 2 });

    expect(neighbors).toHaveBeenCalledWith({ id: "movie-tt0113451", hops: 2 });
    expect(r).toMatchObject([{ name: "Linda Fiorentino" }]);
  });
});
