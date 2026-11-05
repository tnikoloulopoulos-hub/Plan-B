import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const clipboardWrite = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  clipboardWrite.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

async function createGroupAndJoinMember(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /make a plan/i }));
  const groupName = screen.getByLabelText(/what should we call your group/i);
  await user.clear(groupName);
  await user.type(groupName, 'Friday crew');
  await user.type(screen.getByLabelText(/^your name$/i), 'Alex');
  await user.click(screen.getByRole('button', { name: /^create group$/i }));

  await user.click(screen.getByRole('button', { name: /invite friends/i }));
  const groupCode = screen.getByText(/^PLANB-[A-Z0-9]{8}$/).textContent ?? '';
  await user.type(screen.getByLabelText(/^your name$/i), 'Riley');
  await user.type(screen.getByLabelText(/group code/i), groupCode);
  await user.click(screen.getByRole('button', { name: /^join group$/i }));
  return groupCode;
}

async function submitPreferenceRound(user: ReturnType<typeof userEvent.setup>) {
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

async function setPreferences(user: ReturnType<typeof userEvent.setup>) {
  await createGroupAndJoinMember(user);
  await user.click(screen.getByRole('button', { name: /continue with riley.*preferences/i }));
  await submitPreferenceRound(user);
  await user.click(screen.getByRole('button', { name: /continue with alex.*preferences/i }));
  await submitPreferenceRound(user);
}

async function finishAtRecommendations(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show us the group/i }));
  expect(screen.getByRole('heading', { name: /Friday crew/i })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /find our plan b/i }));
}

describe('Plan B discovery journey', () => {
  it('creates a private group and adds only people who enter their name and code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    render(<App />);

    expect(screen.queryByText(/92%/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /make a plan/i }));
    await user.type(screen.getByLabelText(/^your name$/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /^create group$/i }));

    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText(/your crew is waiting for you to invite your friends/i)).toBeTruthy();
    const header = within(screen.getByRole('button', { name: /view your group/i }));
    expect(header.getByText('A')).toBeTruthy();
    expect(header.queryByText('M')).toBeNull();
    expect(screen.queryByText(/mia|leo|jules|sara/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /invite friends/i }));
    expect(screen.getByRole('dialog', { name: /bring your people in/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /simulate join/i })).toBeNull();
    const groupCode = screen.getByText(/^PLANB-[A-Z0-9]{8}$/).textContent ?? '';
    const invitationLink = screen.getByLabelText(/invitation link/i) as HTMLInputElement;
    expect(invitationLink.value).toContain(`/join/${groupCode.toLowerCase()}`);
    expect(screen.getByRole('button', { name: /copy code/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(clipboardWrite).toHaveBeenCalledWith(groupCode);
    await user.click(screen.getByRole('button', { name: /share invitation link/i }));
    expect(clipboardWrite).toHaveBeenCalledWith(invitationLink.value);

    await user.type(screen.getByLabelText(/^your name$/i), 'Riley');
    await user.type(screen.getByLabelText(/group code/i), groupCode);
    await user.click(screen.getByRole('button', { name: /^join group$/i }));

    expect(screen.getByText('Riley')).toBeTruthy();
    expect(header.getByText('R')).toBeTruthy();
    expect(screen.queryByText(/mia|leo|jules|sara/i)).toBeNull();
    const groups = JSON.parse(window.localStorage.getItem('planb-groups-v1') ?? '[]');
    expect(groups[0].members.map((member: { name: string }) => member.name)).toEqual(['Alex', 'Riley']);
    expect((screen.getByRole('button', { name: /continue with riley.*preferences/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lets a friend open the invitation route and create their own profile in this browser', async () => {
    const user = userEvent.setup();
    render(<App />);
    const groupCode = await createGroupAndJoinMember(user);
    cleanup();
    window.history.replaceState({}, '', `/join/${groupCode.toLowerCase()}`);
    render(<App />);

    expect(screen.getByRole('heading', { name: /use your group code/i })).toBeTruthy();
    expect(screen.getByText(/groups are saved in this browser/i)).toBeTruthy();
    const name = screen.getByLabelText(/your name/i);
    await user.clear(name);
    await user.type(name, 'Casey');
    await user.click(screen.getByRole('button', { name: /^join group$/i }));

    expect(screen.getByText('Casey')).toBeTruthy();
    const groups = JSON.parse(window.localStorage.getItem('planb-groups-v1') ?? '[]');
    expect(groups[0].members.map((member: { name: string }) => member.name)).toEqual(['Alex', 'Riley', 'Casey']);
  });

  it('does not pretend a different device is connected to this local prototype', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /make a plan/i }));
    await user.type(screen.getByLabelText(/^your name$/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /^create group$/i }));
    await user.click(screen.getByRole('button', { name: /invite friends/i }));
    const groupCode = screen.getByText(/^PLANB-[A-Z0-9]{8}$/).textContent ?? '';

    cleanup();
    window.localStorage.clear();
    window.history.replaceState({}, '', `/join/${groupCode.toLowerCase()}`);
    render(<App />);
    await user.type(screen.getByLabelText(/your name/i), 'Casey');
    await user.click(screen.getByRole('button', { name: /^join group$/i }));

    expect(screen.getByRole('status').textContent).toMatch(/not saved in this browser/i);
    expect(screen.queryByText('Casey')).toBeNull();
  });

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
