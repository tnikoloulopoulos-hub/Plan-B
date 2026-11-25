import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNearbyPlaces,
  geoapifyMapTileUrl,
  maxRecommendations,
  rankPlaces,
  resolveSuggestedArea,
  searchLocations,
  type GeoapifyPlace,
} from './geoapify';

describe('Geoapify location and nearby-place services', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-geoapify-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it('geocodes and accepts only real Geoapify locations inside Athens, Greece', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [
      {
        place_id: 'pagrati-place',
        formatted: 'Pangrati, Athens, Greece',
        lat: 37.969,
        lon: 23.747,
        country_code: 'gr',
        state: 'Attica',
      },
      {
        place_id: 'outside-athens',
        formatted: 'Thessaloniki, Greece',
        lat: 40.6401,
        lon: 22.9444,
        country_code: 'gr',
        state: 'Central Macedonia',
      },
      {
        place_id: 'wrong-country',
        formatted: 'Somewhere else',
        lat: 37.969,
        lon: 23.747,
        country_code: 'us',
      },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(searchLocations('Pangrati')).resolves.toEqual([{
      id: 'pagrati-place',
      name: 'Pangrati, Athens, Greece',
      lat: 37.969,
      lon: 23.747,
    }]);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe('https://api.geoapify.com');
    expect(requestUrl.searchParams.get('filter')).toBe('rect:23.55,37.85,24.05,38.15');
    expect(requestUrl.searchParams.get('text')).toBe('Pangrati, Athens, Greece');
    expect(requestUrl.searchParams.get('apiKey')).toBe('test-geoapify-key');
  });

  it('resolves a suggested neighbourhood to one verified central Geoapify result', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [
      {
        place_id: 'syntagma-central',
        formatted: 'Syntagma, Vasilissis Amalias, Athens, Greece',
        lat: 37.9755,
        lon: 23.73567,
        country_code: 'gr',
        state: 'Attica',
      },
      {
        place_id: 'syntagma-street',
        formatted: 'Syntagma, Vasilissis Sofias, Athens, Greece',
        lat: 37.97563,
        lon: 23.73967,
        country_code: 'gr',
        state: 'Attica',
      },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(resolveSuggestedArea('Syntagma')).resolves.toEqual({
      id: 'syntagma-central',
      name: 'Syntagma, Athens, Greece',
      lat: 37.9755,
      lon: 23.73567,
    });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(requestUrl.searchParams.get('text')).toBe('Syntagma, Athens, Greece');
  });

  it('requests actual Geoapify place features within a 2 km radius and caches success', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [
      { properties: {
        place_id: 'geo-cafe-1',
        name: 'Test fixture cafe',
        lat: 37.97,
        lon: 23.748,
        categories: ['catering.cafe', 'catering.cafe.coffee_shop'],
        formatted: 'Example Street 1, Athens, Greece',
        website: 'https://example.test/',
      } },
      { properties: {
        place_id: 'unnamed-place',
        lat: 37.971,
        lon: 23.749,
        categories: ['catering.restaurant'],
      } },
      { properties: {
        place_id: 'unrelated-category',
        name: 'Unrelated place',
        lat: 37.971,
        lon: 23.749,
        categories: ['commercial.clothing'],
      } },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const places = await fetchNearbyPlaces(37.969, 23.747);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      name: 'Test fixture cafe',
      category: 'cafe',
      lat: 37.97,
      lon: 23.748,
      address: 'Example Street 1, Athens, Greece',
      website: 'https://example.test/',
    });
    expect(places[0].mapUrl).toContain('mlat=37.97');
    await fetchNearbyPlaces(37.969, 23.747);
    expect(fetchMock).toHaveBeenCalledOnce();

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/v2/places');
    expect(requestUrl.searchParams.get('filter')).toBe('circle:23.747,37.969,2000');
    expect(requestUrl.searchParams.get('limit')).toBe('25');
    expect(requestUrl.searchParams.get('categories')).toContain('catering.cafe');
    expect(requestUrl.searchParams.get('categories')).toContain('catering.restaurant');
    expect(requestUrl.searchParams.get('categories')).toContain('catering.pub');
    expect(requestUrl.searchParams.get('categories')).toContain('entertainment');
    expect(requestUrl.searchParams.get('categories')).toContain('leisure');
  });

  it('removes duplicate nearby Geoapify entries but keeps distinct branches', async () => {
    const fetchMock = vi.mocked(fetch);
    const properties = (placeId: string, name: string, lon: number) => ({
      place_id: placeId,
      name,
      lat: 37.968,
      lon,
      categories: ['catering.cafe'],
      formatted: 'Athens, Greece',
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [
      { properties: properties('cafe-1', 'Ágora Cafe', 23.747) },
      { properties: properties('cafe-duplicate', 'Agora   Café', 23.7471) },
      { properties: properties('cafe-branch', 'Agora Cafe', 23.7485) },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const places = await fetchNearbyPlaces(37.968, 23.747);
    expect(places.map((place) => place.id)).toEqual(['cafe-1', 'cafe-branch']);
  });

  it('builds the official Geoapify OSM Carto tile URL from the configured key', () => {
    expect(geoapifyMapTileUrl()).toBe(
      'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=test-geoapify-key',
    );
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
    expect(geoapifyMapTileUrl).toThrow(/API key is missing/i);
  });

  it('reports missing keys, invalid keys, rate limits, and network failures distinctly', async () => {
    const fetchMock = vi.mocked(fetch);
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
    await expect(searchLocations('Missing key test')).rejects.toThrow(/API key is missing/i);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-geoapify-key');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(searchLocations('Syntagma')).rejects.toThrow(/rejected the API key/i);

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    await expect(searchLocations('Galatsi')).rejects.toThrow(/rate limit reached/i);

    fetchMock.mockRejectedValueOnce(new TypeError('network unavailable'));
    await expect(searchLocations('Marousi')).rejects.toThrow(/could not be reached/i);
  });

  it('ranks interest matches first, then proximity, then mood and time category fit', () => {
    const places: GeoapifyPlace[] = [
      {
        id: 'near-cafe',
        name: 'Nearby cafe',
        category: 'cafe',
        sourceCategories: ['catering.cafe'],
        lat: 37.97,
        lon: 23.748,
        address: 'Address unavailable',
        website: '',
        mapUrl: '',
        distanceKm: 0,
        interestMatchCount: 0,
        interestParticipantCount: 0,
        preferenceMatchCount: 0,
        preferenceParticipantCount: 0,
      },
      {
        id: 'far-cafe',
        name: 'Farther cafe',
        category: 'cafe',
        sourceCategories: ['catering.cafe'],
        lat: 37.99,
        lon: 23.75,
        address: 'Address unavailable',
        website: '',
        mapUrl: '',
        distanceKm: 0,
        interestMatchCount: 0,
        interestParticipantCount: 0,
        preferenceMatchCount: 0,
        preferenceParticipantCount: 0,
      },
      {
        id: 'near-park',
        name: 'Nearby park',
        category: 'activity',
        sourceCategories: ['leisure.park'],
        lat: 37.9701,
        lon: 23.748,
        address: 'Address unavailable',
        website: '',
        mapUrl: '',
        distanceKm: 0,
        interestMatchCount: 0,
        interestParticipantCount: 0,
        preferenceMatchCount: 0,
        preferenceParticipantCount: 0,
      },
    ];

    const ranked = rankPlaces(places, [{
      categories: ['Coffee'],
      mood: ['Chill'],
      time: ['30 minutes'],
      budget: ['Free'],
    }], { lat: 37.969, lon: 23.747 });

    expect(ranked.map((place) => place.id)).toEqual(['near-cafe', 'far-cafe', 'near-park']);
    expect(ranked[0].interestMatchCount).toBe(1);
    expect(ranked[0].preferenceMatchCount).toBe(1);

    const manyPlaces = Array.from({ length: 10 }, (_, index) => ({
      ...places[0],
      id: `place-${index}`,
      name: `Nearby cafe ${index}`,
      lon: 23.747 + index * 0.0001,
    }));
    expect(maxRecommendations).toBe(7);
    expect(rankPlaces(manyPlaces, [{ categories: ['Coffee'] }], { lat: 37.969, lon: 23.747 })
      .map((place) => place.id)).toEqual(Array.from({ length: 7 }, (_, index) => `place-${index}`));
  });
});
