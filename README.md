# Earth 3D

A zoomable 3D Earth in one self-contained web page, also packaged as an Android app.

- **Shape:** the WGS84 ellipsoid displaced by the EGM96 geoid (15′ grid), with adjustable exaggeration.
- **Map:** continents, borders, lakes, and labels for oceans, seas and large lakes.
- **Sea currents:** 29 main surface currents as animated arrows (simplified, hand-drawn paths).
- **El Niño / La Niña:** measured sea-surface temperature anomalies for Dec 1997–Feb 1998 and Dec 2010–Feb 2011.
- **Satellites:** LEO, MEO and geostationary orbits to scale, plus swarms (Starlink, OneWeb, Planet Doves, Kinéis).

## Build the web page

Needs Node 22 or newer.

```
npm install
npm run build
```

This writes `dist/index.html`, a single file that works on its own (it only loads the Public Sans font from Google Fonts when online).

## Android APK

Every push to `main` runs `.github/workflows/android-apk.yml`, which builds a debug APK with Capacitor and attaches it to a new GitHub Release. The newest APK is always at:

```
https://github.com/EmeraldLanguageLearning/Global-geoid-currents-sats/releases/latest/download/earth-3d.apk
```

The APK is a debug build signed with a throwaway key, so each build has a different signature: uninstall the previous build before installing a new one. For updates in place, or for Google Play, add a release keystore and a signed `assembleRelease` step.

To build locally instead (needs Java 21 and the Android SDK):

```
npm run android
cd android && ./gradlew assembleDebug
```

The app id and name are in `capacitor.config.json`.

## Web page on GitHub Pages (optional)

`.github/workflows/pages.yml` publishes `dist/` to GitHub Pages. In the repository, set Settings → Pages → Source to "GitHub Actions" first; until then that workflow fails and can be ignored or deleted.

## Layout

| Path | What it is |
|---|---|
| `src/main.js` | The whole app (Three.js) |
| `src/template.html` | Page markup and styles; the bundle is inlined at `__BUNDLE__` |
| `src/geoid.b64`, `src/extremes.json` | EGM96 grid in centimetres and its extremes, made by `tools/prep.mjs` |
| `src/lakes.json` | Lake outlines, made by `tools/prep.mjs` from `data/ne_50m_lakes.geojson` |
| `src/sst.json` | Sea-temperature anomalies, made by `tools/sst.py` |
| `tools/build.mjs` | Bundles and inlines into `dist/index.html` |

`tools/sst.py` needs Python with `numpy` and `netCDF4`, and the file `ersstv5.nc` from the `pydata/xarray-data` repository: `python tools/sst.py ersstv5.nc src/sst.json`.

## Data and libraries

- EGM96 geoid: US National Geospatial-Intelligence Agency, via the `egm96-universal` package (MIT).
- Coastlines, borders, lakes: Natural Earth (public domain), via `world-atlas` (ISC).
- Sea-surface temperature: NOAA ERSSTv5, via `pydata/xarray-data`.
- Rendering: three.js (MIT). Android wrapper: Capacitor (MIT).

Sea-current paths, satellite positions and the split of Starlink dots between shells are illustrative. Orbit altitudes and inclinations are typical published values; see the notes inside the app.

No licence has been chosen for this project's own code yet.
