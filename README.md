# Plan-B
Plan B helps groups of friends find real nearby places that fit their shared interests and location. Tagline: “Different plans. One good choice.”

## HW2 interactive mockup

This React + TypeScript prototype supports a group of 2–8 friends planning together on one shared device. Create a group, pass the device from person to person to add names and individual budget/time/mood/activity/distance preferences, choose a location, review or edit answers, and browse nearby places from OpenStreetMap. The session and selected coordinates are saved in this browser's local storage; invitation links, group codes, cross-device syncing, and real-time communication are not supported. There is no backend, account system, or live voting.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`.

### Location and nearby places

- **Current location:** the browser Geolocation API asks for permission, then Nominatim reverse-geocodes the actual coordinates.
- **Manual location:** search a city or neighbourhood with Nominatim and select one of its returned, coordinate-bearing results. Arbitrary text is not treated as a real location.
- **Nearby places:** on “Find our perfect plan,” the app requests up to 300 mapped place elements within 5 km of the selected coordinates from the Overpass API. Results include real OSM coordinates and only tagged details that are actually present; missing names, addresses, prices/fees, cuisine, opening hours, descriptions, phone numbers, and websites are shown as “Not available.”
- **Map:** Leaflet displays OpenStreetMap tiles and markers for returned place records, with OSM attribution. OSM place links open the corresponding mapped element.
- **Recommendations:** matching uses mapped place categories, straight-line distance from the chosen location, and comparable mapped cost data where present. Cost tags may not represent per-person prices. OSM does not consistently describe mood, duration, or opening hours, so the app does not infer a match for those preferences. Listings and map data can be incomplete or out of date.

Nominatim searches and reverse lookups are user-triggered, serialized with at least 1.1 seconds between requests, and cached in the browser session. Nearby place queries are bounded to 5 km, capped at 300 results, issued only after user action, and cached for the current page session. If an Overpass instance is unavailable, rate-limited, or returns an invalid response, the app tries other public Overpass instances with a per-request timeout. If every instance fails, it reports the failure and never substitutes fictional listings. The app does not prefetch map tiles. Nominatim and Overpass are public community services and may be slow or rate-limited. Usage follows the [Nominatim public service policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass API guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), and [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

### Test the location and recommendation flow

1. Run `npm install` and `npm run dev`, then open the local Vite URL.
2. Create a group and enter each participant's preferences on the same device.
3. Allow location access to test GPS, or search for a real city/neighbourhood and select a Nominatim result.
4. Review the group, then choose **Find our perfect plan**. The app queries Overpass and shows mapped places, category filters, an interactive map, OSM links, and available listing details.
5. Try a category filter, marker popup, and “Open OpenStreetMap listing.” If a public service is unavailable, confirm the app shows an error rather than sample businesses.
6. To build for production, run `npm run build`; tests run with `npm test`.

The app makes direct browser requests to the public Nominatim, Overpass, and OpenStreetMap tile services. No API key, paid service, backend, or external business-data provider is used. Display fonts and their license files remain bundled under `public/fonts`; recommendation cards do not use sample business photos.

### Project structure

- `src/App.tsx` contains the screen flow and reusable UI components.
- `src/openStreetMap.ts` handles Nominatim lookup, Overpass requests, OSM normalization, and local recommendation ranking.
- `src/data.ts` contains the preference and place-category choices.
- `src/styles.css` contains the responsive visual system, location UI, results cards, and Leaflet map styles.
- `public/images` and `public/fonts` contain the bundled visual assets.
