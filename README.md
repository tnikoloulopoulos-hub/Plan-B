# Plan-B
Plan B helps groups of friends find real places and activities in Athens that fit their shared interests, budget and mood. Tagline: “Different plans. One good choice.”

## Athens planning app

This React + TypeScript application supports a group of 2–8 friends planning together on one shared device. Create a group, pass the device from person to person to add names and individual budget/time/mood/activity/distance preferences, select an Athens neighbourhood, review or edit answers, and browse nearby places from Geoapify. The session and selected coordinates are saved in this browser's local storage; invitation links, group codes, cross-device syncing, and real-time communication are not supported. There is no backend, account system, or live voting.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`.

### Geoapify API configuration

- Copy `.env.example` to `.env.local` and set `VITE_GEOAPIFY_API_KEY` to a Geoapify API key.
- Restart Vite after changing environment variables.
- Vite embeds `VITE_` variables in browser code and requests. The key is visible to users; configure Geoapify HTTP referrer/origin restrictions for the app's development and production domains, and enable only the required Geocoding and Places APIs. Never use a private server credential as a frontend key.

### Location and nearby places

- **Geographic scope:** Athens, Greece and its nearby urban neighbourhoods only. Location must be searched and explicitly selected; browser GPS is not used.
- **Geocoding:** Geoapify Geocoding searches are restricted to Greece and an Athens-area boundary. Results must include Greece/Attica and coordinates inside the configured Athens search extent.
- **Nearby places:** after group review, Geoapify Places searches a 2 km radius around the selected Geoapify coordinates, requests up to 25 real place features, and uses the official catering, entertainment, activity, leisure and sport categories. Names, categories, coordinates and available addresses come from the API response; unnamed or irrelevant features are omitted.
- **Map:** Leaflet displays OpenStreetMap tiles, actual returned markers, popups and OpenStreetMap attribution. A popup links to the business website when the API provides one, otherwise to its mapped coordinates.
- **Recommendations:** actual interest-category matches rank first, proximity second, and broad category relevance to mood/time third. The Places API does not provide verified prices or exact activity durations for all listings, so budget fit, prices, hours and reviews are not invented or inferred.
- **Failures:** missing/invalid keys, rate limits, network errors, invalid locations and a successful empty response are presented distinctly. Failed API calls never use sample businesses.

### Test the location and recommendation flow

1. Configure `VITE_GEOAPIFY_API_KEY` as above, then run `npm run dev`.
2. Create a group and enter each participant's preferences on the same device.
3. Search or choose a suggested Athens area (Pangrati, Syntagma, Kolonaki, Koukaki, Exarchia, Gazi, Monastiraki, Galatsi, Marousi or Nea Smyrni), then select a returned Geoapify location.
4. Review the group and select **Find our perfect plan**. Confirm that real Geoapify results are shown on the Leaflet map with OpenStreetMap tiles and attribution.
5. To build for production, run `npm run build`; automated tests run with `npm test`. Automated API tests use mock responses; live business-data verification requires a valid Geoapify API key.

### Project structure

- `src/App.tsx` contains the screen flow and reusable UI components.
- `src/geoapify.ts` handles Athens geocoding, nearby places, validation, error handling and preference ranking.
- `src/openStreetMap.ts` retains the previous Overpass implementation until the Geoapify rollout is verified with live API responses.
- `src/data.ts` contains the preference and place-category choices.
- `src/styles.css` contains the responsive visual system, location UI, results cards, and Leaflet map styles.
- `public/images` and `public/fonts` contain the bundled visual assets.
