import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (originalGeolocationDescriptor) {
    Object.defineProperty(navigator, 'geolocation', originalGeolocationDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'geolocation');
  }
});

async function createGroup(user: ReturnType<typeof userEvent.setup>, participantCount = 2) {
  await user.click(screen.getByRole('button', { name: /make a plan/i }));
  await user.clear(screen.getByLabelText(/what should we call your group/i));
  await user.type(screen.getByLabelText(/what should we call your group/i), 'Friday crew');
  expect((screen.getByLabelText(/how many people are planning/i) as HTMLSelectElement).value).toBe('4');
  expect(screen.getByLabelText(/how many people are planning/i).querySelectorAll('option')).toHaveLength(7);
  await user.selectOptions(screen.getByLabelText(/how many people are planning/i), String(participantCount));
  await user.click(screen.getByRole('button', { name: /^create group$/i }));
}

async function submitPreferences(user: ReturnType<typeof userEvent.setup>, answers: string[]) {
  const preferenceOrder = ['budget', 'time', 'mood', 'categories', 'distance'];
  for (const [index, answer] of answers.entries()) {
    await user.click(screen.getByRole('button', { name: answer }));
    await user.click(screen.getByRole('button', { name: index === preferenceOrder.length - 1 ? /finish my turn/i : /^next$/i }));
  }
}

async function completeSharedDeviceGroup(user: ReturnType<typeof userEvent.setup>) {
  await createGroup(user);
  expect(screen.getByText(/PERSON 1 OF 2/i)).toBeTruthy();
  await user.type(screen.getByLabelText(/^your name$/i), 'Alex');
  await user.click(screen.getByRole('button', { name: /start my preferences/i }));
  await submitPreferences(user, ['€10–20', '1 hour', 'Chill', 'Coffee', 'Walkable']);

  expect(screen.getByText(/PERSON 2 OF 2/i)).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain("Alex's preferences are saved");
  await user.type(screen.getByLabelText(/^your name$/i), 'Riley');
  await user.click(screen.getByRole('button', { name: /start my preferences/i }));
  await submitPreferences(user, ['Free', '30 minutes', 'Adventurous', 'Food', 'Up to 5 km']);
}

describe('Plan B shared-device group journey', () => {
  it('creates a group and collects participant preferences one person at a time', async () => {
    const user = userEvent.setup();
    render(<App />);

    await completeSharedDeviceGroup(user);
    expect(screen.getByRole('status').textContent).toContain('Everyone’s preferences are in');
    expect(screen.queryByRole('button', { name: /join a group|invite friends|share invitation/i })).toBeNull();
    expect(window.localStorage.getItem('planb-session-v2')).toContain('"participantCount":2');

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const isSearch = String(input).includes('nominatim.openstreetmap.org');
      const payload = isSearch ? [{
        display_name: 'My neighbourhood, Galway, Ireland',
        lat: '53.27',
        lon: '-9.05',
        osm_type: 'relation',
        osm_id: 1337,
      }] : {
        elements: [
          { type: 'node', id: 101, lat: 53.271, lon: -9.05, tags: { name: 'Real Roast Cafe', amenity: 'cafe', cuisine: 'coffee_shop' } },
          { type: 'way', id: 202, center: { lat: 53.272, lon: -9.051 }, tags: { name: 'Market Table', amenity: 'restaurant', 'addr:full': '5 Market Street' } },
        ],
      };
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await user.type(screen.getByRole('textbox', { name: /enter a city or neighbourhood/i }), '  My neighbourhood  ');
    await user.click(screen.getByRole('button', { name: /search locations/i }));
    await user.click(await screen.findByRole('button', { name: /My neighbourhood, Galway, Ireland/i }));
    expect(screen.getByText('My neighbourhood, Galway, Ireland')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /review your group/i }));
    expect(screen.getByRole('heading', { name: /Friday crew lineup/i })).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Riley')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: /edit answers/i })[1]);
    expect(screen.getByText(/Editing Riley’s answers/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '€10–20' }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: '1 hour' }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: 'Chill' }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: 'Coffee' }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('status').textContent).toContain("Riley's answers have been updated");
    expect(within(screen.getAllByRole('article')[1]).getByText(/Coffee/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /find our perfect plan/i }));

    expect(await screen.findByRole('heading', { name: 'Real Roast Cafe' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Market Table' })).toBeTruthy();
    expect(screen.getByText(/Interest match for 2 of 2 participants/)).toBeTruthy();
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /interactive map of real OpenStreetMap places/i })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Open OpenStreetMap listing/i })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('overpass-api.de/api/interpreter');
    await user.click(screen.getByRole('button', { name: 'Restaurants' }));
    expect(screen.queryByRole('heading', { name: 'Real Roast Cafe' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Market Table' })).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: /add market table to shortlist/i });
    await user.click(saveButton);
    expect(screen.getByRole('status').textContent).toContain('Market Table added to your shortlist');
  });

  it('detects the current location and reverse-geocodes it with Nominatim', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeSharedDeviceGroup(user);

    const position: GeolocationPosition = {
      coords: {
        latitude: 53.33,
        longitude: -6.26,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    };
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      address: { neighbourhood: 'Ranelagh', city: 'Dublin' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    await waitFor(() => expect(screen.getByText('Current area selected: Ranelagh, Dublin')).toBeTruthy());
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe('https://nominatim.openstreetmap.org');
    expect(requestUrl.searchParams.get('lat')).toBe('53.33');
    expect(requestUrl.searchParams.get('lon')).toBe('-6.26');
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/i })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('planb-session-v2') ?? '{}').selectedLocation).toEqual({
      name: 'Ranelagh, Dublin',
      lat: 53.33,
      lon: -6.26,
      source: 'current',
    });

    await user.click(screen.getByRole('button', { name: /review your group/i }));
    cleanup();

    render(<App />);
    expect(screen.getByRole('heading', { name: /Friday crew lineup/i })).toBeTruthy();
    expect(screen.getByText(/Meet-up area: Ranelagh, Dublin/i)).toBeTruthy();
  });

  it('shows a permission denial and keeps manual location entry available', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeSharedDeviceGroup(user);

    const permissionError: GeolocationPositionError = {
      code: 1,
      message: 'User denied Geolocation',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => error(permissionError));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    const permissionAlert = await screen.findByRole('alert');
    expect(permissionAlert.textContent).toMatch(/permission was denied/i);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const isSearch = String(input).includes('nominatim.openstreetmap.org');
      const payload = isSearch ? [{
        display_name: 'Galway, Ireland',
        lat: '53.28',
        lon: '-9.08',
        osm_type: 'relation',
        osm_id: 1234,
      }] : { error: 'Service unavailable' };
      return Promise.resolve(new Response(JSON.stringify(payload), {
        status: isSearch ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await user.type(screen.getByRole('textbox', { name: /enter a city or neighbourhood/i }), 'Galway');
    await user.click(screen.getByRole('button', { name: /search locations/i }));
    await user.click(await screen.findByRole('button', { name: /Galway, Ireland/i }));
    expect(screen.getByText('Galway, Ireland')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /review your group/i }));
    await user.click(screen.getByRole('button', { name: /find our perfect plan/i }));
    expect(await screen.findByText(/places service is temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Slow Morning Coffee|Olive & Ember|The Lilac Hour/i })).toBeNull();
  });
});
