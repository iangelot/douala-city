# Procedural Douala

A real-time 3D model of Douala, Cameroon in the browser. Buildings, roads and the Wouri come from OpenStreetMap; facades, windows, traffic, night lighting and weather are generated.

Live controls match the Tokyo original: drag to pan, right-drag to rotate, wheel to zoom, WASD to fly (shift: fast), N for day/night.

## Districts

Akwa, Bonanjo, Port, Bonapriso, Deido, New Bell, Bonaberi.

## Run

```
npm install
npm run fetch -- --area=akwa
npm run compile -- --area=akwa
npm run dev
```

Open http://localhost:5280

Cameroon has no PLATEAU-style LOD2 city model, so wall detail is procedural from OSM footprints and heights.
