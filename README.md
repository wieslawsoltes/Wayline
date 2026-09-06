# Wayline

Repository: https://github.com/wieslawsoltes/Wayline  
GitHub Pages: https://wieslawsoltes.github.io/Wayline/  
See [DEPLOYMENT.md](DEPLOYMENT.md) for publishing and provider setup.

**Your world. A little closer.**

An independent map explorer and geographic overlay editor, written in plain HTML,
CSS, and JavaScript. It combines a Google Maps–inspired interface with an original
WebGPU renderer, a Canvas 2D fallback, and an integrated map-making studio.

No application framework, map SDK, JavaScript runtime package, external font, API
key, or build step is needed to open the bundled application. Live map services
require internet access; using your own production providers may require keys or
billing. The application is not affiliated with Google.

## Run it

Open `index.html` directly for the offline illustrative map and editor.

For WebGPU and live map services, serve the directory locally:

```sh
python3 serve.py
```

Open `http://localhost:8080`. If that port is occupied:

```sh
python3 serve.py --port 8090
```

WebGPU needs a compatible browser/adapter and a secure context, normally HTTPS
or localhost. The app detects unavailable WebGPU and uses Canvas automatically.
The lower-left renderer badge reports the actual active backend, not the intended
one. Localhost makes WebGPU eligible; it does not guarantee GPU availability.

`index.html` is the single-file distribution. `index.dev.html` loads the same
application as readable ES modules and must be served. To rebuild the distribution
after changing `src/`:

```sh
python3 build.py
```

No npm install is required. The npm scripts are optional conveniences.

## Explore

The responsive interface includes a search panel, category chips, curated place
cards, saved places, recent places, map projects, route planning, provider settings,
a light/dark theme, and a mobile bottom sheet. The map supports dragging, inertia,
fractional cursor-anchored zoom, pinch zoom, touch rotation, compass reset,
fit-to-content, and user-initiated geolocation.

There are two deliberately separate basemaps:

- **Wayline reference:** original, hand-authored, approximate San Francisco vector
  artwork. It works offline. Its roads, coast, land use, and placement are
  illustrative, not a GIS extract or a navigable street map.
- **Live streets:** viewport-loaded raster XYZ tiles, OpenStreetMap by default.
  The renderer draws them itself; no iframe or third-party map widget is involved.
  Change layers using the lower-left Layers control. Direct `file:` usage disables
  live tile requests; serve the app to use them.

On HTTP/HTTPS, Live streets is selected initially. When tiles are loading or
unavailable, the original reference layer remains visible with an explicit status.
Outside the illustrative San Francisco area, that fallback is not geographic
coverage. Real worldwide map coverage depends on the configured tile service.

Local search checks the bundled landmarks and city presets. Online search is an
explicit action using a Nominatim-compatible endpoint; keystrokes do not trigger
public geocoding requests. Online driving routes use an OSRM-compatible endpoint,
with alternatives and a maneuver list when returned by the service. A failed road
route is not replaced with a fabricated route. Straight-line measurement is a
separate, explicitly labeled operation. Walking and cycling are not enabled against
the driving-only default service. Route timing does not include live traffic.

Some example businesses are fictional and are labeled that way. The app does not
invent real ratings, reviews, opening hours, or live business information.

## Make a map

Choose **Create map**, or press **E**. The editor operates on your own geographic
features; it does not edit OpenStreetMap's source database or raster tile content.

| Area | Implemented functionality |
| --- | --- |
| Geometry | Pins, labels, polylines, polygons, rectangles, circles, and distance measurements |
| Selection | Single/multiple selection, Shift-drag box selection, feature dragging, keyboard nudging |
| Vertices | Draggable vertices, double-click edge insertion, Alt-click vertex deletion, vertex snapping |
| Layers | Rename, reorder, duplicate, delete, visibility, locking |
| Appearance | Stroke, width, fill, opacity, text and halo colors |
| Typography | Multiline Unicode, system-font stacks, size, weight, italic, alignment, tracking, line height, halo width, rotation |
| Geometry information | Longitude/latitude editing, geodesic path lengths, spherical polygon area |
| History | Grouped editing transactions, undo, redo |
| Persistence | Browser-local autosave, saved places, portable project JSON |
| Interchange | GeoJSON import/export, JSON project import/export, PNG snapshot, SVG reference-map export |

Select **Load sample map** in the editor to see an editable composition immediately.
The sample's waterfront path is a sketch, not a road route.

### Keyboard and pointer controls

| Action | Control |
| --- | --- |
| Search / editor | `/` / `E` |
| Select / pin / line / polygon | `V` / `P` / `L` / `G` |
| Rectangle / circle / text / measure | `R` / `C` / `T` / `M` |
| Finish a path / cancel | `Enter` / `Escape` |
| Pan while drawing | Hold `Space`, then drag |
| Multiple selection | `Shift` + click; `Shift` + drag for box selection |
| Move a selection | Arrow keys; `Shift` for a larger step |
| Insert / delete vertex | Double-click an edge / `Alt` + click a vertex |
| Undo / redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Duplicate / save project / import | `Ctrl/Cmd+D` / `Ctrl/Cmd+S` / `Ctrl/Cmd+O` |
| Zoom | Mouse wheel, pinch, `+`, `-`, or map controls |

Standard text-input shortcuts remain available while typing into inputs.

### Export behavior

Project JSON includes the editable document, saved places, and camera view. GeoJSON
uses longitude/latitude WGS84 positions and retains Wayline styles and shape
metadata in feature properties. Other GIS readers will still see ordinary points,
lines, and polygons, but need not understand Wayline's editable circle metadata.

PNG captures the map, visible annotations, and a provider/reference attribution
footer. It excludes the surrounding interface. GPU snapshots use an owned render
target and padded GPU readback rather than relying on a presentation texture that
may have expired. SVG exports the original vector reference map and annotations;
it does **not** embed live raster tiles. Browser font availability can affect SVG
text when opened elsewhere. No font binaries are embedded or distributed.

## Renderer

`src/engine.js` implements native WebGPU pipelines: colored triangles, instanced
antialiased line capsules, shaped-label texture quads, and raster tile quads using
a bounded texture array. Geometry is projected using a double-precision JavaScript
camera and converted to screen-local float32 vertex/instance data for upload.
Reusable GPU buffers grow geometrically instead of being recreated for every frame.
The scene redraws on invalidation, not in a permanent idle animation loop.

The text path asks the browser to shape complete text runs into a bounded 2048 ×
2048 atlas and then batches those labels as GPU quads. It does not lay out strings
one code point at a time. Native shaping and system-font fallback are retained.
This is a bitmap run atlas, **not** an MSDF engine or a complete publishing text
layout system. Tracking support follows the browser's Canvas implementation;
paragraph direction uses a first-letter heuristic. Labels that exceed atlas
capacity can be omitted; diagnostics expose the omitted-label count.

There is no advertised FPS guarantee. The map badge measures CPU scene-build and
render-submission work; it is not a GPU timestamp, complete frame latency, or a
portable performance benchmark. See [ARCHITECTURE.md](ARCHITECTURE.md) for data
layouts, threading, tessellation, bounds, and extension points.

## Services, privacy, and deployment

Configure tile URL, visible attribution, search URL, and route URL in **Settings**.
The defaults are public services, not a production SLA or unlimited free hosting.
Read [THIRD_PARTY.md](THIRD_PARTY.md) and the provider policies before deployment.

The app makes no analytics calls and has no account backend. Documents, saved
places, and settings are browser-local. Loading live tiles reveals the requested
map area to the tile provider; online search sends the search text to the geocoder;
routing sends endpoints to the router. Geolocation is only requested from the
location control. Browser-local storage is not encrypted, synchronized, or a backup.
Export project JSON for portability and protection from cleared browser data.

Provider settings are public client configuration, not a safe place for server
secrets. CORS, attribution, authentication, rate limits, service capacity, retention,
and terms must be appropriate for browser clients. Deploy `index.html` on static
HTTPS hosting, and use suitably provisioned providers or your own backend for
production traffic. The supplied Python server is for local development, not an
internet-facing production server.

## Validation

The included run passed **12 dependency-free core tests** and **19 browser checks**.
The actual browser backend in that run was **Canvas 2D**. Search and route integration
checks used deterministic fixtures, not live public endpoints. No actual WebGPU
adapter, GPU device-loss event, GPU PNG readback, or live network path was validated
in the supplied run. Source syntax checks also passed. The recorded CPU timings
are observations from that environment, not performance claims.

See [TESTING.md](TESTING.md) and `tests/results.json`. To run the core checks:

```sh
node tests/test_core.mjs
```

To run the browser suite, install its development-only dependency:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/test_browser.py
```

Playwright is **not** an application dependency.

## Scope

This is a working standalone implementation, not Google Maps feature parity. It
has no Google map data, Street View, satellite layer, live traffic, review database,
transit/timetable engine, cloud synchronization, collaboration, authentication,
server geospatial index, vector-tile decoder, terrain, or 3D buildings. The editor
has one local active document plus import/export, not a multi-user project backend.
It is not a turn-by-turn navigation safety product.

The geometry tessellator handles valid planar simple rings and holes, not arbitrary
self-intersections or polygon repair. Import limits are 5 MiB for uploaded files,
2,000 generated features, and 25,000 coordinates per GeoJSON import; this is not a
million-feature GIS engine. Spatial indexing, worker-based tile decoding, streamed
vector tiles, and richer typography are extension points, not hidden implementations.

## Files

```text
index.html               Portable single-file app
index.dev.html           Modular development entry point
src/core.js              Projection, camera, history, geometry, GeoJSON validation
src/engine.js            WebGPU / Canvas rendering and snapshots
src/basemap.js           Original reference map and bounded XYZ tile loading
src/services.js          Curated places, explicit geocoding, OSRM routing
src/app.js                Interaction, editor, interface, persistence, exports
src/icons.js             Original inline SVG icon definitions
src/styles.css           Responsive interface and theme tokens
build.py                 Standard-library single-file bundler
serve.py                 Local development server
examples/overlays.geojson Portable example map features
ARCHITECTURE.md           Technical design and limitations
TESTING.md                Repeatable tests and validation boundaries
THIRD_PARTY.md            Data and provider policy notes
LICENSE                  MIT license for original application code/artwork
```

Original app code and original reference artwork are MIT licensed. Third-party map
data and services retain their own terms and licenses.
