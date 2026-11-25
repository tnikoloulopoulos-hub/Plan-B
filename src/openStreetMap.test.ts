import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNearbyPlaces } from './openStreetMap';

describe('nearby Overpass searches', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('uses the reduced radius and caches a successful empty response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    expect(await fetchNearbyPlaces(37.1234, 23.4567)).toEqual([]);
    expect(await fetchNearbyPlaces(37.1234, 23.4567)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();

    const requestBody = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    const query = requestBody.get('data') ?? '';
    expect(query).toContain('around:1500,37.1234,23.4567');
    expect(query).toContain('["amenity"');
    expect(query).toContain('["leisure"');
    expect(query).toContain('["tourism"');
    expect(query).toContain('out center tags 150');
    expect(query.length).toBeLessThan(500);
    expect(window.sessionStorage.getItem('planb-nearby-places-cache-v1')).toContain('1500:37.1234,23.4567');
  });

  it('retries transient server failures before falling back sequentially', async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      activeRequests -= 1;
      if (fetchMock.mock.calls.length < 3) {
        return new Response('busy', { status: 503 });
      }
      return new Response(JSON.stringify({ elements: [{
        type: 'node',
        id: 7001,
        lat: 38.0167,
        lon: 23.75,
        tags: { name: 'Mapped Galatsi Cafe', amenity: 'cafe' },
      }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const places = await fetchNearbyPlaces(38.0167, 23.75);
    expect(places.map((place) => place.name)).toEqual(['Mapped Galatsi Cafe']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass.openstreetmap.fr/api/interpreter');
    expect(String(fetchMock.mock.calls[1][0])).toContain('overpass.openstreetmap.fr/api/interpreter');
    expect(String(fetchMock.mock.calls[2][0])).toContain('overpass-api.de/api/interpreter');
    expect(maximumActiveRequests).toBe(1);
  });

  it('coalesces concurrent searches for the same selected coordinates', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      resolveResponse = resolve;
    }));

    const firstSearch = fetchNearbyPlaces(36.9876, 22.3456);
    const secondSearch = fetchNearbyPlaces(36.9876, 22.3456);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveResponse?.(new Response(JSON.stringify({ elements: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(Promise.all([firstSearch, secondSearch])).resolves.toEqual([[], []]);
  });
});
