import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setPreferences(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /make a plan/i }));
  await user.type(screen.getByLabelText('WHAT SHOULD WE CALL YOUR GROUP?'), 'Friday crew');
  await user.click(screen.getByRole('button', { name: /pick the vibe/i }));

  await user.click(screen.getByRole('button', { name: '€1–10' }));
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  await user.click(screen.getByRole('button', { name: '1 hour' }));
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  await user.click(screen.getByRole('button', { name: 'Treat yourself' }));
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  await user.click(screen.getByRole('button', { name: 'Drinks' }));
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  await user.click(screen.getByRole('button', { name: 'Up to 5 km' }));
  await user.click(screen.getByRole('button', { name: /see our mix/i }));
}

async function finishAtRecommendations(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show us the group/i }));
  expect(screen.getByText(/Friday crew lineup/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /find our plan b/i }));
}

describe('Plan B discovery journey', () => {
  it('completes the journey with the simulated current-location permission', async () => {
    const user = userEvent.setup();
    render(<App />);

    await setPreferences(user);
    await user.click(screen.getByRole('button', { name: /use my current location/i }));
      expect(screen.getByRole('dialog', { name: /simulated location permission/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /use demo location/i }));
      expect(screen.getByText(/Using demo location: Dublin City Centre/)).toBeTruthy();
    await finishAtRecommendations(user);

    expect(screen.getByText(/Dublin City Centre · DEMO MAP/i)).toBeTruthy();
    expect(Array.from(document.querySelectorAll('.compatibility-badge strong'), (badge) => badge.textContent)).toEqual(['92%', '84%', '76%']);
      expect(screen.getByText(/Why Olive & Ember is the best compromise/)).toBeTruthy();

    const lilacPin = screen.getByRole('button', { name: 'View The Lilac Hour on map' });
    await user.click(lilacPin);
      expect(lilacPin.getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'This one feels right' }));
      expect(screen.getByRole('status').textContent).toContain('Olive & Ember added to your shortlist');
  });

  it('accepts a manually searched neighbourhood', async () => {
    const user = userEvent.setup();
    render(<App />);

    await setPreferences(user);
    const search = screen.getByRole('textbox', { name: 'Search a city or neighbourhood' });
    await user.type(search, 'Smith');
    await user.click(screen.getByRole('button', { name: 'Smithfield' }));
      expect(screen.getByText('Selected: Smithfield')).toBeTruthy();
    await finishAtRecommendations(user);

    expect(screen.getByText(/Fictional local spots around Smithfield/)).toBeTruthy();
    expect(screen.getByText(/SMITHFIELD · DEMO MAP/i)).toBeTruthy();
      expect(within(screen.getByRole('region', { name: /demonstration map/i })).getByRole('button', { name: 'View Slow Morning Coffee on map' })).toBeTruthy();
  });
});