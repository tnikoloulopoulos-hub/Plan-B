import type { PlaceCategory } from './data';

export type LocationSelection = {
  name: string;
  lat: number;
  lon: number;
  source: 'manual';
};

export type LocationSearchResult = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type GeoapifyPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  sourceCategories: string[];
  lat: number;
  lon: number;
  address: string;
  website: string;
  mapUrl: string;
  distanceKm: number;
  interestMatchCount: number;
  interestParticipantCount: number;
  preferenceMatchCount: number;
  preferenceParticipantCount: number;
};

type GeocodeProperties = {
  place_id?: unknown;
  formatted?: unknown;
  lat?: unknown;
  lon?: unknown;
  country_code?: unknown;
  state?: unknown;
};

type PlaceProperties = {
  place_id?: unknown;
  name?: unknown;
  lat?: unknown;
  lon?: unknown;
  formatted?: unknown;
  address_line1?: unknown;
  address_line2?: unknown;
  website?: unknown;
  categories?: unknown;
};

type MemberPreferences = {
  budget?: string[];
  categories?: string[];
  mood?: string[];
  time?: string[];
};

const geocodingUrl = 'https://api.geoapify.com/v1/geocode/search';
const placesUrl = 'https://api.geoapify.com/v2/places';
const athensFilter = 'rect:23.55,37.85,24.05,38.15';
const searchRadiusMeters = 2000;
const placesLimit = 25;
export const maxRecommendations = 7;
const requestTimeoutMs = 12000;
const geocodeCache = new Map<string, LocationSearchResult[]>();
const placesCache = new Map<string, GeoapifyPlace[]>();
const suggestedAthensAreas = [
  'Pangrati',
  'Syntagma',
  'Kolonaki',
  'Koukaki',
  'Exarchia',
  'Gazi',
  'Monastiraki',
  'Galatsi',
  'Marousi',
  'Nea Smyrni',
] as const;

export { placesLimit, searchRadiusMeters, suggestedAthensAreas };

function getApiKey(): string {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Geoapify API key is missing. Add VITE_GEOAPIFY_API_KEY to your .env.local file.');
  }
  return apiKey;
}

export function isAthensCoordinate(lat: number, lon: number): boolean {
  return lat >= 37.85 && lat <= 38.15 && lon >= 23.55 && lon <= 24.05;
}

export function geoapifyMapTileUrl(): string {
  return `https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(getApiKey())}`;
}

async function requestJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Geoapify request timed out. Please try again.');
      }
      throw new Error('Geoapify could not be reached. Check your connection and try again.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Geoapify rejected the API key. Check that it is valid and that its referrer restrictions allow this app.');
    }
    if (response.status === 429) {
      throw new Error('Geoapify rate limit reached. Please wait a moment and try again.');
    }
    if (!response.ok) {
      throw new Error(`Geoapify request failed (HTTP ${response.status}). Please try again later.`);
    }

    try {
      return await response.json();
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Geoapify request timed out. Please try again.');
      }
      throw new Error('Geoapify returned an invalid response. Please try again.');
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function geocodeResult(value: unknown): LocationSearchResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const properties = value as GeocodeProperties;
  const lat = Number(properties.lat);
  const lon = Number(properties.lon);
  const state = typeof properties.state === 'string' ? properties.state : '';
  if (
    typeof properties.formatted !== 'string' ||
    !properties.formatted.trim() ||
    properties.country_code !== 'gr' ||
    !/^(attica|αττικ)/i.test(state.trim()) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !isAthensCoordinate(lat, lon)
  ) return null;
  return {
    id: typeof properties.place_id === 'string' ? properties.place_id : `${lat},${lon}`,
    name: properties.formatted,
    lat,
    lon,
  };
}

async function geocodeLocations(normalized: string, limit: number): Promise<LocationSearchResult[]> {
  const cacheKey = `${normalized.toLocaleLowerCase()}|${limit}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(geocodingUrl);
  url.search = new URLSearchParams({
    text: `${normalized}, Athens, Greece`,
    filter: athensFilter,
    limit: String(limit),
    lang: 'en',
    format: 'json',
    apiKey: getApiKey(),
  }).toString();
  const payload = await requestJson(url);
  if (typeof payload !== 'object' || payload === null || !('results' in payload) || !Array.isArray(payload.results)) {
    throw new Error('Geoapify returned an invalid location response. Please try again.');
  }
  const results = payload.results
    .map(geocodeResult)
    .filter((result): result is LocationSearchResult => result !== null);
  geocodeCache.set(cacheKey, results);
  return results;
}

export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('Enter an Athens neighbourhood or area to search.');
  return geocodeLocations(normalized, 5);
}

export async function resolveSuggestedArea(area: string): Promise<LocationSearchResult> {
  const normalizedArea = suggestedAthensAreas.find((suggestion) =>
    suggestion.toLocaleLowerCase() === area.trim().toLocaleLowerCase(),
  );
  if (!normalizedArea) throw new Error('Choose a neighbourhood from the suggested Athens areas.');

  const [result] = await geocodeLocations(normalizedArea, 1);
  if (!result) {
    throw new Error(`Geoapify could not verify ${normalizedArea} as a location in Athens, Greece.`);
  }
  return { ...result, name: `${normalizedArea}, Athens, Greece` };
}

function placeCategory(categories: string[]): PlaceCategory | null {
  if (categories.some((category) => category.startsWith('catering.cafe'))) return 'cafe';
  if (categories.some((category) =>
    category.startsWith('catering.restaurant') ||
    category.startsWith('catering.fast_food') ||
    category.startsWith('catering.food_court') ||
    category.startsWith('catering.ice_cream'),
  )) return 'restaurant';
  if (categories.some((category) =>
    category.startsWith('catering.bar') ||
    category.startsWith('catering.pub') ||
    category.startsWith('catering.biergarten') ||
    category.startsWith('catering.taproom'),
  )) return 'bar';
  if (categories.some((category) =>
    category.startsWith('entertainment') ||
    category.startsWith('activity') ||
    category.startsWith('leisure') ||
    category.startsWith('sport') ||
    category.startsWith('tourism'),
  )) return 'activity';
  return null;
}

function validWebsite(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function placeFromFeature(value: unknown, origin: Pick<LocationSelection, 'lat' | 'lon'>): GeoapifyPlace | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('properties' in value) ||
    typeof value.properties !== 'object' ||
    value.properties === null
  ) return null;
  const properties = value.properties as PlaceProperties;
  const lat = Number(properties.lat);
  const lon = Number(properties.lon);
  const name = typeof properties.name === 'string' ? properties.name.trim() : '';
  const categories = Array.isArray(properties.categories)
    ? properties.categories.filter((category): category is string => typeof category === 'string')
    : [];
  const category = placeCategory(categories);
  if (!name || !category || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = typeof properties.formatted === 'string' && properties.formatted.trim()
    ? properties.formatted
    : [properties.address_line1, properties.address_line2]
      .filter((line): line is string => typeof line === 'string' && Boolean(line.trim()))
      .join(', ') || 'Address unavailable';
  const mapUrl = new URL('https://www.openstreetmap.org/');
  mapUrl.searchParams.set('mlat', String(lat));
  mapUrl.searchParams.set('mlon', String(lon));
  mapUrl.hash = `map=18/${lat}/${lon}`;

  return {
    id: typeof properties.place_id === 'string' ? properties.place_id : `${lat},${lon}`,
    name,
    category,
    sourceCategories: categories,
    lat,
    lon,
    address,
    website: validWebsite(properties.website),
    mapUrl: mapUrl.toString(),
    distanceKm: distanceBetweenKm(origin.lat, origin.lon, lat, lon),
    interestMatchCount: 0,
    interestParticipantCount: 0,
    preferenceMatchCount: 0,
    preferenceParticipantCount: 0,
  };
}

const interestCategories: Record<string, string[]> = {
  Coffee: ['catering.cafe'],
  Food: ['catering.restaurant', 'catering.fast_food', 'catering.food_court', 'catering.ice_cream'],
  Drinks: ['catering.bar', 'catering.pub', 'catering.biergarten', 'catering.taproom'],
  Outdoors: ['leisure', 'sport', 'natural', 'national_park'],
  Entertainment: ['entertainment', 'activity', 'tourism'],
};

function hasCategory(place: GeoapifyPlace, prefixes: string[]): boolean {
  return place.sourceCategories.some((category) => prefixes.some((prefix) => category.startsWith(prefix)));
}

function moodCategoryFit(place: GeoapifyPlace, moods: string[]): boolean {
  return moods.some((mood) => {
    if (mood === 'Chill') {
      return place.category === 'cafe' || hasCategory(place, ['leisure.park', 'entertainment.culture', 'entertainment.museum']);
    }
    if (mood === 'Social') return place.category === 'restaurant' || place.category === 'bar' || place.category === 'cafe';
    if (mood === 'Adventurous') return hasCategory(place, ['activity', 'entertainment', 'sport', 'leisure']);
    if (mood === 'Treat yourself') return place.category === 'restaurant' || place.category === 'cafe' || place.category === 'bar';
    return false;
  });
}

function timeCategoryFit(place: GeoapifyPlace, times: string[]): boolean {
  return times.some((time) => {
    if (time === '30 minutes') return place.category === 'cafe' || hasCategory(place, ['catering.fast_food', 'leisure.park']);
    if (time === '1 hour') return place.category === 'cafe' || place.category === 'restaurant' || hasCategory(place, ['leisure.park']);
    if (time === '2 hours') return place.category === 'restaurant' || place.category === 'activity' || place.category === 'bar';
    if (time === '4+ hours') return hasCategory(place, ['leisure', 'sport', 'entertainment', 'activity']);
    return false;
  });
}

export function rankPlaces(
  places: GeoapifyPlace[],
  members: MemberPreferences[],
  origin: Pick<LocationSelection, 'lat' | 'lon'>,
): GeoapifyPlace[] {
  return places.map((place) => {
    const interestedMembers = members.filter((member) => (member.categories?.length ?? 0) > 0);
    const interestMatchCount = interestedMembers.filter((member) =>
      member.categories?.some((interest) =>
        interestCategories[interest]?.some((prefix) => hasCategory(place, [prefix])),
      ),
    ).length;
    const preferenceMembers = members.filter((member) => (member.mood?.length ?? 0) > 0 || (member.time?.length ?? 0) > 0);
    const preferenceMatchCount = preferenceMembers.filter((member) =>
      moodCategoryFit(place, member.mood ?? []) || timeCategoryFit(place, member.time ?? []),
    ).length;
    return {
      ...place,
      distanceKm: distanceBetweenKm(origin.lat, origin.lon, place.lat, place.lon),
      interestMatchCount,
      interestParticipantCount: interestedMembers.length,
      preferenceMatchCount,
      preferenceParticipantCount: preferenceMembers.length,
    };
  }).sort((a, b) =>
    b.interestMatchCount - a.interestMatchCount ||
    a.distanceKm - b.distanceKm ||
    b.preferenceMatchCount - a.preferenceMatchCount ||
    a.name.localeCompare(b.name),
  ).slice(0, maxRecommendations);
}

function distanceBetweenKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(latB - latA);
  const longitudeDifference = radians(lonB - lonA);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizedPlaceName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function deduplicatePlaces(places: GeoapifyPlace[]): GeoapifyPlace[] {
  const uniquePlaces: GeoapifyPlace[] = [];
  const placeIds = new Set<string>();
  for (const place of places) {
    const name = normalizedPlaceName(place.name);
    const duplicate = placeIds.has(place.id) || uniquePlaces.some((existing) =>
      normalizedPlaceName(existing.name) === name &&
      distanceBetweenKm(existing.lat, existing.lon, place.lat, place.lon) <= 0.05,
    );
    if (!duplicate) {
      uniquePlaces.push(place);
      placeIds.add(place.id);
    }
  }
  return uniquePlaces;
}

export async function fetchNearbyPlaces(lat: number, lon: number): Promise<GeoapifyPlace[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isAthensCoordinate(lat, lon)) {
    throw new Error('Choose a valid meeting area in Athens, Greece before searching for places.');
  }
  const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = placesCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(placesUrl);
  url.search = new URLSearchParams({
    categories: [
      'catering.cafe',
      'catering.restaurant',
      'catering.fast_food',
      'catering.bar',
      'catering.pub',
      'catering.biergarten',
      'catering.taproom',
      'entertainment',
      'activity',
      'leisure',
      'sport.sports_centre',
      'sport.fitness',
      'sport.swimming_pool',
    ].join(','),
    filter: `circle:${lon},${lat},${searchRadiusMeters}`,
    limit: String(placesLimit),
    lang: 'en',
    apiKey: getApiKey(),
  }).toString();
  const payload = await requestJson(url);
  if (typeof payload !== 'object' || payload === null || !('features' in payload) || !Array.isArray(payload.features)) {
    throw new Error('Geoapify returned an invalid places response. Please try again.');
  }

  const places = deduplicatePlaces(payload.features
    .map((feature) => placeFromFeature(feature, { lat, lon }))
    .filter((place): place is GeoapifyPlace => place !== null)
    .filter((place) => place.distanceKm <= searchRadiusMeters / 1000))
    .slice(0, placesLimit);
  placesCache.set(cacheKey, places);
  return places;
}
