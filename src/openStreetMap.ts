import type { PlaceCategory } from './data';

export type LocationSelection = {
  name: string;
  lat: number;
  lon: number;
  source: 'current' | 'manual';
};

export type LocationSearchResult = {
  name: string;
  lat: number;
  lon: number;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
};

export type OpenStreetMapPlace = {
  id: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string;
  cuisine: string;
  openingHours: string;
  cost: string;
  description: string;
  phone: string;
  website: string;
  distanceKm: number;
  interestMatchCount: number;
  interestParticipantCount: number;
  distanceMatchCount: number;
  distanceParticipantCount: number;
  knownBudgetMatchCount: number;
  budgetParticipantCount: number;
};

type NominatimResult = {
  address?: Record<string, unknown>;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
};

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: unknown;
};

type OverpassResponse = {
  elements?: unknown;
  remark?: unknown;
};

type MemberPreferences = {
  budget: string[];
  categories: string[];
  distance: string[];
};

const nominatimCacheStorageKey = 'planb-nominatim-cache-v2';
const nominatimThrottleStorageKey = 'planb-nominatim-next-request-v2';
const nearbyPlacesCacheStorageKey = 'planb-nearby-places-cache-v1';
const nearbyPlacesCache = new Map<string, OpenStreetMapPlace[]>();
const nearbyPlacesInFlight = new Map<string, Promise<OpenStreetMapPlace[]>>();
const nominatimCache = new Map<string, unknown>();
let nextNominatimRequestAt = 0;
let nominatimRequestQueue: Promise<void> = Promise.resolve();
const nearbyRadiusMeters = 1500;
const overpassEndpoints = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const overpassRequestTimeoutMs = 10000;
const overpassRetryDelayMs = 300;
const maxCachedNearbyLocations = 10;

class OverpassQueryError extends Error {
  constructor(status: number) {
    super(`The Overpass places query was rejected (HTTP ${status}). Please try again later.`);
    this.name = 'OverpassQueryError';
  }
}

function coordinateKey(lat: number, lon: number) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function getCachedNearbyPlaces(key: string): OpenStreetMapPlace[] | undefined {
  if (nearbyPlacesCache.has(key)) return nearbyPlacesCache.get(key);
  try {
    const stored = window.sessionStorage.getItem(nearbyPlacesCacheStorageKey);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || !(key in parsed)) return undefined;
    const places: unknown = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(places) || !places.every(isCachedNearbyPlace)) return undefined;
    nearbyPlacesCache.set(key, places);
    return places;
  } catch (error) {
    console.error('Could not read the nearby places cache.', error);
    return undefined;
  }
}

function isCachedNearbyPlace(value: unknown): value is OpenStreetMapPlace {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as Record<string, unknown>;
  return typeof place.id === 'string' &&
    (place.osmType === 'node' || place.osmType === 'way' || place.osmType === 'relation') &&
    typeof place.osmId === 'number' &&
    typeof place.name === 'string' &&
    (place.category === 'cafe' || place.category === 'restaurant' || place.category === 'bar' || place.category === 'activity') &&
    typeof place.lat === 'number' &&
    typeof place.lon === 'number' &&
    typeof place.address === 'string' &&
    typeof place.cuisine === 'string' &&
    typeof place.openingHours === 'string' &&
    typeof place.cost === 'string' &&
    typeof place.description === 'string' &&
    typeof place.phone === 'string' &&
    typeof place.website === 'string' &&
    typeof place.distanceKm === 'number' &&
    typeof place.interestMatchCount === 'number' &&
    typeof place.interestParticipantCount === 'number' &&
    typeof place.distanceMatchCount === 'number' &&
    typeof place.distanceParticipantCount === 'number' &&
    typeof place.knownBudgetMatchCount === 'number' &&
    typeof place.budgetParticipantCount === 'number';
}

function cacheNearbyPlaces(key: string, places: OpenStreetMapPlace[]) {
  nearbyPlacesCache.set(key, places);
  try {
    const stored = window.sessionStorage.getItem(nearbyPlacesCacheStorageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    const previous = typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
    previous[key] = places;
    const keys = Object.keys(previous);
    for (const oldKey of keys.slice(0, Math.max(0, keys.length - maxCachedNearbyLocations))) {
      delete previous[oldKey];
    }
    window.sessionStorage.setItem(nearbyPlacesCacheStorageKey, JSON.stringify(previous));
  } catch (error) {
    console.error('Could not write the nearby places cache.', error);
  }
}

function waitBeforeOverpassRetry(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, overpassRetryDelayMs));
}

function getCachedNominatimValue<T>(key: string): T | undefined {
  if (nominatimCache.has(key)) return nominatimCache.get(key) as T;
  try {
    const stored = window.sessionStorage.getItem(nominatimCacheStorageKey);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || !(key in parsed)) return undefined;
    const value = (parsed as Record<string, unknown>)[key] as T;
    nominatimCache.set(key, value);
    return value;
  } catch (error) {
    console.error('Could not read the Nominatim cache.', error);
    return undefined;
  }
}

function cacheNominatimValue(key: string, value: unknown) {
  nominatimCache.set(key, value);
  try {
    const stored = window.sessionStorage.getItem(nominatimCacheStorageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    const previous = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    previous[key] = value;
    window.sessionStorage.setItem(
      nominatimCacheStorageKey,
      JSON.stringify(Object.fromEntries(Object.entries(previous).slice(-100))),
    );
  } catch (error) {
    console.error('Could not persist the Nominatim cache.', error);
  }
}

async function waitForNominatimSlot() {
  while (true) {
    let nextAllowedAt = nextNominatimRequestAt;
    try {
      const stored = window.localStorage.getItem(nominatimThrottleStorageKey);
      const sharedNextRequestAt = Number(stored?.split(':')[0]);
      if (Number.isFinite(sharedNextRequestAt)) nextAllowedAt = Math.max(nextAllowedAt, sharedNextRequestAt);
    } catch (error) {
      console.error('Could not read the Nominatim rate limit.', error);
    }

    const wait = nextAllowedAt - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, wait));
      continue;
    }

    const nextRequestAt = Date.now() + 1100;
    const lease = `${nextRequestAt}:${Math.random()}`;
    try {
      window.localStorage.setItem(nominatimThrottleStorageKey, lease);
      if (window.localStorage.getItem(nominatimThrottleStorageKey) !== lease) {
        await new Promise((resolve) => window.setTimeout(resolve, 25));
        continue;
      }
    } catch (error) {
      console.error('Could not persist the Nominatim rate limit.', error);
    }
    nextNominatimRequestAt = nextRequestAt;
    return;
  }
}

async function requestNominatim<T>(key: string, url: URL, parse: (payload: unknown) => T): Promise<T> {
  const cached = getCachedNominatimValue<T>(key);
  if (cached !== undefined) return cached;

  const request = nominatimRequestQueue.then(async () => {
    const queuedCache = getCachedNominatimValue<T>(key);
    if (queuedCache !== undefined) return queuedCache;
    await waitForNominatimSlot();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Location lookup took too long. Try again or enter a location manually.');
      }
      throw new Error('Location lookup could not connect. Check your connection or try again later.');
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (response.status === 429) throw new Error('Location lookup is busy. Please wait a moment and try again.');
    if (!response.ok) throw new Error('Location lookup is temporarily unavailable. Try again or enter a location manually.');
    let result: T;
    try {
      result = parse(await response.json());
    } catch (error) {
      if (error instanceof Error && /invalid response|could not identify|no matching|Enter a city/i.test(error.message)) throw error;
      throw new Error('Location lookup returned an invalid response. Try again or enter a location manually.');
    }
    cacheNominatimValue(key, result);
    return result;
  });
  nominatimRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

function makeSearchResult(result: NominatimResult): LocationSearchResult | null {
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (
    typeof result.display_name !== 'string' || !result.display_name.trim() ||
    !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
    (result.osm_type !== 'node' && result.osm_type !== 'way' && result.osm_type !== 'relation') ||
    typeof result.osm_id !== 'number'
  ) return null;
  return { name: result.display_name, lat, lon, osmType: result.osm_type, osmId: result.osm_id };
}

export function searchLocations(query: string): Promise<LocationSearchResult[]> {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (!normalized) return Promise.reject(new Error('Enter a city or neighbourhood to search.'));
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: normalized,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  }).toString();
  return requestNominatim(`search:${normalized.toLocaleLowerCase()}`, url, (payload) => {
    if (!Array.isArray(payload)) throw new Error('Location search returned an invalid response.');
    return payload.map((result) => makeSearchResult(result as NominatimResult)).filter((result): result is LocationSearchResult => result !== null);
  });
}

function reverseGeocodeName(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('The place-name service returned an invalid response.');
  }
  const result = payload as NominatimResult;
  const address = result.address ?? {};
  const neighbourhood = ['neighbourhood', 'suburb', 'city_district', 'borough']
    .map((key) => address[key])
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  const city = ['city', 'town', 'village', 'municipality', 'county']
    .map((key) => address[key])
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  if (neighbourhood && city && neighbourhood !== city) return `${neighbourhood}, ${city}`;
  if (neighbourhood) return neighbourhood;
  if (city) return city;
  if (typeof result.display_name === 'string' && result.display_name.trim()) {
    return result.display_name.split(',').slice(0, 2).join(',').trim();
  }
  throw new Error('We found your coordinates but could not identify a place name.');
}

export function reverseGeocodeLocation(lat: number, lon: number): Promise<string> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '14',
    addressdetails: '1',
  }).toString();
  return requestNominatim(`reverse:${coordinateKey(lat, lon)}`, url, reverseGeocodeName);
}

function categoryForTags(tags: Record<string, string>): PlaceCategory | null {
  if (tags.amenity === 'cafe') return 'cafe';
  if (['restaurant', 'fast_food', 'food_court', 'ice_cream'].includes(tags.amenity)) return 'restaurant';
  if (['bar', 'pub', 'biergarten'].includes(tags.amenity)) return 'bar';
  if (tags.amenity || tags.leisure || tags.tourism) return 'activity';
  return null;
}

function stringTag(tags: Record<string, string>, ...keys: string[]): string {
  return keys.map((key) => tags[key]?.trim()).find((value) => Boolean(value)) ?? 'Not available';
}

function placeFromElement(element: OverpassElement): OpenStreetMapPlace | null {
  if (
    (element.type !== 'node' && element.type !== 'way' && element.type !== 'relation') ||
    typeof element.id !== 'number' ||
    typeof element.tags !== 'object' || element.tags === null
  ) return null;
  const tags = element.tags as Record<string, string>;
  const category = categoryForTags(tags);
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (!category || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = stringTag(tags, 'addr:full') !== 'Not available'
    ? stringTag(tags, 'addr:full')
    : [
      [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      tags['addr:suburb'] ?? tags['addr:city'],
      tags['addr:postcode'],
    ].filter(Boolean).join(', ') || 'Not available';
  const cost = stringTag(tags, 'charge', 'price') !== 'Not available'
    ? stringTag(tags, 'charge', 'price')
    : tags.fee === 'no' ? 'No fee' : tags.fee === 'yes' ? 'Fee required' : 'Not available';

  return {
    id: `${element.type}/${element.id}`,
    osmType: element.type,
    osmId: element.id,
    name: stringTag(tags, 'name'),
    category,
    lat,
    lon,
    address,
    cuisine: stringTag(tags, 'cuisine'),
    openingHours: stringTag(tags, 'opening_hours'),
    cost,
    description: stringTag(tags, 'description'),
    phone: stringTag(tags, 'phone', 'contact:phone'),
    website: stringTag(tags, 'website', 'contact:website'),
    distanceKm: 0,
    interestMatchCount: 0,
    interestParticipantCount: 0,
    distanceMatchCount: 0,
    distanceParticipantCount: 0,
    knownBudgetMatchCount: 0,
    budgetParticipantCount: 0,
  };
}

function parseOverpassPlaces(payload: unknown): OpenStreetMapPlace[] {
  if (typeof payload !== 'object' || payload === null) throw new Error('The places service returned an invalid response.');
  const response = payload as OverpassResponse;
  if (typeof response.remark === 'string' && response.remark) {
    throw new Error('The OpenStreetMap places service could not complete this search. Try again shortly.');
  }
  if (!Array.isArray(response.elements)) throw new Error('The places service returned an invalid response.');
  const uniquePlaces = new Map<string, OpenStreetMapPlace>();
  for (const element of response.elements) {
    const place = placeFromElement(element as OverpassElement);
    if (place) uniquePlaces.set(place.id, place);
  }
  return [...uniquePlaces.values()];
}

const interestCategories: Record<string, PlaceCategory> = {
  Coffee: 'cafe',
  Food: 'restaurant',
  Drinks: 'bar',
  Outdoors: 'activity',
  Entertainment: 'activity',
};

function budgetMaximum(preference: string): number | null {
  if (preference === 'Free') return 0;
  if (preference === '€1–10') return 10;
  if (preference === '€10–20') return 20;
  if (preference === '€20+') return Number.POSITIVE_INFINITY;
  return null;
}

function numericEuroPrice(cost: string): number | null {
  const match = cost.match(/^€\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function budgetFit(member: MemberPreferences, place: OpenStreetMapPlace): boolean | null {
  if (!member.budget.length) return null;
  if (place.cost === 'No fee') return true;
  if (place.cost === 'Fee required') return member.budget.includes('Free') ? false : null;
  const price = numericEuroPrice(place.cost);
  if (price === null) return null;
  const maximums = member.budget.map(budgetMaximum).filter((value): value is number => value !== null);
  if (!maximums.length) return null;
  return price <= Math.max(...maximums);
}

function distanceBetweenKm(latA: number, lonA: number, latB: number, lonB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(latB - latA);
  const longitudeDifference = radians(lonB - lonA);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function distanceLimit(member: MemberPreferences): number | null {
  if (member.distance?.includes('Walkable')) return 2;
  if (member.distance?.includes('Up to 5 km')) return 5;
  if (member.distance?.includes('Anywhere')) return Number.POSITIVE_INFINITY;
  return null;
}

export function rankPlaces(places: OpenStreetMapPlace[], members: MemberPreferences[], origin?: Pick<LocationSelection, 'lat' | 'lon'>): OpenStreetMapPlace[] {
  return places.map((place) => {
    const interestedMembers = members.filter((member) => member.categories.length > 0);
    const interestMatchCount = interestedMembers.filter((member) =>
      member.categories.some((category) => interestCategories[category] === place.category),
    ).length;
    const distanceKm = origin ? distanceBetweenKm(origin.lat, origin.lon, place.lat, place.lon) : 0;
    const distanceMembers = members.map((member) => distanceLimit(member)).filter((limit): limit is number => limit !== null);
    const distanceMatchCount = members.filter((member) => {
      const limit = distanceLimit(member);
      return limit !== null && distanceKm <= limit;
    }).length;
    const budgetMatches = members.map((member) => budgetFit(member, place)).filter((fit) => fit !== null);
    return {
      ...place,
      distanceKm,
      interestMatchCount,
      interestParticipantCount: interestedMembers.length,
      distanceMatchCount,
      distanceParticipantCount: distanceMembers.length,
      knownBudgetMatchCount: budgetMatches.filter(Boolean).length,
      budgetParticipantCount: budgetMatches.length,
    };
  }).sort((a, b) =>
    b.interestMatchCount - a.interestMatchCount ||
    b.knownBudgetMatchCount - a.knownBudgetMatchCount ||
    b.distanceMatchCount - a.distanceMatchCount ||
    a.name.localeCompare(b.name),
  );
}

export async function fetchNearbyPlaces(lat: number, lon: number): Promise<OpenStreetMapPlace[]> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error('Choose a valid map location before searching for nearby places.');
  }
  const cacheKey = `${nearbyRadiusMeters}:${coordinateKey(lat, lon)}`;
  const cached = getCachedNearbyPlaces(cacheKey);
  if (cached !== undefined) return cached;
  const inFlight = nearbyPlacesInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const query = [
    '[out:json][timeout:8];',
    '(',
    `nwr["amenity"~"^(cafe|restaurant|fast_food|food_court|ice_cream|bar|pub|biergarten|cinema|theatre|nightclub|arts_centre|community_centre|events_venue|marketplace)$"](around:${nearbyRadiusMeters},${lat},${lon});`,
    `nwr["leisure"~"^(park|garden|sports_centre|swimming_pool|fitness_centre|bowling_alley|escape_game)$"](around:${nearbyRadiusMeters},${lat},${lon});`,
    `nwr["tourism"~"^(museum|gallery|attraction|zoo|aquarium)$"](around:${nearbyRadiusMeters},${lat},${lon});`,
    ');out center tags 150;',
  ].join('');

  const request = (async () => {
    const failures: { kind: 'timeout' | 'network' | 'rate-limit' | 'http' | 'response'; status?: number }[] = [];
    for (const endpoint of overpassEndpoints) {
      let retried = false;
      while (true) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), overpassRequestTimeoutMs);
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: new URLSearchParams({ data: query }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            const kind = response.status === 429 ? 'rate-limit' : 'http';
            failures.push({ kind, status: response.status });
            console.warn(`Overpass endpoint ${endpoint} returned HTTP ${response.status}.`);
            if (response.status === 400 || response.status === 422) {
              throw new OverpassQueryError(response.status);
            }
            if (retryable && !retried) {
              retried = true;
              await waitBeforeOverpassRetry();
              continue;
            }
            break;
          }
          try {
            const places = parseOverpassPlaces(await response.json());
            cacheNearbyPlaces(cacheKey, places);
            return places;
          } catch {
            failures.push({ kind: 'response' });
            console.warn(`Overpass endpoint ${endpoint} returned an invalid or incomplete response.`);
            break;
          }
        } catch (error) {
          if (error instanceof OverpassQueryError) throw error;
          const timedOut = error instanceof Error && /AbortError|TimeoutError/.test(error.name);
          failures.push({ kind: timedOut ? 'timeout' : 'network' });
          console.warn(`Overpass endpoint ${endpoint} could not complete the request.`, error);
          if (!timedOut && !retried) {
            retried = true;
            await waitBeforeOverpassRetry();
            continue;
          }
          break;
        }
        finally {
          window.clearTimeout(timeoutId);
        }
      }
    }

    if (failures.length > 0 && failures.every((failure) => failure.kind === 'rate-limit')) {
      throw new Error('The OpenStreetMap places services are busy. Please wait a moment and try again.');
    }
    if (failures.length > 0 && failures.every((failure) => failure.kind === 'timeout')) {
      throw new Error('The nearby places search timed out on available OpenStreetMap services. Try again shortly.');
    }
    if (failures.length > 0 && failures.every((failure) => failure.kind === 'network')) {
      throw new Error('Nearby places services could not be reached. Check your connection or try again.');
    }
    const statuses = [...new Set(failures.flatMap((failure) => failure.status === undefined ? [] : [failure.status]))];
    if (statuses.length) {
      throw new Error(`The places service is temporarily unavailable after trying all Overpass endpoints (HTTP ${statuses.join(', ')}). Try again shortly.`);
    }
    if (failures.some((failure) => failure.kind === 'timeout')) {
      throw new Error('Nearby places services were slow or unavailable. Try again shortly.');
    }
    if (failures.some((failure) => failure.kind === 'response')) {
      throw new Error('The places service returned incomplete data from all Overpass endpoints. Try searching again shortly.');
    }
    if (failures.some((failure) => failure.kind === 'rate-limit')) {
      throw new Error('The OpenStreetMap places services are busy or unavailable. Please wait a moment and try again.');
    }
    throw new Error('The places service returned incomplete data from all Overpass endpoints. Try searching again shortly.');
  })();
  nearbyPlacesInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (nearbyPlacesInFlight.get(cacheKey) === request) nearbyPlacesInFlight.delete(cacheKey);
  }
}
