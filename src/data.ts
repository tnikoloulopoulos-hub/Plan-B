import type { LucideIcon } from 'lucide-react';
import {
  Coffee,
  Compass,
  MapPin,
  Music2,
  Sparkles,
  Utensils,
  Wallet,
  Wine,
} from 'lucide-react';

export type Choice = {
  label: string;
  icon?: LucideIcon;
  color?: string;
};

export type PreferenceGroup = {
  key: 'budget' | 'time' | 'mood' | 'categories' | 'distance';
  title: string;
  subtitle: string;
  choices: Choice[];
};

export const preferenceGroups: PreferenceGroup[] = [
  {
    key: 'budget',
    title: 'What are we spending?',
    subtitle: 'Keep everyone’s wallet happy.',
    choices: [
      { label: 'Free', icon: Sparkles, color: 'lime' },
      { label: '€1–10', icon: Wallet, color: 'peach' },
      { label: '€10–20', icon: Wallet, color: 'pink' },
      { label: '€20+', icon: Wallet, color: 'purple' },
    ],
  },
  {
    key: 'time',
    title: 'How much time have you got?',
    subtitle: 'Big plans, tiny window. We get it.',
    choices: [
      { label: '30 minutes', icon: Coffee, color: 'peach' },
      { label: '1 hour', icon: Coffee, color: 'lime' },
      { label: '2 hours', icon: Music2, color: 'pink' },
      { label: '4+ hours', icon: Compass, color: 'purple' },
    ],
  },
  {
    key: 'mood',
    title: 'What’s the mood?',
    subtitle: 'Pick the energy, we’ll find the plan.',
    choices: [
      { label: 'Chill', icon: Coffee, color: 'lime' },
      { label: 'Social', icon: Music2, color: 'pink' },
      { label: 'Adventurous', icon: Compass, color: 'peach' },
      { label: 'Treat yourself', icon: Sparkles, color: 'purple' },
    ],
  },
  {
    key: 'categories',
    title: 'What are we in the mood for?',
    subtitle: 'Pick one or mix a few. We’re not judging.',
    choices: [
      { label: 'Food', icon: Utensils, color: 'peach' },
      { label: 'Coffee', icon: Coffee, color: 'lime' },
      { label: 'Drinks', icon: Wine, color: 'pink' },
    ],
  },
  {
    key: 'distance',
    title: 'How far should we wander?',
    subtitle: 'A quick stroll or a little city adventure?',
    choices: [
      { label: 'Walkable', icon: MapPin, color: 'lime' },
      { label: 'Up to 5 km', icon: Compass, color: 'pink' },
      { label: 'Anywhere', icon: Sparkles, color: 'peach' },
    ],
  },
];

export const occasions = [
  { label: 'Just because', icon: Sparkles, color: 'lime' },
  { label: 'Birthday', icon: Music2, color: 'pink' },
  { label: 'Coffee catch-up', icon: Coffee, color: 'peach' },
  { label: 'After hours', icon: Wine, color: 'purple' },
];

export type Member = {
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
};

export const members: Member[] = [
  {
    name: 'Mia', initials: 'M', color: 'pink', budget: '€1–10', time: '2 hours',
    mood: 'Social', categories: 'Food', location: 'City Centre', distance: 'Walkable', note: '“Somewhere we can actually talk.”',
  },
  {
    name: 'Leo', initials: 'L', color: 'lime', budget: 'Free', time: '1 hour',
    mood: 'Chill', categories: 'Coffee', location: 'City Centre', distance: 'Up to 5 km', note: '“A really good flat white fixes most things.”',
  },
  {
    name: 'You', initials: 'Y', color: 'purple', budget: '€10–20', time: '2 hours',
    mood: 'Treat yourself', categories: 'Drinks', location: 'City Centre', distance: 'Walkable', note: '“Cute place, good menu, no long trek.”',
  },
];

export type Venue = {
  id: string;
  name: string;
  category: 'Restaurant' | 'Cafe' | 'Bar';
  description: string;
  price: string;
  distance: string;
  travelTime: string;
  openingHours: string;
  compatibility: number;
  reason: string;
  image: string;
  imageAlt: string;
  color: string;
  badge?: string;
};

export const demoLocation = 'Dublin City Centre';

export const suggestedLocations = [
  'Dublin City Centre',
  'Ranelagh',
  'Smithfield',
  'Portobello',
];

export const venues: Venue[] = [
  {
    id: 'olive-ember', name: 'Olive & Ember', category: 'Restaurant',
    description: 'A laid-back neighbourhood kitchen with shareable plates and a few veggie-friendly favorites.',
    price: '€12–18', distance: '0.6 km', travelTime: '8 min walk', openingHours: 'Demo hours · 12:00–22:00', compatibility: 92,
    reason: 'Shareable plates keep the group flexible: it fits Mia’s food-first mood, your budget, and leaves room for an easy coffee stop after.',
    image: '/images/venue-restaurant.jpg',
    imageAlt: 'Warm, inviting restaurant dining room', color: 'lime', badge: 'BEST GROUP MATCH',
  },
  {
    id: 'slow-morning', name: 'Slow Morning Coffee', category: 'Cafe',
    description: 'A cozy all-day cafe for excellent coffee, long chats and a very convincing pastry case.',
    price: '€6–12', distance: '1.1 km', travelTime: '14 min walk', openingHours: 'Demo hours · 08:00–17:00', compatibility: 84,
    reason: 'An easy-on-the-budget catch-up with the mellow pace Leo wants. The daytime hours make it best for an earlier start.',
    image: '/images/venue-cafe.jpg',
    imageAlt: 'Bright specialty coffee bar with a welcoming counter', color: 'peach',
  },
  {
    id: 'lilac-hour', name: 'The Lilac Hour', category: 'Bar',
    description: 'A low-key little cocktail spot with zero-proof options and a playlist worth Shazaming.',
    price: '€14–20', distance: '1.8 km', travelTime: '9 min by transit', openingHours: 'Demo hours · 16:00–00:00', compatibility: 76,
    reason: 'Best for your treat-yourself mood and a social night out. It lands near the top of the budget, so it’s the fun stretch pick.',
    image: '/images/venue-bar.jpg',
    imageAlt: 'Colorful cocktails on a softly lit bar counter', color: 'purple',
  },
];