# Plan-B
Plan B helps groups of friends find fictional example restaurants, cafes, and bars that fit everyone's budget, mood, available time, food-and-drink preferences, and preferred distance. Tagline: “Different plans. One good choice.”

## HW1 interactive mockup

This React + TypeScript prototype demonstrates the Plan B journey: create or join a group, select budget/time/mood/categories/distance, choose a location, compare three fictional group members, and browse three ranked venue examples with a mock map. Venue names, photos, distances, travel times, hours, compatibility scores, and explanations are demonstration data, not verified listings. There is no backend, account system, live voting, GPS, map/place service, or recommendation algorithm.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`.

The demo location is Dublin City Centre; current-location permission is simulated, and manual search uses local suggestions only. Photos and the existing display fonts are bundled under `public/images` and `public/fonts`, so the mockup makes no runtime requests to map, places, image, or font services. Font license files are included beside the bundled fonts.

### Project structure

- `src/App.tsx` contains the screen flow and reusable UI components.
- `src/data.ts` contains the fictional preferences, group members, suggested locations, and venue examples.
- `src/styles.css` contains the responsive visual system and motion.
- `public/images` and `public/fonts` contain the bundled visual assets.
