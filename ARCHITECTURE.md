# Wayline architecture

## Boundaries

The product has three independent data planes: an illustrative local vector
basemap, an optional live raster basemap, and an editable geographic overlay
collection. UI state, map-service responses, document state, and renderer resources
are separate. A road route only becomes a document feature when the user explicitly
copies it into the editor. Switching basemap does not modify geographic overlays.

The implementation uses ES modules in development and a single inline module in
the portable build. There is no runtime import graph after bundling and no external
JavaScript. The bundler is deliberately tailored to the six project modules; it is
not a general JavaScript compiler or package resolver.

## Coordinate and camera contract

Public and persistent coordinates are `[longitude, latitude]` in degrees. CPU map
coordinates use normalized Web Mercator world units. Latitude is clamped to the
Mercator limit, approximately ±85.05112878°. Calculations use JavaScript numbers;
conversion to float32 happens only after camera-relative projection to CSS pixels.
This avoids uploading large world-space meter values into low-precision GPU math.

The camera stores normalized center, fractional zoom, and bearing in radians. Its
forward and inverse transforms account for viewport center, zoom, and rotation.
Cursor-anchored zoom computes the geographic anchor before a scale change and
corrects the camera center afterward. Longitude normalization and wrapped delta
selection handle camera movement around the antimeridian. Geometry itself is not
a complete antimeridian polygon-splitting implementation.

Geodesic distances use a spherical haversine model. Polygon area uses a spherical
calculation. These are map-making measurements, not ellipsoidal surveying results.

## Frame construction and draw ordering

`buildFrame()` transforms visible basemap objects, service routes, features,
selection handles, draft geometry, and labels into one `Frame` description.

1. Reference basemap triangle fills and line strokes, when needed.
2. Live raster tile quads, including available ancestor fallback tiles.
3. Route and document geometry batches.
4. Textured labels and map handles.

The UI and accessible point-of-interest hit targets use DOM elements. Cartographic
geometry and label drawing use the selected rendering backend. DOM labels are not
being presented as a WebGPU implementation.

Rendering is invalidation-driven. Pointer events, camera animation, changed data,
resize, service completion, and atlas/tile readiness schedule a frame. Coalescing
avoids redundant requestAnimationFrame callbacks. Inertia temporarily schedules
more frames; idle maps do not continuously redraw.

The current batching groups broad primitive types. It is not a fully general
per-feature painter's-order command list: fills, strokes, and labels are separate
passes. For intricate mixed-type overlay stacking, extend Frame with ordered draw
runs or a stable depth policy rather than assuming arbitrary compositing semantics.

## GPU data layouts

The uniform contains CSS viewport dimensions and padding. Vertex shaders transform
CSS coordinates into clip space; the canvas backing texture uses device pixels.

| Primitive | Layout | Stride |
| --- | --- | --- |
| Colored triangle | `position: float32x2`, `color: float32x4` | 24 bytes per vertex |
| Line capsule | `a: float32x2`, `b: float32x2`, `color: float32x4`, half width, dash, padding | 48 bytes per instance |
| Text/tile quad | Position/extent, UV origin/extent, auxiliary data including rotation/layer | 48 bytes per instance |

Capsules are instanced six-vertex quads; fragment coverage derives from the shortest
distance to the segment and a derivative-smoothed boundary. Overlapping round
capsules supply round joins. This is not a miter/bevel join tessellator. Dash phase
is segment-local, not a global path-distance attribute.

RGBA output is premultiplied in the shader and blended using one and
one-minus-source-alpha. The tile pipeline samples a 2D texture array, with the
layer supplied per instance. The text pipeline samples the shaped-label atlas.
Buffers are retained and grown to power-of-two capacities. The GPU queue receives
only current typed-array content. Canvas fallback consumes the same Frame model,
although visual rasterization and antialiasing need not be pixel-identical.

## Polygon filling

`triangulateRings()` is an original CPU scanline tessellator. It collects distinct
vertex Y positions, visits adjacent horizontal bands, finds edge crossings at the
band midpoint, sorts crossings, and pairs them using the even-odd rule. Each paired
strip becomes a trapezoid and two triangles. Splitting at every vertex Y ensures
crossing order is stable inside a band for valid non-self-intersecting input.

Concave outlines and multiple holes are supported and covered by area-based tests.
Intersecting boundaries, invalid topology, and automatic polygon repair are not.
Tessellation is currently performed on the main thread as frames are constructed;
complex production datasets need caching, spatial indexing, workers, or precomputed
vector-tile geometry rather than merely increasing limits.

## Typography

The browser shapes complete label lines into a 2048² Canvas atlas. Cache keys
include text and the complete style. A shelf allocator places each run, using a
nominal 2× raster scale and downscaling oversized runs to bounded dimensions.
Atlas saturation triggers a reset/repack; unplaceable labels are counted and
omitted rather than writing out of bounds. Limits are explicit, not an unbounded
texture-allocation strategy.

Native Canvas shaping supplies font fallback, ligatures, and script shaping.
Multiline layout, line height, style, halo, alignment, and rotation are handled by
Wayline. Direction is chosen from the first Unicode letter in each line, so this
is not a substitute for explicit paragraph direction controls or a full rich-text
layout engine. System fonts are referenced, not redistributed. Canvas letterSpacing
is feature-detected. There is no HarfBuzz WASM dependency, glyph-outline extraction,
MSDF atlas, text-on-path layout, per-span formatting, or GPU shaping.

An approximate label collision pass prioritizes map labels and suppresses
intersecting boxes. It is intended for the small bundled reference map, not a
production worldwide cartographic label-placement optimizer. User labels are not
silently culled by that basemap collision policy.

## Tiles and online services

The XYZ tile manager uses integer tile zoom with fractional camera scale, bounded
visible demand, six concurrent requests, ancestor fallback, and LRU-style eviction.
At most 128 tile layers are available; tiles must be 256×256. Eviction closes bitmap
resources. Provider changes invalidate stale generations so a late response cannot
replace a tile belonging to the new source.

Requests use ordinary browser HTTP caching; there is no offline tile download,
service worker cache, bulk region prefetch, or cache-bypassing request header.
Requests time out and failed states are explicit. Providers must permit CORS so
tile pixels can be uploaded and exported without tainting a canvas.

The Nominatim adapter serializes explicit requests, waits at least 1.1 seconds
between starts, caches results, and coordinates cooperating tabs where Web Locks
is available. This is a browser-local courtesy throttle, not fleet-wide enforcement
of a public service's application-wide capacity limits. Production installations
should centralize policy/caching or use a suitable provisioned provider.

The OSRM adapter is specifically driving-profile routing. It supports cancellation,
timeout, alternatives, and steps. It does not infer mode support from a UI icon or
reinterpret failures as straight-line road navigation.

## Document and history

A feature contains id, type, coordinates, optional holes, name, text, visibility,
lock state, and style. One document contains features plus saved/recent place data.
History stores snapshots with a bounded 80-state undo budget. Pointer gestures use
one committed transaction; transient drag updates do not create hundreds of undo
steps. This favors correctness and simplicity over a persistent structural-sharing
or command-delta implementation. Memory cost still scales with document size.

Autosave is debounced into localStorage. It is best-effort; private contexts,
quota restrictions, opaque origins, and browser policies may reject persistence.
The application displays a warning rather than claiming a failed save succeeded.
Portable JSON export is the durable user-controlled interchange path.

## Import, export, and safety

Imported GeoJSON is validated before entering document state. Position bounds,
finite numbers, feature/coordinate counts, ring sizes, text lengths, style ranges,
and supported geometry kinds are checked. Imported HTML is never trusted as UI
markup: visible strings are escaped. This is input validation, not proof of a
formal security audit. GeoJSON GeometryCollection and arbitrary CRS conversion
are outside the importer contract.

Project JSON reloads a validated geographic feature representation rather than
blindly trusting raw object graphs. File uploads are limited to 5 MiB. Configured
provider URLs require HTTPS except localhost; credentials and server secrets must
not be entered into browser-visible configuration.

Canvas PNG capture redraws before copying. GPU capture renders into an owned
attachment with COPY_SRC usage, copies to a MAP_READ buffer with 256-byte-aligned
rows, removes row padding, and swaps BGRA to RGBA where necessary. Resources are
unmapped and destroyed in a finally block. A footer preserves the selected tile
provider's attribution, or the reference layer's illustrative warning. This GPU
capture path is implemented but was not exercised on an actual adapter in the
supplied validation run.

Device loss transitions to Canvas after replacing the canvas element, because a
canvas with an established WebGPU context cannot simply be rebound as 2D. Automatic
GPU reacquisition is not implemented; reload the app to retry. This recovery path
also requires actual GPU validation beyond the included Canvas test run.

## Embedding and diagnostics

Wait for the `wayline:ready` event or check `window.Wayline?.ready`.

```js
const map = window.Wayline;
map.setView([-122.4484, 37.8028], 15);
map.setBasemap('atlas'); // 'live' selects configured XYZ tiles
map.openEditor();
map.setTool('text');

const snapshot = map.getDocument();       // cloned document
const geojson = map.exportGeoJSON();
const project = map.exportProject();
const diagnostics = map.getRenderer();   // backend, fallback reason, CPU counters
const pixel = map.screen([-122.4484, 37.8028]);
const geographic = map.coordinates(pixel);
```

Other commands include importGeoJSON, undo, redo, closeEditor, setTheme, getView,
and getSelection. Camera bearings returned by getView are radians. Renderer stats
are CPU timings, primitive/draw counts, and dropped labels; they are not GPU query
timestamps. The public helper surface is a convenience API, not a versioned stable
SDK contract.

## Production extensions

Prioritize tested WebGPU compatibility and service provisioning first. After that,
use measured bottlenecks to justify geometry caches, worker processing, a spatial
index, ordered compositing, richer script-direction controls, larger or multi-page
text atlases, vector-tile decoding, offline licensed data, and server-backed project
storage. None of these is claimed as already present.
