import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.sessionStorage.clear();
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
    expect(screen.getByRole('heading', { name: 'Plan B – Find your next plan in Athens.' })).toBeTruthy();
    expect(screen.getByText("Discover places and activities in Athens that match your group's interests, budget and mood.")).toBeTruthy();

    await completeSharedDeviceGroup(user);
    expect(screen.getByRole('status').textContent).toContain('Everyone’s preferences are in');
    expect(screen.queryByRole('button', { name: /join a group|invite friends|share invitation/i })).toBeNull();
    expect(window.localStorage.getItem('planb-session-v2')).toContain('"participantCount":2');

    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-geoapify-key');
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.pathname === '/v1/geocode/search') {
        return Promise.resolve(new Response(JSON.stringify({ results: [{
          place_id: 'athens-neighbourhood-1',
          formatted: 'Pangrati, Athens, Greece',
          lat: 37.969,
          lon: 23.747,
          country_code: 'gr',
          state: 'Attica',
        }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }

      return Promise.resolve(new Response(JSON.stringify({ features: [
        { properties: {
          place_id: 'test-cafe-1',
          name: 'Test Geoapify Cafe',
          lat: 37.970,
          lon: 23.748,
          categories: ['catering.cafe', 'catering.cafe.coffee_shop'],
          formatted: 'Example Street 1, Athens, Greece',
        } },
        { properties: {
          place_id: 'test-restaurant-2',
          name: 'Test Geoapify Restaurant',
          lat: 37.971,
          lon: 23.749,
          categories: ['catering.restaurant'],
          formatted: 'Example Street 2, Athens, Greece',
        } },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await user.type(screen.getByRole('textbox', { name: /search an athens neighbourhood/i }), '  Pangrati  ');
    await user.click(screen.getByRole('button', { name: /search Athens areas/i }));
    await user.click(await screen.findByRole('button', { name: /Pangrati, Athens, Greece/i }));
    expect(screen.getByText('Pangrati, Athens, Greece')).toBeTruthy();
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

    expect(await screen.findByRole('heading', { name: 'Test Geoapify Cafe' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Test Geoapify Restaurant' })).toBeTruthy();
    expect(screen.getByText(/Matches selected place interests for 2 of 2 participants/)).toBeTruthy();
    expect(screen.getAllByText(/Reliable price information and exact activity duration are unavailable/).length).toBeGreaterThan(0);
    const map = screen.getByRole('region', { name: /interactive map of real Geoapify places/i });
    expect(map.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
    expect(map.textContent).toContain('OpenStreetMap contributors');
    expect(map.textContent).toContain('Geoapify');
    expect(screen.getAllByRole('link', { name: /View on OpenStreetMap/i })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: /no verified photo for this business is available/i })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geocodeUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(geocodeUrl.origin).toBe('https://api.geoapify.com');
    expect(geocodeUrl.searchParams.get('text')).toBe('Pangrati, Athens, Greece');
    expect(geocodeUrl.searchParams.get('filter')).toContain('rect:');
    expect(geocodeUrl.searchParams.get('apiKey')).toBe('test-geoapify-key');
    const placesUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(placesUrl.pathname).toBe('/v2/places');
    expect(placesUrl.searchParams.get('filter')).toBe('circle:23.747,37.969,2000');
    expect(placesUrl.searchParams.get('limit')).toBe('25');
    expect(placesUrl.searchParams.get('categories')).toContain('catering.cafe');
    expect(placesUrl.searchParams.get('categories')).toContain('entertainment');
    await user.click(screen.getByRole('button', { name: 'Restaurants' }));
    expect(screen.queryByRole('heading', { name: 'Test Geoapify Cafe' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Test Geoapify Restaurant' })).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: /add test geoapify restaurant to shortlist/i });
    await user.click(saveButton);
    expect(screen.getByRole('status').textContent).toContain('Test Geoapify Restaurant added to your shortlist');
  }, 15000);

  it('requires a manual Athens-area selection and does not offer browser GPS', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeSharedDeviceGroup(user);
    expect(screen.getAllByText(/Athens, Greece/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /search an athens neighbourhood/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pangrati' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Syntagma' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Galatsi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /use my current location/i })).toBeNull();
    expect((screen.getByRole('button', { name: /review your group/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects one verified central result for a suggested neighbourhood', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeSharedDeviceGroup(user);

    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-geoapify-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
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
    vi.stubGlobal('fetch', fetchMock);

    await user.click(screen.getByRole('button', { name: 'Syntagma' }));
    expect(await screen.findByText('Syntagma, Athens, Greece')).toBeTruthy();
    expect(document.querySelector('.location-result-list')).toBeNull();
    expect(screen.getByText('Central point verified by Geoapify in Athens, Greece')).toBeTruthy();
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(requestUrl.searchParams.get('text')).toBe('Syntagma, Athens, Greece');
  }, 15000);

  it('rejects Geoapify search results outside Athens, Greece', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeSharedDeviceGroup(user);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{
      place_id: 'outside-athens',
      formatted: 'Thessaloniki, Greece',
      lat: 40.6401,
      lon: 22.9444,
      country_code: 'gr',
      state: 'Central Macedonia',
    }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-geoapify-key');
    vi.stubGlobal('fetch', fetchMock);
    await user.type(screen.getByRole('textbox', { name: /search an athens neighbourhood/i }), 'Thessaloniki');
    await user.click(screen.getByRole('button', { name: /search Athens areas/i }));
    expect(await screen.findByText(/No matching area found in Athens, Greece/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /review your group/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
