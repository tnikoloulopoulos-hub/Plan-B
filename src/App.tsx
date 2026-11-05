import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Heart,
  MapPin,
  Navigation,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  Wallet,
  Wine,
  X,
} from 'lucide-react';
import {
  demoLocation,
  occasions,
  preferenceGroups,
  suggestedLocations,
  venues,
  type Venue,
  type PreferenceGroup,
} from './data';

type Screen = 'welcome' | 'group' | 'preferences' | 'location' | 'overview' | 'recommendations';
type Picks = Record<string, string[]>;
type GroupMember = {
  id: string;
  name: string;
  initials: string;
  color: string;
  budget: string;
  time: string;
  mood: string;
  categories: string;
  location: string;
  distance: string;
  note: string;
  preferencesSubmitted: boolean;
};
type StoredGroup = { code: string; name: string; members: GroupMember[] };

const groupsStorageKey = 'planb-groups-v1';
const memberColors = ['purple', 'pink', 'lime', 'peach'];

function readStoredGroups(): StoredGroup[] {
  try {
    const stored = window.localStorage.getItem(groupsStorageKey);
    return stored ? JSON.parse(stored) as StoredGroup[] : [];
  } catch {
    return [];
  }
}

function getInviteCodeFromPath() {
  const match = window.location.pathname.match(/^\/join\/([^/]+)\/?$/i);
  return match ? decodeURIComponent(match[1]).toUpperCase() : '';
}

function createMemberProfile(name: string, index: number): GroupMember {
  const cleanName = name.trim();
  const initials = cleanName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: cleanName,
    initials,
    color: memberColors[index % memberColors.length],
    budget: '',
    time: '',
    mood: '',
    categories: '',
    location: '',
    distance: '',
    note: '',
    preferencesSubmitted: false,
  };
}

const steps: { id: Screen; label: string; number: string }[] = [
  { id: 'group', label: 'Your group', number: '01' },
  { id: 'preferences', label: 'The vibe', number: '02' },
  { id: 'location', label: 'Location', number: '03' },
  { id: 'overview', label: 'The mix', number: '04' },
  { id: 'recommendations', label: 'The plan', number: '05' },
];

const initialPicks: Picks = {
  budget: ['€10–20'],
  time: ['2 hours'],
  mood: ['Social'],
  categories: ['Food', 'Coffee'],
  distance: ['Walkable'],
};

function makeGroupCode(existingCodes: string[] = []): string {
  const identifier = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const code = `PLANB-${identifier.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  return existingCodes.includes(code) ? makeGroupCode(existingCodes) : code;
}

function makeInviteLink(code: string) {
  return `${window.location.origin}/join/${code.toLowerCase()}`;
}

function App() {
  const [savedGroups, setSavedGroups] = useState<StoredGroup[]>(readStoredGroups);
  const [inviteCodeFromUrl] = useState(getInviteCodeFromPath);
  const initialInviteGroup = savedGroups.find((group) => group.code === inviteCodeFromUrl);
  const [screen, setScreen] = useState<Screen>(() => inviteCodeFromUrl ? 'group' : 'welcome');
  const [groupName, setGroupName] = useState(initialInviteGroup?.name ?? 'Friday-ish crew');
  const [occasion, setOccasion] = useState('Just because');
  const [joinMode, setJoinMode] = useState(Boolean(inviteCodeFromUrl));
  const [groupCreated, setGroupCreated] = useState(Boolean(initialInviteGroup));
  const [ownerName, setOwnerName] = useState('');
  const [code, setCode] = useState(inviteCodeFromUrl);
  const [groupCode, setGroupCode] = useState(initialInviteGroup?.code ?? inviteCodeFromUrl);
  const [shareLink, setShareLink] = useState(inviteCodeFromUrl ? makeInviteLink(inviteCodeFromUrl) : '');
  const [joinedMembers, setJoinedMembers] = useState<GroupMember[]>(initialInviteGroup?.members ?? []);
  const [activeMemberId, setActiveMemberId] = useState('');
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningName, setJoiningName] = useState('');
  const [preferenceIndex, setPreferenceIndex] = useState(0);
  const [picks, setPicks] = useState<Picks>(initialPicks);
  const [savedVenues, setSavedVenues] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationMode, setLocationMode] = useState<'current' | 'search' | null>(null);
  const [showGpsPrompt, setShowGpsPrompt] = useState(false);

  const currentStep = steps.findIndex((step) => step.id === screen);
  const currentPreference: PreferenceGroup = preferenceGroups[preferenceIndex];
  const allPreferencesSubmitted = joinedMembers.length >= 2 && joinedMembers.every((member) => member.preferencesSubmitted);
  const nextPreferenceMember = joinedMembers.find((member) => member.id === activeMemberId && !member.preferencesSubmitted)
    ?? joinedMembers.find((member) => !member.preferencesSubmitted);

  function persistGroup(group: StoredGroup) {
    const storedGroups = readStoredGroups();
    const updatedGroups = [...storedGroups.filter((stored) => stored.code !== group.code), group];
    setSavedGroups(updatedGroups);
    window.localStorage.setItem(groupsStorageKey, JSON.stringify(updatedGroups));
  }

  useEffect(() => {
    function syncStoredGroups(event: StorageEvent) {
      if (event.key !== groupsStorageKey || !event.newValue) return;
      try {
        const groups = JSON.parse(event.newValue) as StoredGroup[];
        setSavedGroups(groups);
        const activeGroup = groups.find((group) => group.code === groupCode);
        if (activeGroup) {
          setJoinedMembers(activeGroup.members);
          setGroupName(activeGroup.name);
        }
      } catch {
        setSavedGroups([]);
      }
    }

    window.addEventListener('storage', syncStoredGroups);
    return () => window.removeEventListener('storage', syncStoredGroups);
  }, [groupCode]);

  function startGroup(join: boolean) {
    setJoinMode(join);
    const nextCode = join ? '' : makeGroupCode(readStoredGroups().map((group) => group.code));
    setGroupCode(nextCode);
    setCode(nextCode);
    setShareLink(nextCode ? makeInviteLink(nextCode) : '');
    setGroupName('Friday-ish crew');
    setGroupCreated(false);
    setOwnerName('');
    setJoinedMembers([]);
    setActiveMemberId('');
    setShowInvitePanel(false);
    setJoinCodeInput('');
    setJoiningName('');
    setScreen('group');
  }

  function createGroup() {
    if (!groupName.trim() || !ownerName.trim() || !groupCode) return;
    const owner = createMemberProfile(ownerName, 0);
    const group = { code: groupCode, name: groupName.trim(), members: [owner] };
    persistGroup(group);
    setJoinedMembers(group.members);
    setActiveMemberId(owner.id);
    setGroupCreated(true);
    setToast(`${owner.name}, your group is ready for invites`);
    window.setTimeout(() => setToast(''), 2200);
  }

  function joinWithCode(enteredCode: string, enteredName: string) {
    const normalized = enteredCode.trim().toUpperCase();
    const targetGroup = readStoredGroups().find((group) => group.code === normalized);
    if (!normalized || !targetGroup) {
      setToast('That group is not saved in this browser. A shared backend is needed across devices.');
      window.setTimeout(() => setToast(''), 2200);
      return;
    }

    if (!enteredName.trim()) {
      setToast('Enter your name to create your group profile.');
      window.setTimeout(() => setToast(''), 2200);
      return;
    }

    const member = createMemberProfile(enteredName, targetGroup.members.length);
    const updatedGroup = { ...targetGroup, members: [...targetGroup.members, member] };
    persistGroup(updatedGroup);
    setJoinedMembers(updatedGroup.members);
    setActiveMemberId(member.id);
    setGroupCode(updatedGroup.code);
    setGroupName(updatedGroup.name);
    setShareLink(makeInviteLink(updatedGroup.code));
    setGroupCreated(true);
    setJoinMode(false);
    setJoinCodeInput('');
    setJoiningName('');
    setShowInvitePanel(false);
    setToast(`${member.name} joined ${updatedGroup.name}`);
    window.setTimeout(() => setToast(''), 2200);
  }

  function joinExistingGroup() {
    joinWithCode(code, ownerName);
  }

  function copyInviteCode() {
    if (!navigator.clipboard?.writeText) {
      setToast('Copy is unavailable here. Select the code above to copy it.');
    } else {
      void navigator.clipboard.writeText(groupCode).then(() => {
        setToast('Invite code copied');
      }).catch(() => setToast('Copy failed. Select the code above to copy it.'));
    }
    window.setTimeout(() => setToast(''), 2200);
  }

  async function shareInvitationLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${groupName} on Plan B`, text: 'Join our Plan B group', url: shareLink });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
        setToast('Invitation link copied. Share it with your friends.');
        window.setTimeout(() => setToast(''), 2400);
      } else {
        setToast('Sharing is unavailable here. Copy the invitation link above.');
        window.setTimeout(() => setToast(''), 2400);
      }
    } catch {
      setToast('Share was cancelled. You can copy the invitation link instead.');
      window.setTimeout(() => setToast(''), 2400);
    }
  }

  function startPreferences() {
    if (joinedMembers.length < 2) return;
    if (allPreferencesSubmitted) {
      changeScreen('location');
      return;
    }
    if (nextPreferenceMember) setActiveMemberId(nextPreferenceMember.id);
    setPreferenceIndex(0);
    setPicks(initialPicks);
    setScreen('preferences');
  }

  function changeScreen(next: Screen) {
    setToast('');
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    if (screen === 'preferences' && preferenceIndex > 0) {
      setPreferenceIndex((index) => index - 1);
      return;
    }
    const previous: Partial<Record<Screen, Screen>> = {
      group: 'welcome',
      preferences: 'group',
      location: 'preferences',
      overview: 'location',
      recommendations: 'overview',
    };
    if (previous[screen]) changeScreen(previous[screen]!);
  }

  function togglePick(group: PreferenceGroup, label: string) {
    setPicks((current) => {
      const selected = current[group.key] ?? [];
      const isMultiSelect = group.key === 'categories';
      const updated = selected.includes(label)
        ? selected.filter((item) => item !== label)
        : isMultiSelect ? [...selected, label] : [label];
      return { ...current, [group.key]: updated };
    });
  }

  function advancePreference() {
    if (preferenceIndex < preferenceGroups.length - 1) {
      setPreferenceIndex((index) => index + 1);
    } else {
      const activeMember = joinedMembers.find((member) => member.id === activeMemberId);
      if (activeMember) {
        const updatedMember = {
          ...activeMember,
          budget: picks.budget?.join(', ') ?? '',
          time: picks.time?.join(', ') ?? '',
          mood: picks.mood?.join(', ') ?? '',
          categories: picks.categories?.join(', ') ?? '',
          distance: picks.distance?.join(', ') ?? '',
          preferencesSubmitted: true,
        };
        const updatedMembers = joinedMembers.map((member) => member.id === activeMemberId ? updatedMember : member);
        const updatedGroup = { code: groupCode, name: groupName, members: updatedMembers };
        persistGroup(updatedGroup);
        setJoinedMembers(updatedMembers);
        const nextMember = updatedMembers.find((member) => !member.preferencesSubmitted);
        if (nextMember) {
          setActiveMemberId(nextMember.id);
          setScreen('group');
          setToast(`${updatedMember.name}'s preferences are in. ${nextMember.name} is up next.`);
          window.setTimeout(() => setToast(''), 2600);
          return;
        }
      }
      changeScreen('location');
    }
  }

  function toggleSaved(venue: Venue) {
    const isSaved = savedVenues.includes(venue.id);
    setSavedVenues((current) => isSaved
      ? current.filter((id) => id !== venue.id)
      : [...current, venue.id]);
    setToast(isSaved ? `${venue.name} removed from your shortlist` : `${venue.name} added to your shortlist`);
    window.setTimeout(() => setToast(''), 2400);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => changeScreen('welcome')} aria-label="Plan B home">
          <span className="brand-mark" aria-hidden="true"><span>B</span><ArrowDownLeft size={15} strokeWidth={3} /></span>
          <span className="brand-name">plan b<span>.</span></span>
        </button>
        <div className="topbar-center"><span className="live-dot" /> A little less group chat. A lot more going out.</div>
        {screen !== 'welcome' && joinedMembers.length > 0 && (
          <button className="avatar-stack" onClick={() => joinedMembers.length > 1 && changeScreen('overview')} aria-label="View your group" disabled={joinedMembers.length < 2}>
            {joinedMembers.map((member) => {
              return <span key={member.id} className={`mini-avatar mini-avatar-${member.color}`} aria-label={member.name} title={member.name}>{member.initials}</span>;
            })}
          </button>
        )}
      </header>

      <main className={`main-content screen-${screen}`}>
        {screen !== 'welcome' && (
          <div className="journey-bar">
            <button className="back-button" onClick={goBack} aria-label="Go back"><ArrowLeft size={18} /></button>
            <div className="step-track" aria-label="Your planning progress">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  className={`step-item ${index === currentStep ? 'is-current' : ''} ${index < currentStep ? 'is-done' : ''}`}
                  onClick={() => index < currentStep && changeScreen(step.id)}
                  disabled={index >= currentStep}
                  aria-current={index === currentStep ? 'step' : undefined}
                >
                  <span className="step-dot">{index < currentStep ? <Check size={12} /> : step.number}</span>
                  <span>{step.label}</span>
                </button>
              ))}
            </div>
            <span className="journey-caption">YOUR PLAN, YOUR WAY</span>
          </div>
        )}

        {screen === 'welcome' && (
          <WelcomeScreen onCreate={() => startGroup(false)} onJoin={() => startGroup(true)} />
        )}

        {screen === 'group' && (
          <GroupScreen
            joinMode={joinMode}
            groupName={groupName}
            setGroupName={setGroupName}
            code={code}
            setCode={setCode}
            occasion={occasion}
            setOccasion={setOccasion}
            ownerName={ownerName}
            setOwnerName={setOwnerName}
            onContinue={startPreferences}
            onCreateGroup={createGroup}
            onJoinExisting={joinExistingGroup}
            joinedMembers={joinedMembers}
            groupCreated={groupCreated}
            allPreferencesSubmitted={allPreferencesSubmitted}
            nextPreferenceName={nextPreferenceMember?.name ?? ''}
            shareLink={shareLink}
            groupCode={groupCode}
            showInvitePanel={showInvitePanel}
            setShowInvitePanel={setShowInvitePanel}
            joinCodeInput={joinCodeInput}
            setJoinCodeInput={setJoinCodeInput}
            joiningName={joiningName}
            setJoiningName={setJoiningName}
            joinWithCode={() => joinWithCode(joinCodeInput, joiningName)}
            copyInviteCode={copyInviteCode}
            shareInvitationLink={shareInvitationLink}
            prototypeNote={<>Prototype only: groups are saved in this browser’s local storage. Friends on other devices are not connected; shared membership needs a backend.</>}
          />
        )}

        {screen === 'preferences' && (
          <PreferencesScreen
            preference={currentPreference}
            index={preferenceIndex}
            picks={picks}
            onToggle={togglePick}
            onNext={advancePreference}
          />
        )}

        {screen === 'location' && (
          <LocationScreen
            selectedLocation={selectedLocation}
            locationQuery={locationQuery}
            locationMode={locationMode}
            showGpsPrompt={showGpsPrompt}
            onUseCurrent={() => { setLocationMode('current'); setShowGpsPrompt(true); }}
            onAllowDemo={() => { setSelectedLocation(demoLocation); setShowGpsPrompt(false); }}
            onDismissGps={() => setShowGpsPrompt(false)}
            onSearchFocus={() => setLocationMode('search')}
            onQueryChange={setLocationQuery}
            onSelectLocation={(location) => { setSelectedLocation(location); setLocationMode('search'); }}
            onContinue={() => changeScreen('overview')}
          />
        )}

        {screen === 'overview' && (
          <OverviewScreen groupName={groupName || 'Friday-ish crew'} userPicks={picks} location={selectedLocation} joinedMembers={joinedMembers} activeMemberId={activeMemberId} onContinue={() => changeScreen('recommendations')} />
        )}

        {screen === 'recommendations' && (
          <RecommendationsScreen location={selectedLocation} saved={savedVenues} onToggleSaved={toggleSaved} />
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

function ScreenHeading({
  eyebrow,
  title,
  description,
  accent,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  accent: string;
}) {
  return (
    <div className="screen-heading">
      <div className={`eyebrow eyebrow-${accent}`}><span className="eyebrow-star">✳</span> {eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function WelcomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="welcome-copy">
        <div className="welcome-kicker"><span className="kicker-star">✳</span> GOOD PLANS, ZERO GROUP CHAT SPIRALS</div>
        <h1>Different plans.<br />One <span>good choice.</span></h1>
        <p className="welcome-description">Your group already exists. Plan B helps your friends compare tastes, budgets and time so you can decide on one spot everyone actually enjoys.</p>
        <div className="welcome-actions">
          <button className="button button-primary" onClick={onCreate}>Make a plan <ArrowRight size={18} /></button>
          <button className="button button-secondary" onClick={onJoin}><UsersRound size={17} /> Join a group</button>
        </div>
        <div className="welcome-proof"><UsersRound size={20} /><span>Built for real friends planning an outing together.</span></div>
      </div>
      <div className="welcome-art" aria-label="Illustration of friends bringing different preferences to a shared plan">
        <div className="art-scribble scribble-top">your crew<br />already knows each other ↗</div>
        <div className="art-sunburst">✳</div>
        <div className="art-card art-card-back"><span className="art-card-label">THE GROUP PICK</span><div className="art-food-row"><span>🍜</span><span>🌮</span><span>🥟</span></div><strong>Everyone gets<br />a little something.</strong><div className="art-match"><span>FIRST STEP</span><b>01</b></div></div>
        <div className="art-ticket"><span>PLAN A</span><span>meh.</span><X size={15} /></div>
        <div className="art-ticket ticket-good"><span>PLAN B</span><span>oh, yes.</span><Sparkles size={16} /></div>
        <div className="art-sticker">no more<br />“idk u pick”</div>
        <div className="art-scribble scribble-bottom">your people<br />1 actually good plan</div>
      </div>
      <div className="welcome-strip"><span><Sparkles size={16} /> FRIENDS ONLY</span><span>Budget · mood · time · the whole vibe</span><span>ONE GOOD PLAN <ArrowRight size={15} /></span></div>
    </section>
  );
}

function GroupScreen({
  joinMode,
  groupName,
  setGroupName,
  code,
  setCode,
  ownerName,
  setOwnerName,
  occasion,
  setOccasion,
  onContinue,
  onCreateGroup,
  onJoinExisting,
  joinedMembers,
  groupCreated,
  allPreferencesSubmitted,
  nextPreferenceName,
  shareLink,
  groupCode,
  showInvitePanel,
  setShowInvitePanel,
  joinCodeInput,
  setJoinCodeInput,
  joiningName,
  setJoiningName,
  joinWithCode,
  copyInviteCode,
  shareInvitationLink,
  prototypeNote,
}: {
  joinMode: boolean;
  groupName: string;
  setGroupName: (name: string) => void;
  code: string;
  setCode: (code: string) => void;
  ownerName: string;
  setOwnerName: (name: string) => void;
  occasion: string;
  setOccasion: (occasion: string) => void;
  onContinue: () => void;
  onCreateGroup: () => void;
  onJoinExisting: () => void;
  joinedMembers: GroupMember[];
  groupCreated: boolean;
  allPreferencesSubmitted: boolean;
  nextPreferenceName: string;
  shareLink: string;
  groupCode: string;
  showInvitePanel: boolean;
  setShowInvitePanel: (value: boolean) => void;
  joinCodeInput: string;
  setJoinCodeInput: (value: string) => void;
  joiningName: string;
  setJoiningName: (value: string) => void;
  joinWithCode: () => void;
  copyInviteCode: () => void;
  shareInvitationLink: () => void;
  prototypeNote: React.ReactNode;
}) {
  return (
    <section className="content-page group-page">
      <ScreenHeading eyebrow={joinMode ? 'JOIN YOUR CREW' : 'CREATE YOUR GROUP'} accent="pink" title={joinMode ? <>Use your<br /><span className="pink-text">group code.</span></> : <>Your crew,<br /><span className="pink-text">your rules.</span></>} description={joinMode ? 'Already got an invite? Pop in the code and jump straight in.' : 'Build a private plan with the people you actually want there.'} />
      <div className="form-layout">
        <div className="form-panel">
          {joinMode ? (
            <>
              <label className="field-label" htmlFor="joiner-name">YOUR NAME
                <input id="joiner-name" className="text-input" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Enter your name" maxLength={32} />
              </label>
              <label className="field-label" htmlFor="group-code">GROUP CODE
                <input id="group-code" className="text-input code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Paste your invitation code" />
              </label>
              <p className="prototype-note">{prototypeNote}</p>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="group-name">WHAT SHOULD WE CALL YOUR GROUP?
                <input id="group-name" className="text-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Friday-ish crew" maxLength={32} />
              </label>
              {!groupCreated && <label className="field-label group-owner-field" htmlFor="owner-name">YOUR NAME
                <input id="owner-name" className="text-input" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Enter your name" maxLength={32} />
              </label>}

              <button type="button" className="button button-secondary invite-open-button" onClick={() => setShowInvitePanel(true)} disabled={!groupCreated}><UsersRound size={17} /> Invite Friends</button>
              {!groupCreated && <p className="invite-prerequisite">Create your group first to generate its private invitation code.</p>}

              {showInvitePanel && (
                <div className="invite-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowInvitePanel(false)}>
                  <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
                    <button type="button" className="invite-modal-close" onClick={() => setShowInvitePanel(false)} aria-label="Close invitation modal"><X size={18} /></button>
                    <div className="eyebrow eyebrow-pink"><span className="eyebrow-star">✳</span> YOUR PRIVATE GROUP</div>
                    <h2 id="invite-modal-title">Bring your people in.</h2>
                    <p>Share this invitation with friends you already know. They can join with their own name and profile.</p>
                    <div className="share-link-box invite-code-box">
                      <div className="share-link-header"><span>GROUP INVITE CODE</span><span className="share-badge">{groupCode}</span></div>
                      <button type="button" className="button button-secondary share-copy" onClick={copyInviteCode}><Check size={16} /> Copy Code</button>
                    </div>
                    <label className="field-label" htmlFor="group-invite-link">INVITATION LINK
                      <input id="group-invite-link" readOnly value={shareLink} className="text-input" />
                    </label>
                    <button type="button" className="button button-primary share-invitation-button" onClick={shareInvitationLink}><UsersRound size={16} /> Share Invitation Link</button>
                    <p className="prototype-note modal-prototype-note">{prototypeNote}</p>
                    <div className="modal-join-section">
                      <h3>Join Group</h3>
                      <label className="field-label" htmlFor="friend-name">YOUR NAME
                        <input id="friend-name" className="text-input" value={joiningName} onChange={(event) => setJoiningName(event.target.value)} placeholder="Enter your name" maxLength={32} />
                      </label>
                      <label className="field-label" htmlFor="friend-code">GROUP CODE
                        <input id="friend-code" className="text-input code-input" value={joinCodeInput} onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())} placeholder="Enter the group code" />
                      </label>
                      <button type="button" className="button button-primary" onClick={joinWithCode} disabled={!joiningName.trim() || !joinCodeInput.trim()}>Join Group</button>
                    </div>
                  </section>
                </div>
              )}

              <fieldset className="occasion-fieldset">
                <legend>WHAT ARE WE CELEBRATING? <span>(OR NOT)</span></legend>
                <div className="occasion-grid">
                  {occasions.map(({ label, icon: Icon, color }) => (
                    <button key={label} type="button" className={`occasion-option ${occasion === label ? 'selected' : ''}`} onClick={() => setOccasion(label)} aria-pressed={occasion === label}>
                      <span className={`choice-icon choice-${color}`}><Icon size={19} /></span>{label}{occasion === label && <Check size={15} className="occasion-check" />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {!joinMode && groupCreated && joinedMembers.length < 2 && <div className="group-waiting-message" role="status">Your crew is waiting for you to invite your friends!</div>}
          {!joinMode && groupCreated && joinedMembers.length >= 2 && !allPreferencesSubmitted && <div className="group-waiting-message" role="status">Waiting for every member to share their preferences before group matching.</div>}
          <button className="button button-primary form-submit" onClick={joinMode ? onJoinExisting : groupCreated ? onContinue : onCreateGroup} disabled={joinMode ? !code.trim() || !ownerName.trim() : groupCreated ? joinedMembers.length < 2 : !groupName.trim() || !ownerName.trim()}>{joinMode ? 'Join Group' : groupCreated ? allPreferencesSubmitted ? 'Choose a location' : `Continue with ${nextPreferenceName || 'member'}’s preferences` : 'Create group'}</button>
          <div className="form-note"><Sparkles size={15} /> Friends only. No stranger matching here.</div>
        </div>
        <aside className="group-aside"><span className="aside-doodle">✳</span><div className="aside-label">YOUR CREW · {joinedMembers.length}</div><h2>Already know<br />who’s in <em>the group.</em></h2><p>Only people who create a profile and join with this group’s link or code appear here.</p><div className="aside-member-row">{joinedMembers.map((member) => <span key={member.id} className={`mini-member-pill mini-member-${member.color}`}>{member.name}</span>)}</div>{!joinedMembers.length && <p className="member-empty">Create a group or enter an invitation code to see its members.</p>}</aside>
      </div>
    </section>
  );
}

function PreferencesScreen({
  preference,
  index,
  picks,
  onToggle,
  onNext,
}: {
  preference: PreferenceGroup;
  index: number;
  picks: Picks;
  onToggle: (group: PreferenceGroup, label: string) => void;
  onNext: () => void;
}) {
  const selected = picks[preference.key] ?? [];
  return (
    <section className="content-page preferences-page">
      <div className="preference-intro">
        <ScreenHeading eyebrow={`THE VIBE CHECK · ${String(index + 1).padStart(2, '0')} / ${preferenceGroups.length}`} accent="purple" title={<>{preference.title.split('?')[0]}<span className="purple-text">?</span></>} description={preference.subtitle} />
        <div className="pref-side-note"><span className="note-asterisk">✳</span><span>There are no wrong<br />answers. Except “idk.”</span></div>
      </div>
      <div className="pref-progress"><span style={{ width: `${((index + 1) / preferenceGroups.length) * 100}%` }} /></div>
      <div className={`preference-options option-count-${preference.choices.length}`}>
        {preference.choices.map(({ label, icon: Icon, color }, choiceIndex) => {
          const isSelected = selected.includes(label);
          return (
            <button key={label} className={`preference-option ${isSelected ? 'selected' : ''}`} onClick={() => onToggle(preference, label)} aria-pressed={isSelected} style={{ animationDelay: `${choiceIndex * 50}ms` }}>
              <span className={`choice-icon choice-${color}`}>
                {Icon && <Icon size={21} strokeWidth={1.8} />}
              </span>
              <span className="option-name">{label}</span>
              <span className="option-check">{isSelected && <Check size={13} strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
      <div className="preferences-bottom"><span><span className="selection-dot" />{selected.length ? `${selected.length} picked` : 'Pick what feels right'}</span><button className="button button-primary" onClick={onNext}>{index === preferenceGroups.length - 1 ? 'See our mix' : 'Next'} <ArrowRight size={18} /></button></div>
      <div className="preference-footnote">{preference.key === 'categories' ? 'PICK AS MANY AS YOU LIKE' : 'WE’LL FIND THE SWEET SPOT TOGETHER'}</div>
    </section>
  );
}

function LocationScreen({
  selectedLocation,
  locationQuery,
  locationMode,
  showGpsPrompt,
  onUseCurrent,
  onAllowDemo,
  onDismissGps,
  onSearchFocus,
  onQueryChange,
  onSelectLocation,
  onContinue,
}: {
  selectedLocation: string;
  locationQuery: string;
  locationMode: 'current' | 'search' | null;
  showGpsPrompt: boolean;
  onUseCurrent: () => void;
  onAllowDemo: () => void;
  onDismissGps: () => void;
  onSearchFocus: () => void;
  onQueryChange: (query: string) => void;
  onSelectLocation: (location: string) => void;
  onContinue: () => void;
}) {
  const matchingLocations = suggestedLocations.filter((location) =>
    location.toLowerCase().includes(locationQuery.trim().toLowerCase()),
  );
  const hasExactMatch = suggestedLocations.some((location) => location.toLowerCase() === locationQuery.trim().toLowerCase());

  return (
    <section className="content-page location-page">
      <ScreenHeading eyebrow="PICK YOUR PATCH" accent="purple" title={<>Where’s the <span className="purple-text">meet-up?</span></>} description="We’ll keep the good spots close to wherever your group wants to be." />
      <div className="location-options">
        <article className={`location-option ${locationMode === 'current' ? 'is-active' : ''}`}>
          <div className="location-option-heading"><span className="location-option-icon icon-current"><Navigation size={19} /></span><div><h2>Use my current location</h2><p>Quick, easy, no pin-dropping.</p></div></div>
          <button className="location-action" onClick={onUseCurrent}><MapPin size={16} /> Use my current location <ChevronRight size={16} /></button>
          {showGpsPrompt && (
            <div className="gps-prompt" role="dialog" aria-label="Simulated location permission">
              <span className="gps-prompt-pin"><MapPin size={20} /></span>
              <strong>Plan B would like to use your location</strong>
              <p>This demo uses a pre-loaded location. No GPS is accessed.</p>
              <div><button onClick={onDismissGps}>Not now</button><button className="gps-allow" onClick={onAllowDemo}>Use demo location</button></div>
            </div>
          )}
          {locationMode === 'current' && !showGpsPrompt && selectedLocation && <div className="location-confirmation"><CheckCircle2 size={15} /> Using demo location: {selectedLocation}</div>}
        </article>

        <article className={`location-option ${locationMode === 'search' ? 'is-active' : ''}`}>
          <div className="location-option-heading"><span className="location-option-icon icon-search"><Search size={19} /></span><div><h2>Choose a location</h2><p>City, neighbourhood, or your usual spot.</p></div></div>
          <label className="location-search"><Search size={16} /><input value={locationQuery} onFocus={onSearchFocus} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && locationQuery.trim() && onSelectLocation(locationQuery.trim())} placeholder="Try a city or neighbourhood" aria-label="Search a city or neighbourhood" /></label>
          {locationMode === 'search' && (
            <div className="location-suggestions">
              <span className="suggestion-label">SUGGESTED FOR THIS DEMO</span>
              {matchingLocations.map((location) => <button key={location} className={selectedLocation === location ? 'suggestion-selected' : ''} onClick={() => onSelectLocation(location)}><MapPin size={14} />{location}{selectedLocation === location && <Check size={14} />}</button>)}
              {locationQuery.trim() && !hasExactMatch && <button className="custom-location" onClick={() => onSelectLocation(locationQuery.trim())}><Search size={14} />Use “{locationQuery.trim()}”</button>}
              {!matchingLocations.length && !locationQuery.trim() && <span className="suggestion-empty">Start typing to see suggestions.</span>}
            </div>
          )}
          {locationMode === 'search' && selectedLocation && <div className="location-confirmation"><CheckCircle2 size={15} /> Selected: {selectedLocation}</div>}
        </article>
      </div>
      <div className="location-bottom"><span><MapPin size={15} />{selectedLocation ? `Discovery area: ${selectedLocation}` : 'Choose either option to set your discovery area.'}</span><button className="button button-primary" onClick={onContinue} disabled={!selectedLocation}>Show us the group <ArrowRight size={18} /></button></div>
      <div className="location-demo-note">DEMO LOCATION ONLY · NO GPS OR MAP SERVICE IS CONNECTED</div>
    </section>
  );
}

function OverviewScreen({ groupName, userPicks, location, joinedMembers, activeMemberId, onContinue }: { groupName: string; userPicks: Picks; location: string; joinedMembers: GroupMember[]; activeMemberId: string; onContinue: () => void }) {
  function preferenceValue(member: GroupMember, key: 'budget' | 'time' | 'mood' | 'categories' | 'distance' | 'location') {
    if (member.id === activeMemberId && member.preferencesSubmitted) {
      if (key === 'location') return location || 'Not shared yet';
      return userPicks[key]?.join(', ') || 'Not shared yet';
    }
    return member[key] || 'Not shared yet';
  }

  return (
    <section className="content-page overview-page">
      <div className="overview-heading-row">
        <ScreenHeading eyebrow="SAME CREW, DIFFERENT VIBES" accent="peach" title={<><span className="peach-text">{groupName}</span> lineup.</>} description="These are the people who joined this private group. Preferences appear as each member shares them." />
      </div>
      <div className="member-grid">
        {joinedMembers.map((member, index) => (
          <article className={`member-card member-${member.color}`} key={member.id} style={{ animationDelay: `${index * 100}ms` }}>
            <div className="member-card-top"><div className={`member-avatar avatar-${member.color}`}>{member.initials}</div><span className="member-number">0{index + 1} / {String(joinedMembers.length).padStart(2, '0')}</span></div>
            <h2>{member.name}</h2>
            <p className="member-quote">{member.preferencesSubmitted ? 'Preferences shared with the group.' : 'Joined the group. Preferences not shared yet.'}</p>
            <div className="member-tags"><span><Wallet size={13} />{preferenceValue(member, 'budget')}</span><span><Clock3 size={13} />{preferenceValue(member, 'time')}</span><span><Sparkles size={13} />{preferenceValue(member, 'mood')}</span><span><Heart size={13} />{preferenceValue(member, 'categories')}</span><span><MapPin size={13} />{preferenceValue(member, 'location')}</span><span><Navigation size={13} />{preferenceValue(member, 'distance')}</span></div>
            <div className="member-card-bottom"><span>HAS A POINT</span><span className="member-doodle">{member.color === 'pink' ? '♥' : member.color === 'lime' ? '↗' : '✳'}</span></div>
          </article>
        ))}
      </div>
      <div className="group-insight"><div className="insight-icon"><UsersRound size={21} /></div><div><strong>Same group, different priorities.</strong><span>We’re balancing budgets, food and drink favorites, mood, time and a meet-up spot that works for everyone in this friend group.</span></div><span className="insight-spark">✳</span></div>
      <div className="overview-actions"><span>THE GROUP CHAT HAS DONE ENOUGH.</span><button className="button button-primary" onClick={onContinue}>Find our Plan B <Sparkles size={17} /></button></div>
    </section>
  );
}

function RecommendationsScreen({ location, saved, onToggleSaved }: { location: string; saved: string[]; onToggleSaved: (venue: Venue) => void }) {
  const [activeVenue, setActiveVenue] = useState(venues[0].id);

  return (
    <section className="content-page recommendations-page">
      <div className="recommendation-heading-row">
        <ScreenHeading eyebrow="DRUMROLL, PLEASE" accent="lime" title={<>Your kind of <span className="lime-text">place.</span></>} description={`Fictional local spots around ${location || 'your chosen area'}, matched to your friend group.`} />
        <div className="match-stamp"><Sparkles size={16} /><span>MADE FOR<br />YOUR GROUP</span></div>
      </div>
      <div className="demo-disclaimer">DEMO VENUES · Names, imagery, distances and hours are fictional examples.</div>
      <div className="best-match-note"><span className="best-match-star">✳</span><div><strong>Why Olive & Ember is the best compromise</strong><span>It keeps the group within budget, offers a relaxed group-friendly menu, and sits close to your selected area. The scores below reflect your friend group’s shared preferences.</span></div></div>
      <MockMap location={location} activeVenue={activeVenue} onSelectVenue={setActiveVenue} />
      <div className="recommendation-list">
        {venues.map((venue, index) => (
          <VenueCard key={venue.id} venue={venue} rank={index + 1} active={activeVenue === venue.id} onActivate={() => setActiveVenue(venue.id)} saved={saved.includes(venue.id)} onToggleSaved={onToggleSaved} />
        ))}
      </div>
      <div className="recommendation-footer"><span><span className="tiny-live-dot" /> FICTIONAL VENUES · DEMO HOURS · SAMPLE GROUP SCORES</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top <ArrowRight size={14} /></button></div>
    </section>
  );
}

function MockMap({ location, activeVenue, onSelectVenue }: { location: string; activeVenue: string; onSelectVenue: (venueId: string) => void }) {
  return (
    <section className="mock-map-section" aria-label="Demonstration map showing three fictional venues">
      <div className="mock-map-heading"><div><MapPin size={16} /><span>THE LOCAL LOWDOWN</span></div><span>{location.toUpperCase()} · DEMO MAP</span></div>
      <div className="mock-map">
        <div className="map-road map-road-one" /><div className="map-road map-road-two" /><div className="map-road map-road-three" /><div className="map-road map-road-four" />
        <div className="map-park"><span>THE LITTLE<br />GREEN BIT</span></div>
        <span className="map-district map-district-one">LITTLE STREETS</span><span className="map-district map-district-two">THE BUSY BIT</span>
        {venues.map((venue, index) => (
          <button key={venue.id} className={`map-pin map-pin-${index + 1} ${activeVenue === venue.id ? 'pin-active' : ''}`} onClick={() => onSelectVenue(venue.id)} aria-label={`View ${venue.name} on map`} aria-pressed={activeVenue === venue.id}>
            <span>{index + 1}</span><i />
          </button>
        ))}
        <span className="map-compass">N<br /><ArrowRight size={13} /></span>
        <div className="map-label">DEMO MAP · NOT TO SCALE</div>
      </div>
      <div className="map-legend">{venues.map((venue, index) => <button key={venue.id} className={activeVenue === venue.id ? 'legend-active' : ''} onClick={() => onSelectVenue(venue.id)}><span className={`legend-number legend-${index + 1}`}>{index + 1}</span>{venue.name}<span className="legend-category">{venue.category}</span></button>)}</div>
    </section>
  );
}

function VenueCard({
  venue,
  rank,
  active,
  onActivate,
  saved,
  onToggleSaved,
}: {
  venue: Venue;
  rank: number;
  active: boolean;
  onActivate: () => void;
  saved: boolean;
  onToggleSaved: (venue: Venue) => void;
}) {
  return (
    <article className={`activity-card activity-${venue.color} ${rank === 1 ? 'activity-featured' : ''} ${active ? 'venue-active' : ''}`} onClick={onActivate}>
      <div className="activity-image-wrap">
        <img className="activity-image" src={venue.image} alt={venue.imageAlt} loading={rank === 1 ? 'eager' : 'lazy'} />
        <div className="image-overlay" />
        {venue.badge && <span className="activity-badge"><Sparkles size={13} /> {venue.badge}</span>}
        <span className="activity-rank">0{rank}</span>
        <div className="compatibility-badge"><span>GROUP<br />MATCH</span><strong>{venue.compatibility}<small>%</small></strong></div>
      </div>
      <div className="activity-content">
        <div className="activity-category">{venue.category === 'Cafe' && <Coffee size={12} />}{venue.category === 'Bar' && <Wine size={12} />}{venue.category} · FICTIONAL DEMO</div>
        <div className="activity-title-row"><h2>{venue.name}</h2><button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleSaved(venue); }} aria-label={saved ? `Remove ${venue.name} from shortlist` : `Add ${venue.name} to shortlist`} aria-pressed={saved}>{saved ? <Check size={17} /> : <Plus size={18} />}</button></div>
        <p className="activity-description">{venue.description}</p>
        <div className="activity-meta"><span><Wallet size={15} />{venue.price}<small> / person</small></span><span><MapPin size={15} />{venue.distance}</span><span><Clock3 size={15} />{venue.travelTime}</span></div>
        <div className="venue-hours"><Clock3 size={13} />{venue.openingHours}</div>
        <div className="activity-reason"><span className="reason-spark">✳</span><p><strong>Why it works</strong>{venue.reason}</p></div>
        <button className={`activity-cta ${saved ? 'cta-saved' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleSaved(venue); }}>{saved ? 'In your shortlist' : rank === 1 ? 'This one feels right' : 'Add to shortlist'}{saved ? <Check size={15} /> : <ChevronRight size={16} />}</button>
      </div>
    </article>
  );
}

export default App;