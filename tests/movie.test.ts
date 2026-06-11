/**
 * Tests for the compiled `Movie` methods. Each is exercised against a MOCKED
 * gateway (no live server, no API keys): we pass the in-scope Movie as `self`
 * and assert it calls the right underlying gateway op with the right args.
 */
import { describe, it, expect, vi } from "vitest";
import { mockGateway } from "@embabel/runtime-types";
import type { GenericGatewayContext } from "@embabel/runtime-types";
import { details, streaming } from "../src/api/movie";

describe("Movie.streaming", () => {
  it("reads the movie's imdbId and the country arg, calls streamingAvailability.getShow", async () => {
    const getShow = vi
      .fn()
      .mockResolvedValue({ streamingOptions: { au: [{ service: "netflix", type: "subscription" }] } });
    const ctx = mockGateway<GenericGatewayContext>({ streamingAvailability: { getShow } });

    const r = await streaming(ctx, { imdbId: "tt0113451" }, { country: "au" });

    expect(getShow).toHaveBeenCalledWith({ id: "tt0113451", country: "au" });
    expect(r).toMatchObject({ streamingOptions: { au: [{ service: "netflix" }] } });
  });
});

describe("Movie.details", () => {
  it("reads the movie's imdbId, calls omdb.getMovie with the full plot", async () => {
    const getMovie = vi.fn().mockResolvedValue({ Title: "Jade", imdbID: "tt0113451" });
    const ctx = mockGateway<GenericGatewayContext>({ omdb: { getMovie } });

    const r = await details(ctx, { imdbId: "tt0113451" }, {});

    expect(getMovie).toHaveBeenCalledWith({ i: "tt0113451", plot: "full" });
    expect(r).toMatchObject({ Title: "Jade" });
  });
});
