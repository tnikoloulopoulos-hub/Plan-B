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

export type PlaceCategory = 'cafe' | 'restaurant' | 'bar' | 'activity';

export const placeCategories: { id: PlaceCategory; label: string }[] = [
  { id: 'cafe', label: 'Cafes' },
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'bar', label: 'Bars & pubs' },
  { id: 'activity', label: 'Activities' },
];

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
      { label: 'Outdoors', icon: MapPin, color: 'purple' },
      { label: 'Entertainment', icon: Music2, color: 'peach' },
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
