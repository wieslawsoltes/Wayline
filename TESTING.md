# Validation and reproduction

## Supplied run

The source build completed and every JavaScript source file passed `node --check`.
The Node geometry/history/import suite passed **12 checks**. The Playwright suite
passed **19 browser checks**. `tests/results.json` records the browser results.

The browser was a real Chromium process rendering an in-memory document at
1600×1000 desktop and 390×844 mobile CSS-pixel viewports. That document was not a
secure origin, so it exercised **Canvas 2D**, not WebGPU. Actual browser UI pointer,
keyboard, layout, and export operations were tested. Search and routing responses
were explicitly supplied fixtures. Live tile loading was not verified. Screenshots
are actual application renders, not design mockups.

This environment did not permit navigating to a local development origin. No
browser policy was bypassed. Autosave on a normal persistent origin, clipboard
permissions, geolocation, OS-native download handling, actual WebGPU compilation,
GPU readback, GPU device loss, and public-provider connectivity remain separate
manual/integration validation items.

## Core suite

```sh
node tests/test_core.mjs
```

Checks: projection round trips; cursor-anchored zoom under rotation; antimeridian
camera fit; grouped history undo/redo; convex, concave, single-hole, and multi-hole
triangulation; all primitive GeoJSON round trips; nonfinite coordinate rejection;
latitude bounds; sanitized and bounded imported styles.

## Browser suite

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/test_browser.py
```

If `/usr/bin/chromium` is available it is used; otherwise Playwright uses its
installed Chromium. Override with `CHROMIUM_PATH` to select another executable.
Running as an ordinary user with Chromium's sandbox available is recommended.

The default creates in-memory pages and avoids reliance on live map services.
It writes desktop, editor, dark, and mobile screenshots and updates `results.json`.
The network fixtures cover response parsing and UI integration, not public-service
uptime, capacity, policy compliance, or real road-network correctness.

To test the desktop suite on a real served origin, first run `python3 serve.py`
in another terminal, then on macOS/Linux:

```sh
WAYLINE_URL=http://localhost:8080 WAYLINE_HEADLESS=0 python3 tests/test_browser.py
```

The test chooses the offline reference layer to keep rendering deterministic.
The phone-layout case remains in-memory. `WAYLINE_HEADLESS=0` enables a visible
browser, which can be useful when validating an installed hardware adapter.
A successful WebGPU-enabled browser run exercises that API path; hardware identity
and performance should still be checked separately. Do not equate software WebGPU
with hardware GPU validation.

## Manual WebGPU release gate

Serve on localhost or HTTPS and open in each supported target browser/OS. Confirm
that the renderer badge and `Wayline.getRenderer()` say `WebGPU`, and inspect any
fallback reason rather than hiding it. Check browser diagnostics for actual adapter
identity and driver. Exercise pan/zoom/rotation at several device-pixel ratios;
label shaping, atlas repacking, and font fallback; polygon holes; tile upload and
provider changes; document editing; dark mode; PNG export; and resizing.

Simulate device loss in a controlled development build and verify the Canvas
transition retains the document and interactions. Confirm captured PNG colors and
row alignment at viewport widths not divisible by 64 pixels. Stress-test atlas
capacity and ensure omitted-label diagnostics correspond to expected limits.

## Manual service/storage release gate

Test real CORS-enabled tiles with visible provider attribution and retained browser
referrer; request cancellation, offline failures, provider switches, and ordinary
HTTP caching. Test explicit geocoding, cache hits, retry/error messaging, and
multi-tab rate coordination. Validate actual OSRM driving alternatives and steps;
no route should silently become a fictitious road path.

On a normal origin, check autosave after reload, localStorage quota failures,
project backup/reload, imported holes, native file downloads, clipboard denial,
geolocation permission denial, and mobile browser safe-area behavior. Verify the
chosen providers permit your application's traffic before public deployment.

## Performance interpretation

The app's millisecond badge is CPU scene-build/submission work measured with
performance.now(), not GPU time, present latency, or an FPS benchmark. The checked-in
report is a single small reference-map observation. Establish budgets using
representative datasets, actual hardware, GPU timestamps where available, frame
traces, memory accounting, and percentile distributions before publishing claims.
