import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Heart,
  LoaderCircle,
  MapPin,
  Navigation,
  Plus,
  Search,
  Sparkles,
  Utensils,
  UsersRound,
  Wallet,
  Wine,
} from 'lucide-react';
import {
  placeCategories,
  preferenceGroups,
  type PreferenceGroup,
  type PlaceCategory,
} from './data';
import {
  fetchNearbyPlaces,
  geoapifyMapTileUrl,
  isAthensCoordinate,
  rankPlaces,
  resolveSuggestedArea,
  searchLocations,
  suggestedAthensAreas,
  type GeoapifyPlace,
  type LocationSearchResult,
  type LocationSelection,
} from './geoapify';

type Screen = 'welcome' | 'group' | 'turn' | 'preferences' | 'location' | 'overview' | 'recommendations';
type PreferenceKey = PreferenceGroup['key'];
type Picks = Record<PreferenceKey, string[]>;
type GroupMember = {
  id: string;
  name: string;
  initials: string;
  color: string;
  picks: Picks;
  preferencesSubmitted: boolean;
};
type GroupSession = {
  name: string;
  participantCount: number;
  occasion: string;
  selectedLocation: LocationSelection | null;
  members: GroupMember[];
};

const sessionStorageKey = 'planb-session-v2';
const memberColors = ['purple', 'pink', 'lime', 'peach'];
const emptyPicks: Picks = { budget: [], time: [], mood: [], categories: [], distance: [] };
const placeMarkerIcon = L.divIcon({
  className: 'place-map-marker',
  html: '<span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
const steps: { id: Screen; label: string; number: string }[] = [
  { id: 'group', label: 'Your group', number: '01' },
  { id: 'preferences', label: 'The vibe', number: '02' },
  { id: 'location', label: 'Location', number: '03' },
  { id: 'overview', label: 'Review', number: '04' },
  { id: 'recommendations', label: 'The plan', number: '05' },
];

function readSavedSession(): GroupSession | null {
  try {
    const stored = window.localStorage.getItem(sessionStorageKey);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'name' in parsed && typeof parsed.name === 'string' &&
      'participantCount' in parsed && typeof parsed.participantCount === 'number' &&
      'members' in parsed && Array.isArray(parsed.members)
    ) {
      const session = parsed as Omit<GroupSession, 'selectedLocation'> & { selectedLocation: unknown };
      const location = session.selectedLocation;
      if (location === null || location === '') return { ...session, selectedLocation: null };
      if (
        typeof location !== 'object' || location === null ||
        !('name' in location) || typeof location.name !== 'string' ||
        !('lat' in location) || typeof location.lat !== 'number' ||
        !('lon' in location) || typeof location.lon !== 'number' ||
        !('source' in location) || location.source !== 'manual' ||
        !isAthensCoordinate(location.lat, location.lon)
      ) {
        return { ...session, selectedLocation: null };
      }
      return { ...session, selectedLocation: location as LocationSelection };
    }
    console.error('Saved Plan B session has an unexpected format.');
    return null;
  } catch (error) {
    console.error('Could not read the saved Plan B session.', error);
    return null;
  }
}

function getInitialScreen(session: GroupSession | null): Screen {
  if (!session) return 'welcome';
  if (session.members.some((member) => !member.preferencesSubmitted)) return 'preferences';
  if (session.members.length >= session.participantCount) return session.selectedLocation ? 'overview' : 'location';
  if (session.members.length) return 'turn';
  return 'group';
}

function createMember(name: string, index: number): GroupMember {
  const cleanName = name.trim();
  const initials = cleanName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: cleanName,
    initials,
    color: memberColors[index % memberColors.length],
    picks: { ...emptyPicks },
    preferencesSubmitted: false,
  };
}

function App() {
  const [initialSession] = useState(readSavedSession);
  const [session, setSession] = useState<GroupSession | null>(initialSession);
  const [screen, setScreen] = useState<Screen>(() => getInitialScreen(initialSession));
  const [screenNotice, setScreenNotice] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [activeMemberId, setActiveMemberId] = useState(() => {
    return initialSession?.members.find((member) => !member.preferencesSubmitted)?.id ?? '';
  });
  const [editingMemberId, setEditingMemberId] = useState('');
  const [preferenceIndex, setPreferenceIndex] = useState(0);
  const [picks, setPicks] = useState<Picks>(() => {
    return initialSession?.members.find((member) => !member.preferencesSubmitted)?.picks ?? { ...emptyPicks };
  });
  const [selectedLocation, setSelectedLocation] = useState<LocationSelection | null>(() => initialSession?.selectedLocation ?? null);
  const [locationQuery, setLocationQuery] = useState(() => initialSession?.selectedLocation?.source === 'manual' ? initialSession.selectedLocation.name : '');
  const [locationSearchState, setLocationSearchState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const [locationSearchMessage, setLocationSearchMessage] = useState('');
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const locationRequestId = useRef(0);
  const [places, setPlaces] = useState<GeoapifyPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [placeCategoryFilter, setPlaceCategoryFilter] = useState<PlaceCategory | 'all'>('all');
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [activePlaceId, setActivePlaceId] = useState('');
  const recommendationRequestId = useRef(0);

  useEffect(() => {
    try {
      if (session) window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
      else window.localStorage.removeItem(sessionStorageKey);
    } catch (error) {
      console.error('Could not update the saved Plan B session.', error);
      setToast('This session could not be saved or cleared in this browser.');
    }
  }, [session]);

  const activeMember = session?.members.find((member) => member.id === activeMemberId);
  const currentPreference = preferenceGroups[preferenceIndex];
  const rankedPlaces = selectedLocation
    ? rankPlaces(
      places,
      session?.members.filter((member) => member.preferencesSubmitted).map((member) => member.picks) ?? [],
      selectedLocation,
    )
    : places;
  const filteredPlaces = placeCategoryFilter === 'all'
    ? rankedPlaces
    : rankedPlaces.filter((place) => place.category === placeCategoryFilter);
  const currentStep = steps.findIndex((step) => step.id === (screen === 'turn' ? 'preferences' : screen));

  function changeScreen(next: Screen) {
    if (screen === 'location' && next !== 'location') locationRequestId.current += 1;
    setToast('');
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startGroup() {
    setSession(null);
    setParticipantName('');
    setActiveMemberId('');
    setEditingMemberId('');
    setSelectedLocation(null);
    setLocationQuery('');
    setLocationResults([]);
    setLocationSearchState('idle');
    setLocationSearchMessage('');
    setPlaces([]);
    setPlacesError('');
    setPlacesLoading(false);
    setPlaceCategoryFilter('all');
    setSavedPlaces([]);
    setScreenNotice('');
    changeScreen('group');
  }

  function createGroup(name: string, participantCount: number, occasion: string) {
    setSession({ name: name.trim(), participantCount, occasion, selectedLocation: null, members: [] });
    setParticipantName('');
    changeScreen('turn');
  }

  function startParticipant() {
    if (!session || !participantName.trim()) return;
    const member = createMember(participantName, session.members.length);
    setSession({ ...session, members: [...session.members, member] });
    setActiveMemberId(member.id);
    setEditingMemberId('');
    setPicks({ ...emptyPicks });
    setPreferenceIndex(0);
    changeScreen('preferences');
  }

  function editMember(member: GroupMember) {
    setActiveMemberId(member.id);
    setEditingMemberId(member.id);
    setParticipantName(member.name);
    setPicks({ ...member.picks });
    setPreferenceIndex(0);
    changeScreen('preferences');
  }

  function togglePick(group: PreferenceGroup, label: string) {
    setPicks((current) => {
      const selected = current[group.key] ?? [];
      const updated = selected.includes(label)
        ? selected.filter((item) => item !== label)
        : group.key === 'categories' ? [...selected, label] : [label];
      return { ...current, [group.key]: updated };
    });
  }

  function advancePreference() {
    if (preferenceIndex < preferenceGroups.length - 1) {
      setPreferenceIndex((index) => index + 1);
      return;
    }
    if (!session || !activeMemberId) return;
    const updatedMembers = session.members.map((member) =>
      member.id === activeMemberId ? { ...member, picks, preferencesSubmitted: true } : member,
    );
    setSession({ ...session, members: updatedMembers });
    setEditingMemberId('');
    if (activeMemberId === editingMemberId) {
      setScreenNotice(`${activeMember?.name ?? 'Participant'}'s answers have been updated.`);
      changeScreen('overview');
      return;
    }
    if (updatedMembers.length < session.participantCount) {
      setParticipantName('');
      setActiveMemberId('');
      setScreenNotice(`${updatedMembers[updatedMembers.length - 1].name}'s preferences are saved. Pass the device to the next person.`);
      changeScreen('turn');
      return;
    }
    setScreenNotice('Everyone’s preferences are in. Choose a meet-up area, then review the group before finding your plan.');
    changeScreen('location');
  }

  function saveLocation(location: LocationSelection) {
    if (!location.name.trim() || !isAthensCoordinate(location.lat, location.lon)) {
      setLocationSearchState('error');
      setLocationSearchMessage('Select a valid Geoapify result within Athens, Greece.');
      return;
    }
    locationRequestId.current += 1;
    setSelectedLocation(location);
    setSession((current) => current ? { ...current, selectedLocation: location } : current);
    setLocationQuery(location.name);
    setLocationResults([]);
    setLocationSearchState('idle');
    setLocationSearchMessage('');
  }

  function updateLocationQuery(query: string) {
    locationRequestId.current += 1;
    setLocationQuery(query);
    setSelectedLocation(null);
    setSession((current) => current ? { ...current, selectedLocation: null } : current);
    setLocationResults([]);
    setLocationSearchState('idle');
    setLocationSearchMessage('');
  }

  async function searchForLocation(searchText = locationQuery) {
    const query = searchText.trim();
    if (!query) {
      setLocationSearchState('error');
      setLocationSearchMessage('Enter an Athens neighbourhood or area to search.');
      return;
    }
    const requestId = ++locationRequestId.current;
    setLocationQuery(query);
    setSelectedLocation(null);
    setSession((current) => current ? { ...current, selectedLocation: null } : current);
    setLocationSearchState('loading');
    setLocationSearchMessage('');
    setLocationResults([]);
    try {
      const results = await searchLocations(query);
      if (requestId !== locationRequestId.current) return;
      setLocationResults(results);
      setLocationSearchState(results.length ? 'idle' : 'empty');
      setLocationSearchMessage(results.length ? '' : 'No matching area found in Athens, Greece. Try another Athens neighbourhood.');
    } catch (error) {
      if (requestId !== locationRequestId.current) return;
      console.error('Could not search for a location.', error);
      setLocationSearchState('error');
      setLocationSearchMessage(error instanceof Error && !error.message.includes('Failed to fetch')
        ? error.message
        : 'Location search could not connect. Check your connection or try again later.');
    }
  }

  async function selectSuggestedArea(area: string) {
    const requestId = ++locationRequestId.current;
    setLocationQuery(area);
    setSelectedLocation(null);
    setSession((current) => current ? { ...current, selectedLocation: null } : current);
    setLocationResults([]);
    setLocationSearchState('loading');
    setLocationSearchMessage('');
    try {
      const result = await resolveSuggestedArea(area);
      if (requestId !== locationRequestId.current) return;
      saveLocation({ ...result, source: 'manual' });
    } catch (error) {
      if (requestId !== locationRequestId.current) return;
      console.error('Could not resolve a suggested Athens neighbourhood.', error);
      setLocationSearchState('error');
      setLocationSearchMessage(error instanceof Error
        ? error.message
        : 'The selected neighbourhood could not be verified. Try searching for it instead.');
    }
  }

  function toggleSaved(place: GeoapifyPlace) {
    const isSaved = savedPlaces.includes(place.id);
    setSavedPlaces((current) => isSaved
      ? current.filter((id) => id !== place.id)
      : [...current, place.id]);
    setToast(isSaved ? `${place.name} removed from your shortlist` : `${place.name} added to your shortlist`);
    window.setTimeout(() => setToast(''), 2400);
  }

  async function findOurPlan() {
    if (!selectedLocation) return;
    const requestId = ++recommendationRequestId.current;
    setPlaces([]);
    setPlacesLoading(true);
    setPlacesError('');
    setActivePlaceId('');
    setPlaceCategoryFilter('all');
    changeScreen('recommendations');
    try {
      const results = await fetchNearbyPlaces(selectedLocation.lat, selectedLocation.lon);
      if (requestId !== recommendationRequestId.current) return;
      setPlaces(results);
      setActivePlaceId(results[0]?.id ?? '');
    } catch (error) {
      if (requestId !== recommendationRequestId.current) return;
      console.error('Could not retrieve nearby Geoapify places.', error);
      setPlacesError(error instanceof Error && !error.message.includes('Failed to fetch')
        ? error.message
        : 'Nearby places could not be loaded. Check your connection and try again.');
    } finally {
      if (requestId === recommendationRequestId.current) setPlacesLoading(false);
    }
  }

  function retryPlaceSearch() {
    if (selectedLocation) void findOurPlan();
  }

  function goBack() {
    if (screen === 'preferences' && preferenceIndex > 0) {
      setPreferenceIndex((index) => index - 1);
      return;
    }
    if (screen === 'preferences' && !editingMemberId && session && activeMemberId) {
      setSession({ ...session, members: session.members.filter((member) => member.id !== activeMemberId) });
      setActiveMemberId('');
      changeScreen('turn');
      return;
    }
    if (screen === 'location' && session) {
      const lastMember = [...session.members].reverse().find((member) => member.preferencesSubmitted);
      if (lastMember) {
        editMember(lastMember);
        return;
      }
    }
    const previous: Partial<Record<Screen, Screen>> = {
      group: 'welcome',
      turn: 'group',
      preferences: editingMemberId ? 'overview' : session?.members.length === 1 ? 'turn' : 'turn',
      location: 'preferences',
      overview: 'location',
      recommendations: 'overview',
    };
    if (previous[screen]) changeScreen(previous[screen]!);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => changeScreen('welcome')} aria-label="Plan B home">
          <span className="brand-mark" aria-hidden="true"><span>B</span><ArrowDownLeft size={15} strokeWidth={3} /></span>
          <span className="brand-name">plan b<span>.</span></span>
        </button>
        <div className="topbar-center"><span className="live-dot" /> Athens plans. One device. Everyone gets a turn.</div>
        {session && session.members.length > 0 && (
          <div className="avatar-stack" aria-label={`${session.members.length} participants`}>
            {session.members.map((member) => <span key={member.id} className={`mini-avatar mini-avatar-${member.color}`} title={member.name}>{member.initials}</span>)}
          </div>
        )}
      </header>

      <main className={`main-content screen-${screen}`}>
        {screen !== 'welcome' && (
          <div className="journey-bar">
            <button className="back-button" onClick={goBack} aria-label="Go back"><ArrowLeft size={18} /></button>
            <div className="step-track" aria-label="Your planning progress">
              {steps.map((step, index) => (
                <button key={step.id} className={`step-item ${index === currentStep ? 'is-current' : ''} ${index < currentStep ? 'is-done' : ''}`} onClick={() => index < currentStep && step.id !== 'group' && changeScreen(step.id)} disabled={index >= currentStep || (step.id === 'group' && Boolean(session))} aria-current={index === currentStep ? 'step' : undefined}>
                  <span className="step-dot">{index < currentStep ? <Check size={12} /> : step.number}</span><span>{step.label}</span>
                </button>
              ))}
            </div>
            <span className="journey-caption">YOUR PLAN, YOUR WAY</span>
          </div>
        )}

        {screen === 'welcome' && <WelcomeScreen onCreate={startGroup} />}
        {screen === 'group' && <GroupCreationScreen onCreate={createGroup} />}
        {screen === 'turn' && session && (
          <ParticipantTurnScreen
            group={session}
            participantName={participantName}
            onNameChange={setParticipantName}
            onContinue={startParticipant}
            notice={screenNotice}
          />
        )}
        {screen === 'preferences' && currentPreference && activeMember && (
          <PreferencesScreen
            preference={currentPreference}
            index={preferenceIndex}
            picks={picks}
            participantName={activeMember.name}
            participantNumber={session?.members.findIndex((member) => member.id === activeMember.id) ?? 0}
            participantCount={session?.participantCount ?? 1}
            editing={Boolean(editingMemberId)}
            onToggle={togglePick}
            onNext={advancePreference}
          />
        )}
        {screen === 'location' && (
          <LocationScreen
            selectedLocation={selectedLocation}
            locationQuery={locationQuery}
            locationResults={locationResults}
            locationSearchState={locationSearchState}
            locationSearchMessage={locationSearchMessage}
            notice={screenNotice}
            onQueryChange={updateLocationQuery}
            onSearch={() => void searchForLocation()}
            onSuggestedArea={(area) => void selectSuggestedArea(area)}
            onSelectLocation={(result) => saveLocation({ ...result, source: 'manual' })}
            onContinue={() => changeScreen('overview')}
          />
        )}
        {screen === 'overview' && session && (
          <OverviewScreen
            group={session}
            location={selectedLocation?.name ?? ''}
            notice={screenNotice}
            onEdit={editMember}
            onContinue={findOurPlan}
          />
        )}
        {screen === 'recommendations' && selectedLocation && (
          <RecommendationsScreen
            location={selectedLocation}
            places={filteredPlaces}
            allPlaceCount={rankedPlaces.length}
            categoryFilter={placeCategoryFilter}
            loading={placesLoading}
            error={placesError}
            saved={savedPlaces}
            activePlaceId={activePlaceId}
            onCategoryFilterChange={setPlaceCategoryFilter}
            onSelectPlace={setActivePlaceId}
            onToggleSaved={toggleSaved}
            onRetry={retryPlaceSearch}
          />
        )}
      </main>

      <footer className="site-footer">
        <span>Plan B <span className="footer-spark">✳</span> made for plans that bring everyone along.</span>
        <span>Different plans. One good choice.</span>
      </footer>
      {toast && <div className="toast" role="status"><CheckCircle2 size={17} /> {toast}</div>}
    </div>
  );
}

function ScreenHeading({ eyebrow, title, description, accent }: { eyebrow: string; title: ReactNode; description: string; accent: string }) {
  return <div className="screen-heading"><div className={`eyebrow eyebrow-${accent}`}><span className="eyebrow-star">✳</span> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}

function WelcomeScreen({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="welcome-copy">
        <div className="welcome-kicker"><span className="kicker-star">✳</span> ATHENS, GREECE · GOOD PLANS, ZERO GROUP CHAT SPIRALS</div>
        <h1>Plan B – Find your next plan in <span>Athens.</span></h1>
        <p className="welcome-description">Discover places and activities in Athens that match your group's interests, budget and mood.</p>
        <div className="welcome-actions"><button className="button button-primary" onClick={onCreate}>Make a plan <ArrowRight size={18} /></button></div>
        <div className="welcome-proof"><UsersRound size={20} /><span>One shared device, with a private turn for everyone.</span></div>
      </div>
      <div className="welcome-art" aria-label="Illustration of friends bringing different preferences to a shared plan">
        <div className="art-scribble scribble-top">one phone<br />your whole crew ↗</div><div className="art-sunburst">✳</div>
        <div className="art-card art-card-back"><span className="art-card-label">THE GROUP PICK</span><div className="art-food-row"><span>🍜</span><span>🌮</span><span>🥟</span></div><strong>Everyone gets<br />a little something.</strong><div className="art-match"><span>PEOPLE, ONE PLAN</span><b>01</b></div></div>
        <div className="art-ticket"><span>PLAN A</span><span>meh.</span><span>×</span></div><div className="art-ticket ticket-good"><span>PLAN B</span><span>oh, yes.</span><Sparkles size={16} /></div>
        <div className="art-sticker">everyone<br />gets a turn</div><div className="art-scribble scribble-bottom">your people<br />1 actually good plan</div>
      </div>
      <div className="welcome-strip"><span><UsersRound size={16} /> ONE SHARED DEVICE</span><span>Budget · mood · time · the whole vibe</span><span>ONE GOOD PLAN <ArrowRight size={15} /></span></div>
    </section>
  );
}

function GroupCreationScreen({ onCreate }: { onCreate: (name: string, count: number, occasion: string) => void }) {
  const [name, setName] = useState('Friday-ish crew');
  const [participantCount, setParticipantCount] = useState(4);
  const [occasion, setOccasion] = useState('Just because');
  return (
    <section className="content-page group-page">
      <ScreenHeading eyebrow="CREATE YOUR GROUP" accent="pink" title={<>Your crew,<br /><span className="pink-text">your rules.</span></>} description="Set up your shared-device plan. Then pass the screen around so everyone can add their preferences." />
      <div className="form-layout">
        <div className="form-panel">
          <label className="field-label" htmlFor="group-name">WHAT SHOULD WE CALL YOUR GROUP?
            <input id="group-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Friday-ish crew" maxLength={32} />
          </label>
          <label className="field-label participant-count-label" htmlFor="participant-count">HOW MANY PEOPLE ARE PLANNING?
            <select id="participant-count" className="text-input participant-count-input" value={participantCount} onChange={(event) => setParticipantCount(Number(event.target.value))}>
              {Array.from({ length: 7 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} people</option>)}
            </select>
          </label>
          <fieldset className="occasion-fieldset">
            <legend>WHAT ARE WE CELEBRATING? <span>(OR NOT)</span></legend>
            <div className="occasion-grid">{[
              { label: 'Just because', icon: Sparkles, color: 'lime' },
              { label: 'Birthday', icon: UsersRound, color: 'pink' },
              { label: 'Coffee catch-up', icon: Coffee, color: 'peach' },
              { label: 'After hours', icon: Wine, color: 'purple' },
            ].map(({ label, icon: Icon, color }) => <button key={label} type="button" className={`occasion-option ${occasion === label ? 'selected' : ''}`} onClick={() => setOccasion(label)} aria-pressed={occasion === label}><span className={`choice-icon choice-${color}`}><Icon size={19} /></span>{label}{occasion === label && <Check size={15} className="occasion-check" />}</button>)}</div>
          </fieldset>
          <button className="button button-primary form-submit" onClick={() => onCreate(name, participantCount, occasion)} disabled={!name.trim()}>Create group <ArrowRight size={18} /></button>
          <div className="form-note"><UsersRound size={15} /> Everyone enters their own answers on this device.</div>
        </div>
        <aside className="group-aside"><span className="aside-doodle">✳</span><div className="aside-label">YOUR CREW · {participantCount}</div><h2>One device.<br />Everyone gets <em>a turn.</em></h2><p>No invite links or group codes. Hand the same phone or computer to each person, one at a time.</p></aside>
      </div>
    </section>
  );
}

function ParticipantTurnScreen({ group, participantName, onNameChange, onContinue, notice }: { group: GroupSession; participantName: string; onNameChange: (name: string) => void; onContinue: () => void; notice: string }) {
  const personNumber = group.members.findIndex((member) => !member.preferencesSubmitted) >= 0
    ? group.members.findIndex((member) => !member.preferencesSubmitted) + 1
    : group.members.length + 1;
  return (
    <section className="content-page turn-page">
      <ScreenHeading eyebrow={`PERSON ${personNumber} OF ${group.participantCount}`} accent="purple" title={<>It’s your <span className="purple-text">turn!</span></>} description={`Welcome to ${group.name}. Add your name and tell us what kind of plan works for you.`} />
      {notice && <div className="flow-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}
      <div className="turn-card">
        <div className="turn-progress"><span style={{ width: `${((personNumber - 1) / group.participantCount) * 100}%` }} /></div>
        <div className="turn-count"><UsersRound size={17} /> PERSON {personNumber} <span>OF {group.participantCount}</span></div>
        <label className="field-label" htmlFor="participant-name">YOUR NAME
          <input id="participant-name" className="text-input" value={participantName} onChange={(event) => onNameChange(event.target.value)} placeholder="Enter your name" maxLength={32} onKeyDown={(event) => event.key === 'Enter' && participantName.trim() && onContinue()} />
        </label>
        <p className="one-device-note"><CheckCircle2 size={15} /> Your answers stay on this device and are saved in this browser.</p>
        <button className="button button-primary form-submit" onClick={onContinue} disabled={!participantName.trim()}>Start my preferences <ArrowRight size={18} /></button>
      </div>
    </section>
  );
}

function PreferencesScreen({ preference, index, picks, participantName, participantNumber, participantCount, editing, onToggle, onNext }: {
  preference: PreferenceGroup; index: number; picks: Picks; participantName: string; participantNumber: number; participantCount: number; editing: boolean;
  onToggle: (group: PreferenceGroup, label: string) => void; onNext: () => void;
}) {
  const selected = picks[preference.key] ?? [];
  return (
    <section className="content-page preferences-page">
      <div className="participant-step-label">{editing ? `EDITING ${participantName.toUpperCase()}’S ANSWERS` : `PERSON ${participantNumber + 1} OF ${participantCount} · ${participantName.toUpperCase()}`}</div>
      <div className="preference-intro">
        <ScreenHeading eyebrow={`THE VIBE CHECK · ${String(index + 1).padStart(2, '0')} / ${preferenceGroups.length}`} accent="purple" title={<>{preference.title.split('?')[0]}<span className="purple-text">?</span></>} description={preference.subtitle} />
        <div className="pref-side-note"><span className="note-asterisk">✳</span><span>There are no wrong<br />answers. Except “idk.”</span></div>
      </div>
      <div className="pref-progress"><span style={{ width: `${((index + 1) / preferenceGroups.length) * 100}%` }} /></div>
      <div className={`preference-options option-count-${preference.choices.length}`}>
        {preference.choices.map(({ label, icon: Icon, color }, choiceIndex) => {
          const isSelected = selected.includes(label);
          return <button key={label} className={`preference-option ${isSelected ? 'selected' : ''}`} onClick={() => onToggle(preference, label)} aria-pressed={isSelected} style={{ animationDelay: `${choiceIndex * 50}ms` }}><span className={`choice-icon choice-${color}`}>{Icon && <Icon size={21} strokeWidth={1.8} />}</span><span className="option-name">{label}</span><span className="option-check">{isSelected && <Check size={13} strokeWidth={3} />}</span></button>;
        })}
      </div>
      <div className="preferences-bottom"><span><span className="selection-dot" />{selected.length ? `${selected.length} picked` : 'Pick what feels right'}</span><button className="button button-primary" onClick={onNext}>{index === preferenceGroups.length - 1 ? editing ? 'Save changes' : 'Finish my turn' : 'Next'} <ArrowRight size={18} /></button></div>
      <div className="preference-footnote">{preference.key === 'categories' ? 'PICK AS MANY AS YOU LIKE' : 'WE’LL FIND THE SWEET SPOT TOGETHER'}</div>
    </section>
  );
}

function LocationScreen({ selectedLocation, locationQuery, locationResults, locationSearchState, locationSearchMessage, notice, onQueryChange, onSearch, onSuggestedArea, onSelectLocation, onContinue }: {
  selectedLocation: LocationSelection | null; locationQuery: string;
  locationResults: LocationSearchResult[]; locationSearchState: 'idle' | 'loading' | 'error' | 'empty'; locationSearchMessage: string;
  notice: string;
  onQueryChange: (query: string) => void; onSearch: () => void; onSuggestedArea: (area: string) => void;
  onSelectLocation: (location: LocationSearchResult) => void; onContinue: () => void;
}) {
  return (
    <section className="content-page location-page">
      <ScreenHeading eyebrow="ATHENS, GREECE" accent="purple" title={<>Where’s the <span className="purple-text">meet-up?</span></>} description="Search for an Athens neighbourhood, then select a real Geoapify result to set your meeting point." />
      {notice && <div className="flow-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}
      <div className="one-device-note location-device-note"><UsersRound size={15} /> All participants use this device. No invites or cross-device syncing.</div>
      <div className="location-options athens-location-options">
        <article className={`location-option ${selectedLocation ? 'is-selected' : ''}`}>
          <div className="location-option-heading"><span className="location-option-icon icon-search"><Search size={19} /></span><div><h2>Choose an Athens area</h2><p>Search any neighbourhood in Athens, Greece.</p></div></div>
          <label className="location-search"><Search size={16} /><input value={locationQuery} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} placeholder="e.g. Pangrati" aria-label="Search an Athens neighbourhood" maxLength={100} /></label>
          <p className="location-manual-help">Choose a suggested neighbourhood for its central point, or search for a custom Athens area and select a result.</p>
          <div className="athens-suggestions" aria-label="Suggested Athens neighbourhoods">
            {suggestedAthensAreas.map((area) => <button key={area} type="button" onClick={() => onSuggestedArea(area)} disabled={locationSearchState === 'loading'}>{area}</button>)}
          </div>
          <button className="button button-secondary manual-location-button" onClick={onSearch} disabled={!locationQuery.trim() || locationSearchState === 'loading'}>{locationSearchState === 'loading' ? <LoaderCircle className="location-spinner" size={15} /> : <Search size={15} />}{locationSearchState === 'loading' ? 'Searching…' : 'Search Athens areas'}</button>
          {locationSearchMessage && <div className={`location-feedback ${locationSearchState === 'error' ? 'gps-error' : ''}`} role={locationSearchState === 'error' ? 'alert' : 'status'}>{locationSearchState === 'loading' && <LoaderCircle className="location-spinner" size={16} />}{locationSearchMessage}</div>}
          {locationResults.length > 0 && <div className="location-result-list" aria-label="Athens location results">{locationResults.map((result) => <button key={result.id} className="location-result" onClick={() => onSelectLocation(result)}><MapPin size={15} /><span>{result.name}</span><ChevronRight size={15} /></button>)}</div>}
        </article>
      </div>
      {selectedLocation && <div className="selected-location-banner"><MapPin size={17} /><span><small>SELECTED MEET-UP AREA</small><strong>{selectedLocation.name}</strong>      <em>Central point verified by Geoapify in Athens, Greece</em></span><CheckCircle2 size={19} /></div>}
      <div className="location-bottom"><span><MapPin size={15} />{selectedLocation ? `Selected: ${selectedLocation.name}` : 'Choose a location to continue.'}</span><button className="button button-primary" onClick={onContinue} disabled={!selectedLocation}>Review your group <ArrowRight size={18} /></button></div>
      <div className="geocoding-attribution">Location results provided by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a></div>
    </section>
  );
}

function OverviewScreen({ group, location, notice, onEdit, onContinue }: { group: GroupSession; location: string; notice: string; onEdit: (member: GroupMember) => void; onContinue: () => void }) {
  return (
    <section className="content-page overview-page">
      <div className="overview-heading-row"><ScreenHeading eyebrow="SAME CREW, DIFFERENT VIBES" accent="peach" title={<><span className="peach-text">{group.name}</span> lineup.</>} description="Everyone can review their answers before you find the group’s plan." /></div>
      {notice && <div className="flow-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}
      <div className="one-device-note"><UsersRound size={15} /> A shared-device group of {group.participantCount} · Meet-up area: {location}</div>
      <div className="member-grid">
        {group.members.map((member, index) => <article className={`member-card member-${member.color}`} key={member.id} style={{ animationDelay: `${index * 100}ms` }}>
          <div className="member-card-top"><div className={`member-avatar avatar-${member.color}`}>{member.initials}</div><span className="member-number">PERSON {index + 1} / {String(group.participantCount).padStart(2, '0')}</span></div>
          <h2>{member.name}</h2><p className="member-quote">Preferences shared with the group.</p>
          <div className="member-tags"><span><Wallet size={13} />{member.picks.budget.join(', ') || 'Any budget'}</span><span><Clock3 size={13} />{member.picks.time.join(', ') || 'Any time'}</span><span><Sparkles size={13} />{member.picks.mood.join(', ') || 'Any mood'}</span><span><Heart size={13} />{member.picks.categories.join(', ') || 'Any activity'}</span><span><Navigation size={13} />{member.picks.distance.join(', ') || 'Any distance'}</span></div>
          <div className="member-card-bottom"><span>HAS A POINT</span><button className="member-edit-button" onClick={() => onEdit(member)}>Edit answers <ChevronRight size={14} /></button></div>
        </article>)}
      </div>
      <div className="group-insight"><div className="insight-icon"><UsersRound size={21} /></div><div><strong>Different plans. One good choice.</strong><span>Recommendations use real Geoapify places and coordinates. Budget, opening hours and exact activity duration are never guessed when a listing does not provide them.</span></div><span className="insight-spark">✳</span></div>
      <div className="overview-actions"><span>READY WHEN YOUR WHOLE CREW IS.</span><button className="button button-primary" onClick={onContinue}>Find our perfect plan <Sparkles size={17} /></button></div>
    </section>
  );
}

function RecommendationsScreen({ location, places, allPlaceCount, categoryFilter, loading, error, saved, activePlaceId, onCategoryFilterChange, onSelectPlace, onToggleSaved, onRetry }: {
  location: LocationSelection;
  places: GeoapifyPlace[];
  allPlaceCount: number;
  categoryFilter: PlaceCategory | 'all';
  loading: boolean;
  error: string;
  saved: string[];
  activePlaceId: string;
  onCategoryFilterChange: (category: PlaceCategory | 'all') => void;
  onSelectPlace: (placeId: string) => void;
  onToggleSaved: (place: GeoapifyPlace) => void;
  onRetry: () => void;
}) {
  return (
    <section className="content-page recommendations-page">
      <div className="recommendation-heading-row"><ScreenHeading eyebrow="DRUMROLL, PLEASE" accent="lime" title={<>Your kind of <span className="lime-text">place.</span></>} description={`Real Geoapify places and activities near ${location.name}. Place details depend on what is available in the listing.`} /><div className="match-stamp"><MapPin size={16} /><span>REAL<br />PLACES</span></div></div>
      <div className="real-data-note"><span className="best-match-star">✳</span><div><strong>How these recommendations work</strong><span>Interests rank first, then distance, then broad venue-category relevance to mood and time. Listings do not reliably provide budget, opening hours or exact duration, so those details are never assumed.</span></div></div>
      <div className="category-filters" aria-label="Filter places by category">
        <button className={categoryFilter === 'all' ? 'is-active' : ''} onClick={() => onCategoryFilterChange('all')} aria-pressed={categoryFilter === 'all'}>All places</button>
        {placeCategories.map(({ id, label }) => <button key={id} className={categoryFilter === id ? 'is-active' : ''} onClick={() => onCategoryFilterChange(id)} aria-pressed={categoryFilter === id}>{label}</button>)}
      </div>
      {loading && <div className="places-feedback" role="status"><LoaderCircle className="location-spinner" size={20} />Searching Geoapify for real places in Athens…</div>}
      {error && <div className="places-feedback places-error" role="alert"><span>{error}</span><button className="button button-secondary" onClick={onRetry}>Try again</button></div>}
      {!loading && !error && allPlaceCount === 0 && <div className="places-feedback" role="status"><MapPin size={20} />No businesses or activities were found within 2 km of this location. Try another Athens area.</div>}
      {!loading && !error && allPlaceCount > 0 && places.length === 0 && <div className="places-feedback" role="status">No nearby places match this category filter. Choose another category to see more results.</div>}
      {allPlaceCount > 0 && <RealPlacesMap location={location} places={places} activePlaceId={activePlaceId} onSelectPlace={onSelectPlace} />}
      <div className="recommendation-list">{places.map((place, index) => <PlaceCard key={place.id} place={place} rank={index + 1} active={activePlaceId === place.id} saved={saved.includes(place.id)} onActivate={() => onSelectPlace(place.id)} onToggleSaved={onToggleSaved} />)}</div>
      <div className="recommendation-footer"><span><span className="tiny-live-dot" /> REAL PLACE DATA · GEOAPIFY</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top <ArrowRight size={14} /></button></div>
    </section>
  );
}

function RealPlacesMap({ location, places, activePlaceId, onSelectPlace }: {
  location: LocationSelection; places: GeoapifyPlace[]; activePlaceId: string; onSelectPlace: (placeId: string) => void;
}) {
  const [tileError, setTileError] = useState(false);
  return (
    <section className="real-map-section" aria-label={`Interactive map of real Geoapify places near ${location.name}`}>
      <div className="real-map-heading"><div><MapPin size={16} /><span>REAL PLACES NEAR</span></div><span>{location.name}</span></div>
      <MapContainer key={`${location.lat},${location.lon}`} center={[location.lat, location.lon]} zoom={14} scrollWheelZoom={false} className="real-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · &copy; <a href="https://www.geoapify.com/">Geoapify</a>'
          url={geoapifyMapTileUrl()}
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <MapFocus places={places} activePlaceId={activePlaceId} />
        {places.map((place) => <Marker
          key={place.id}
          position={[place.lat, place.lon]}
          icon={placeMarkerIcon}
          eventHandlers={{ click: () => onSelectPlace(place.id) }}
        >
          <Popup>
            <strong>{place.name}</strong><br />
            {placeCategoryLabel(place.category)} · {place.address}
            <br /><a href={place.website || place.mapUrl} target="_blank" rel="noreferrer">{place.website ? 'Visit business website' : 'View on OpenStreetMap'}</a>
          </Popup>
        </Marker>)}
      </MapContainer>
      {tileError && <p className="map-tile-error" role="status">Map tiles could not be loaded. The nearby listings are still available below.</p>}
    </section>
  );
}

function MapFocus({ places, activePlaceId }: { places: GeoapifyPlace[]; activePlaceId: string }) {
  const map = useMap();
  useEffect(() => {
    const activePlace = places.find((place) => place.id === activePlaceId);
    if (activePlace) map.panTo([activePlace.lat, activePlace.lon]);
  }, [activePlaceId, map, places]);
  return null;
}

function placeCategoryLabel(category: PlaceCategory) {
  return placeCategories.find((item) => item.id === category)?.label ?? 'Place';
}

function placeCategoryIcon(category: PlaceCategory) {
  if (category === 'cafe') return <Coffee size={16} />;
  if (category === 'restaurant') return <Utensils size={16} />;
  if (category === 'bar') return <Wine size={16} />;
  return <Activity size={16} />;
}

function PlaceCard({ place, rank, active, saved, onActivate, onToggleSaved }: {
  place: GeoapifyPlace; rank: number; active: boolean; saved: boolean; onActivate: () => void; onToggleSaved: (place: GeoapifyPlace) => void;
}) {
  const interestReason = place.interestParticipantCount
    ? place.interestMatchCount
      ? `Matches selected place interests for ${place.interestMatchCount} of ${place.interestParticipantCount} participants.`
      : 'No selected place interests match this category.'
    : 'No place interests were selected.';
  const preferenceReason = place.preferenceParticipantCount
    ? place.preferenceMatchCount
      ? `Category fit for the mood or time preferences of ${place.preferenceMatchCount} of ${place.preferenceParticipantCount} participants.`
      : 'No selected mood or time preferences match this category.'
    : 'No mood or time preference was selected.';
  return (
    <article className={`activity-card real-place-card ${active ? 'venue-active' : ''}`}>
      <div
        className={`activity-image-wrap place-art place-art-${place.category}`}
        role="img"
        aria-label={`${placeCategoryLabel(place.category)} placeholder; no verified photo for this business is available`}
      >
        <span className="place-art-icon" aria-hidden="true">{placeCategoryIcon(place.category)}</span>
        <span className="place-photo-placeholder">No verified venue photo</span>
        <span className="activity-rank">0{rank}</span>
      </div>
      <div className="activity-content">
        <div className="activity-category">{placeCategoryIcon(place.category)}{placeCategoryLabel(place.category)} · GEOAPIFY</div>
        <div className="activity-title-row"><h2>{place.name}</h2><button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={() => onToggleSaved(place)} aria-label={saved ? `Remove ${place.name} from shortlist` : `Add ${place.name} to shortlist`} aria-pressed={saved}>{saved ? <Check size={17} /> : <Plus size={18} />}</button></div>
        <div className="activity-meta">
          <span><MapPin size={15} />{place.address}<small> address</small></span>
          <span>{Math.round(place.distanceKm * 100) / 100} km<small> straight-line distance</small></span>
        </div>
        <div className="activity-reason"><span className="reason-spark">✳</span><p><strong>Group match</strong>{interestReason} Reliable price information and exact activity duration are unavailable; {preferenceReason}</p></div>
        <div className="place-card-actions"><button className="activity-cta" onClick={onActivate}>Show on map <MapPin size={15} /></button><a className="osm-place-link" href={place.website || place.mapUrl} target="_blank" rel="noreferrer">{place.website ? 'Visit business website' : 'View on OpenStreetMap'} <ArrowRight size={14} /></a></div>
      </div>
    </article>
  );
}

export default App;
