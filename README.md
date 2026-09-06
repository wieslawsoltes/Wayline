# Wayline

An independent map explorer and geographic editor built with plain HTML, CSS, JavaScript, and a WebGPU-first rendering engine with a Canvas 2D fallback.

The complete source, tests, examples, and documentation are being imported from the app built in this conversation. The app includes personal map overlays, typography controls, GeoJSON/project import and export, an illustrative offline reference map, and configurable live map/search/routing adapters.

## Development

```sh
python3 build.py
python3 serve.py
```

Open http://localhost:8080. There are no runtime npm dependencies.

## Tests

```sh
node tests/test_core.mjs
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/test_browser.py
```

The 12 core checks and 19 deterministic browser checks passed locally before import. Browser checks exercised Canvas 2D and fixture-backed network adapters, not hardware WebGPU or live navigation.

## Publishing

The repository will include a GitHub Actions workflow that validates and packages the app for GitHub Pages. Intended site: https://wieslawsoltes.github.io/Wayline/.

This is independent software, not a Google product. Public map services have their own usage policies; the included illustrative offline map must not be used for navigation.
