import { clamp, clone, uid, escapeHTML, project, unproject, distance, pathDistance, sphericalArea, formatDistance, formatArea, segmentDistance, inRing, Camera, History, DEFAULT_STYLE, createFeature, featureRings, toGeoJSON, fromGeoJSON } from './core.js';
import { icon } from './icons.js';
import { Frame, Renderer, rgba } from './engine.js';
import { drawReferenceMap, referenceLabels, TileManager } from './basemap.js';
import { PLACES, CITY_PRESETS, Services } from './services.js';
const esc = escapeHTML;
const $ = (s, root = document) => root.querySelector(s), $$ = (s, root = document) => [...root.querySelectorAll(s)];
const safeRead = (key, fallback) => { try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
}
catch {
    return fallback;
} };
const safeWrite = (key, value) => { try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
}
catch {
    return false;
} };
const BOOTSTRAP = { version: 1, name: 'My San Francisco map', features: [], saved: [], savedPlaces: [], recent: [] };
const config = { tileURL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tileAttribution: '© OpenStreetMap contributors', geocodeURL: 'https://nominatim.openstreetmap.org/search', routeURL: 'https://router.project-osrm.org/route/v1/driving', ...safeRead('wayline.providers', {}) };
let restored = safeRead('wayline.document', BOOTSTRAP);
try {
    if (restored !== BOOTSTRAP) {
        const features = fromGeoJSON(toGeoJSON(restored.features || []));
        restored = { ...BOOTSTRAP, ...restored, features };
    }
}
catch {
    restored = clone(BOOTSTRAP);
}
const ui = { panel: 'explore', category: null, selected: new Set(), tool: 'select', editing: false, draft: [], pointer: null, showLabels: true, showPlaces: true, snap: true, basemap: safeRead('wayline.basemap', ['http:', 'https:'].includes(location.protocol) ? 'live' : 'atlas'), dark: safeRead('wayline.theme', 'light') === 'dark', results: [], searchQuery: '', searching: false, searchSerial: 0, place: null, routes: [], routeIndex: 0, routeBusy: false, routeError: '', routeFrom: PLACES.find(p => p.id === 'ferry'), routeTo: PLACES[0], activeRouteSerial: 0, routeSteps: false, city: 'San Francisco', citySubtitle: 'California, United States', drag: null, location: null, lasso: null };
const camera = new Camera();
let currentView = safeRead('wayline.view', null);
if (currentView && Array.isArray(currentView.center) && currentView.center.length === 2 && currentView.center.every(Number.isFinite) && Number.isFinite(currentView.zoom)) {
    camera.center = currentView.center;
    camera.zoom = clamp(currentView.zoom, 2, 20);
    camera.bearing = Number.isFinite(currentView.bearing) ? currentView.bearing : 0;
    camera.normalize();
}
const fragment = location.hash.match(/map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+))?/);
if (fragment) {
    camera.zoom = clamp(+fragment[1], 2, 20);
    camera.center = project([+fragment[3], +fragment[2]]);
    camera.bearing = (+fragment[4] || 0) * Math.PI / 180;
    camera.normalize();
    if (distance(unproject(camera.center), CITY_PRESETS[0].coord) > 30000)
        ui.basemap = 'live';
}
const stage = $('#map-stage');
let dirty = false, renderer, tiles, drawnLabels = [], toastTimer, storageTimer, viewTimer, lastStats = 0, routeAnimation = 0, frameCounter = 0;
const services = new Services(config);
const history = new History(restored, onDocumentChanged);
function hydrate(root = document) { $$('[data-icon]', root).forEach(e => { e.innerHTML = icon(e.dataset.icon); }); }
function notice(message, error = false) { const t = $('#toast'); t.textContent = message; t.classList.toggle('error', error); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, error ? 6500 : 3700); $('#live-announcer').textContent = message; }
function onDocumentChanged() { clearTimeout(storageTimer); storageTimer = setTimeout(() => { const ok = safeWrite('wayline.document', history.state); if (!ok)
    notice('Browser storage is full or unavailable. Export a project to keep your work.', true); }, 180); const active = document.activeElement; const editingInput = active?.matches('input,textarea,select'); if (!editingInput) {
    if (ui.panel === 'maps' || ui.panel === 'saved')
        renderSidebar();
    if (ui.editing)
        renderInspector();
} updateUndo(); updateSavedCount(); invalidate(); }
function updateSavedCount() { const c = $('#saved-count'); c.textContent = history.state.saved.length; c.hidden = !history.state.saved.length; }
function selectedFeature() { return history.state.features.find(f => ui.selected.has(f.id)); }
function allPlaces() { const m = new Map([...PLACES, ...(history.state.savedPlaces || []), ...ui.results].map(p => [p.id, p])); if (ui.place)
    m.set(ui.place.id, ui.place); return [...m.values()]; }
function findPlace(id) { return allPlaces().find(p => p.id === id); }
function invalidate() { if (dirty || !renderer)
    return; dirty = true; requestAnimationFrame(() => { dirty = false; renderMap(); }); }
function saveView() { clearTimeout(viewTimer); viewTimer = setTimeout(() => safeWrite('wayline.view', { center: camera.center, zoom: camera.zoom, bearing: camera.bearing }), 500); }
function isOnscreen(p, pad = 40) { return p[0] > -pad && p[0] < camera.width + pad && p[1] > -pad && p[1] < camera.height + pad; }
function visiblePlaces() { let places = ui.panel === 'results' && ui.results.length ? ui.results : ui.category ? PLACES.filter(p => p.category === ui.category) : PLACES.filter(p => !p.sample && p.id !== 'golden-gate'); if (ui.place && !places.some(p => p.id === ui.place.id))
    places = [...places, ui.place]; return ui.showPlaces ? places : []; }
function drawPin(frame, coord, color, label, selected = false) { const p = camera.screen(coord); if (!isOnscreen(p, 150))
    return null; const x = p[0], y = p[1] - 10; frame.dot([x, y + 15], rgba('#405265', .12), 6); frame.polygon([[[x - 5, y + 5], [x + 5, y + 5], [x, y + 14]]], rgba(color)); if (selected)
    frame.dot([x, y], rgba('#4285f4', .15), 19); frame.dot([x, y], rgba('#ffffff'), 11); frame.dot([x, y], rgba(color), 8.5); frame.dot([x, y], rgba('#ffffff'), 2.3); return [x, y]; }
function drawFeature(frame, f, selected = false, draft = false) {
    if (f.visible === false)
        return;
    const s = { ...DEFAULT_STYLE, ...f.style }, stroke = rgba(s.stroke), coords = f.coordinates;
    if (!coords.length)
        return;
    const p = coords.map(c => camera.screen(c));
    if (f.type === 'pin') {
        drawPin(frame, coords[0], s.stroke, f.name, selected);
        if (f.text)
            frame.label(f.text, p[0][0], p[0][1] - 35, s, { featureId: f.id });
    }
    else if (f.type === 'text') {
        frame.label(f.text || f.name, p[0][0], p[0][1], s, { featureId: f.id });
        if (selected) {
            const cached = renderer.atlas.cache.get(renderer.atlas.key({ text: f.text || f.name, style: s }));
            const w = cached?.width || Math.min(350, (f.text || f.name).length * s.size * .55 + 12), h = cached?.height || s.size * 1.6;
            const r = s.rotation * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
            const box = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [p[0][0] + x * c - y * sn, p[0][1] + x * sn + y * c]);
            frame.path(box, rgba('#4285f4'), 1, true, 5);
        }
    }
    else if (['line', 'measure'].includes(f.type)) {
        if (selected)
            frame.path(p, rgba('#ffffff'), s.width + 5);
        frame.path(p, stroke, s.width, false, draft ? 8 : 0);
        if (f.type === 'measure' && coords.length > 1) {
            const mid = p[Math.floor((p.length - 1) / 2)], next = p[Math.ceil((p.length - 1) / 2)];
            frame.label(formatDistance(pathDistance(coords)), (mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2 - 16, { size: 13, weight: 700, color: s.stroke, halo: ui.dark ? '#202834' : '#ffffff', haloWidth: 4 });
        }
    }
    else if (coords.length >= 2) {
        const rings = featureRings(f).map(r => r.map(c => camera.screen(c)));
        frame.polygon(rings, rgba(s.fill, s.opacity));
        if (selected)
            for (const r of rings)
                frame.path(r, rgba('#ffffff'), s.width + 4, true);
        for (const r of rings)
            frame.path(r, stroke, s.width, true, draft ? 8 : 0);
    }
    if (selected && f.type !== 'text' && f.type !== 'pin') {
        [...p, ...(f.holes || []).flatMap(r => r.map(c => camera.screen(c)))].forEach(v => { frame.dot(v, rgba('#ffffff'), 5.5); frame.dot(v, rgba('#4285f4'), 3.2); });
    }
}
function filterLabels(labels) { const occupied = [], out = []; for (const l of labels.sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    const size = l.style?.size || 13, lines = l.text.split('\n'), w = Math.max(...lines.map(s => s.length)) * size * .52 + 8, h = lines.length * size * 1.3 + 8, box = [l.x - w / 2, l.y - h / 2, w, h];
    if (!l.collision || !occupied.some(b => box[0] < b[0] + b[2] + 7 && box[0] + box[2] > b[0] - 7 && box[1] < b[1] + b[3] + 5 && box[1] + box[3] > b[1] - 5)) {
        out.push(l);
        if (l.collision)
            occupied.push(box);
    }
} return out; }
function buildFrame(forceReference = false) {
    const frame = new Frame();
    const tileFrames = forceReference ? [] : tiles.update(camera, ui.basemap === 'live', ui.dark);
    const complete = tileFrames.length && tileFrames.length === tiles.visible.size && [...tiles.visible].every(k => tiles.cache.get(k)?.status === 'ready');
    if (!complete)
        drawReferenceMap(frame, camera, ui.dark);
    else
        frame.clear = ui.dark ? '#212b34' : '#edf0e8';
    frame.tiles = tileFrames;
    frame.attribution = tileFrames.length ? config.tileAttribution : 'Illustrative basemap · not for navigation';
    const labels = ui.showLabels && (forceReference || ui.basemap === 'atlas' || !tileFrames.length) ? referenceLabels(camera, ui.dark) : [];
    if (ui.routes.length) {
        for (let i = 0; i < ui.routes.length; i++) {
            if (i === ui.routeIndex)
                continue;
            frame.path(ui.routes[i].coordinates.map(c => camera.screen(c)), rgba(ui.dark ? '#8b9bb0' : '#9dafc2'), 6);
        }
        const route = ui.routes[ui.routeIndex], p = route.coordinates.map(c => camera.screen(c));
        frame.path(p, rgba('#ffffff'), 10);
        frame.path(p, rgba('#286ee9'), 6);
        if (p.length) {
            frame.dot(p[0], rgba('#ffffff'), 7);
            frame.dot(p[0], rgba('#286ee9'), 4);
            frame.dot(p.at(-1), rgba('#286ee9'), 7);
            frame.dot(p.at(-1), rgba('#ffffff'), 3);
        }
    }
    for (const f of history.state.features)
        drawFeature(frame, f, ui.selected.has(f.id));
    if (ui.draft.length) {
        let c = ui.draft;
        if (['line', 'polygon', 'measure'].includes(ui.tool) && ui.pointer)
            c = [...ui.draft, ui.pointer];
        drawFeature(frame, createFeature(ui.tool, c, { style: { ...DEFAULT_STYLE, stroke: ui.tool === 'measure' ? '#ce843c' : DEFAULT_STYLE.stroke, opacity: .12 } }), true, true);
    }
    if (ui.lasso) {
        const [a, b] = ui.lasso, r = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
        frame.polygon([r], rgba('#4285f4', .12));
        frame.path(r, rgba('#4285f4'), 1, true, 5);
    }
    const pois = [];
    for (const place of visiblePlaces()) {
        const point = drawPin(frame, place.coord, place.color || '#4285f4', place.name, ui.place?.id === place.id);
        if (!point)
            continue;
        pois.push({ place, point });
        if (ui.showLabels)
            labels.push({ text: place.name, x: point[0] + place.name.length * 2.7 + 17, y: point[1] - 1, style: { size: 11, weight: 600, color: ui.dark ? '#c0cde1' : place.color || '#557ba9', halo: ui.dark ? '#252a31' : '#ffffff', haloWidth: 2.5 }, priority: ui.place?.id === place.id ? 20 : 8, collision: true });
    }
    if (ui.location) {
        const p = camera.screen(ui.location);
        frame.dot(p, rgba('#4285f4', .13), 23);
        frame.dot(p, rgba('#ffffff'), 9);
        frame.dot(p, rgba('#4285f4'), 6);
    }
    frame.texts = [...filterLabels(labels), ...frame.texts];
    return { frame, pois };
}
function renderMap() {
    if (!renderer || !tiles)
        return;
    const frameStart = performance.now();
    const bounds = stage.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1)
        return;
    camera.setSize(bounds.width, bounds.height);
    renderer.resize(bounds.width, bounds.height);
    const { frame, pois } = buildFrame();
    renderer.render(frame);
    renderer.stats.frameCpu = performance.now() - frameStart;
    drawnLabels = renderer.lastLabels;
    const layer = $('#poi-layer');
    const keep = new Set();
    for (const { place, point } of pois) {
        keep.add(place.id);
        let button = $(`button[data-place-id="${CSS.escape(place.id)}"]`, layer);
        if (!button) {
            button = document.createElement('button');
            button.className = 'poi-hit';
            button.dataset.placeId = place.id;
            button.title = place.name + (place.sample ? ' (sample place)' : '');
            button.setAttribute('aria-label', `Open ${place.name}`);
            button.onclick = e => { e.stopPropagation(); showPlace(place); };
            layer.append(button);
        }
        button.style.transform = `translate(${point[0]}px,${point[1]}px)`;
    }
    $$('button', layer).forEach(b => { if (!keep.has(b.dataset.placeId))
        b.remove(); });
    layer.style.pointerEvents = ui.editing ? 'none' : '';
    $$('button', layer).forEach(b => b.style.pointerEvents = ui.editing ? 'none' : '');
    {
        $('#render-stat').textContent = `${renderer.stats.frameCpu.toFixed(1)} ms`;
        $('#engine-pill').title = `${renderer.backend} · ${renderer.stats.draws} draw batches · ${Math.round(renderer.stats.items).toLocaleString()} primitives · ${renderer.stats.labelsDropped} labels omitted by atlas budget · CPU preparation/submit time (not GPU time)`;
        lastStats = performance.now();
    }
    $('#compass-arrow').style.transform = `rotate(${camera.bearing * 180 / Math.PI}deg)`;
    const ll = unproject(camera.center), metersPerPixel = Math.cos(ll[1] * Math.PI / 180) * 40075016.686 / camera.scale;
    const ideal = 100 * metersPerPixel, pow = 10 ** Math.floor(Math.log10(ideal)), scaleMeters = [1, 2, 5, 10].map(x => x * pow).filter(x => x <= ideal).at(-1) || pow;
    $('#scale-label').textContent = formatDistance(scaleMeters);
    $('#scale-bar').style.width = `${scaleMeters / metersPerPixel}px`;
    const a = $('#attribution');
    if (ui.basemap === 'live' && frame.tiles.length)
        a.innerHTML = config.tileURL.includes('tile.openstreetmap.org') ? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' : esc(config.tileAttribution);
    else if (ui.basemap === 'live' && location.protocol === 'file:')
        a.textContent = 'Illustrative map · Live streets needs localhost or HTTPS';
    else if (ui.basemap === 'live' && tiles.failed)
        a.textContent = 'Tiles unavailable · illustrative map, not for navigation';
    else
        a.textContent = (ui.basemap === 'live' ? 'Loading live tiles · ' : '') + 'Illustrative basemap · not for navigation';
    frameCounter++;
    saveView();
}
const HERO_ART = `<svg class="hero-art" viewBox="0 0 700 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b8d1da"/><stop offset="1" stop-color="#e9d3b9"/></linearGradient><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#94b6c5"/><stop offset="1" stop-color="#698b9c"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h700v400H0z"/><circle cx="490" cy="93" r="40" fill="#f8dfaf" opacity=".7"/><path fill="#9aaa9c" d="m0 210 95-80 67 24 104-30 52 45 49-15 64 29 73-13 79 43 117-2v160H0z"/><path fill="url(#sea)" d="M0 229q175-23 349 3t351-5v173H0z"/><path fill="#6e826a" d="M0 325q79-104 160-73t155 148H0z"/><g stroke="#ad6852" fill="none"><path d="m18 265 640-64" stroke-width="10"/><path d="M191 78v231m-15-228v228M462 111v158m-10-156v157" stroke-width="8"/><path d="m173 83 23-2m-22 41 24-2m-22 54 21-2m254-62h14m-14 35h14m-14 35h14" stroke-width="6"/><path d="M18 261Q111 248 182 86q157 245 274 26 107 113 202 86" stroke-width="3"/><path d="M62 249v12m30-34v30m29-60v59m28-105v102m64-100v93m34-48v46m34-18v42m32-32v29m34-25v22m33-31v29m32-56v54m24-89v85m43-102v99m25-81v78m25-67v64m25-47v44m26-34v31m26-19v16m26-13v10" stroke-width="1.6"/></g><path fill="#405d55" d="M0 352q51-37 95-39l26-40 30 21 27 37 53 19 16 50H0z"/></svg>`;
function placeRow(p) { return `<button class="place-row" data-open-place="${esc(p.id)}"><span class="place-thumbnail ${p.category === 'Parks' ? 'green' : p.id === 'golden-gate' ? 'warm' : ''}">${icon(p.icon || 'pin', 22)}</span><span class="place-row-text"><span class="place-name">${esc(p.name)}</span><span class="place-meta" style="display:block">${esc(p.area || p.category)}${p.sample ? ' · Sample place' : ''}</span></span>${icon('chevron', 14)}</button>`; }
function panelTitle(title, back = true) { return `<div class="panel-topline">${back ? `<button class="icon-btn" data-action="explore" title="Back to explore" aria-label="Back to explore">${icon('back')}</button>` : ''}<h2>${esc(title)}</h2></div>`; }
function renderSidebar() {
    const content = $('#sidebar-content');
    let html = '';
    if (ui.panel === 'explore') {
        html = `<div class="explore-intro"><div class="eyebrow">EVERYDAY, SOMEWHERE NEW</div><h1>Your world.<br><span>A little closer.</span></h1><p>Find your next favorite place.<br>Or make a map that’s entirely your own.</p></div><button class="hero" data-action="city-home">${HERO_ART}<span class="hero-badge">${icon('spark', 12)} The city collection</span><div class="hero-caption"><div class="tiny-label">A NEW POINT OF VIEW</div><h2>Meet San Francisco</h2><p>Big icons. Little discoveries.</p></div><span class="hero-arrow">${icon('arrow', 15)}</span></button><div class="section-header"><h3>Around the city</h3><button class="text-button" data-action="browse-all">Explore all ${icon('arrow', 13)}</button></div>${[PLACES[0], PLACES[1], PLACES[2]].map(placeRow).join('')}<div class="map-maker-card"><span class="maker-icon">${icon('map', 19)}</span><div><h3>A map that’s yours</h3><p>Mark the places. Draw the journey.<br>Tell your story, one pin at a time.</p><button data-action="edit">Create your first map ${icon('arrow', 12)}</button></div></div><p class="sample-note">Curated sample places. Switch to Live streets in Layers for OpenStreetMap. This reference map is illustrative.</p>`;
    }
    else if (ui.panel === 'results') {
        html = panelTitle(ui.category || `Results for “${ui.searchQuery}”`) + `<p class="result-count">${ui.searching ? 'Searching OpenStreetMap…' : `${ui.results.length} ${ui.results.length === 1 ? 'place' : 'places'} · ${ui.results.some(p => p.source) ? 'OpenStreetMap search' : 'Curated sample collection'}`}</p>` + (ui.searching ? '<div class="loading-line"></div>' : '') + ui.results.map(placeRow).join('');
        if (!ui.results.length && !ui.searching)
            html += `<div class="empty-state"><div class="empty-icon">${icon('search', 26)}</div><h3>There’s more out there</h3><p>Try a city, an address, or coordinates.<br>Online search runs only when you ask.</p></div>`;
        if (!ui.results.some(p => p.source))
            html += `<div class="action-row"><button class="secondary-button full-width" data-action="online-search">${icon('globe', 17)} Search OpenStreetMap</button></div><p class="sample-note">Online searches are sent to your configured geocoding provider. Sample businesses are fictional and are labeled as such.</p>`;
    }
    else if (ui.panel === 'place' && ui.place) {
        const p = ui.place, saved = history.state.saved.includes(p.id);
        html = panelTitle('Place details') + `<div class="hero place-detail-hero">${HERO_ART}<div class="hero-caption"><div class="tiny-label">${esc(p.sample ? 'ILLUSTRATIVE PLACE' : p.source || 'THE CITY COLLECTION')}</div></div></div><h1 class="place-detail-title">${esc(p.name)}</h1><p class="place-detail-subtitle">${esc(p.subtitle || p.category)}</p><div class="place-actions"><button class="place-action primary" data-action="route-place"><span>${icon('route', 20)}</span>Directions</button><button class="place-action ${saved ? 'active' : ''}" data-action="save-place"><span>${icon(saved ? 'check' : 'bookmark', 19)}</span>${saved ? 'Saved' : 'Save'}</button><button class="place-action" data-action="pin-place"><span>${icon('pin', 19)}</span>Add to map</button><button class="place-action" data-action="share-place"><span>${icon('share', 18)}</span>Share</button></div><h3 style="font-size:14px;font-weight:600">A little about this place</h3><p class="place-detail-subtitle">${esc(p.description || p.subtitle)}</p><div class="tags">${(p.tags || [p.category]).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-info-row">${icon('pin')}<div>${esc(p.area || p.subtitle || 'Map location')}<small>${p.coord[1].toFixed(5)}, ${p.coord[0].toFixed(5)}</small></div></div><div class="detail-info-row">${icon('bookmark')}<div>Keep a little inspiration<small>Saved places stay in this browser. Export your project to take them with you.</small></div></div><p class="sample-note">${p.sample ? 'Fictional demonstration place. Not a real business.' : p.source ? 'Place metadata from OpenStreetMap.' : 'Curated example, not a live business listing.'} Live reviews, opening hours, bookings, and availability are not provided.</p>`;
    }
    else if (ui.panel === 'saved') {
        const saved = history.state.saved.map(findPlace).filter(Boolean);
        html = panelTitle('Your places', false) + `<p class="subtext">Good places are worth keeping.</p><button class="collection-card" data-action="starter-collection"><span class="collection-icon">${icon('map', 20)}</span><div><h3>A weekend in San Francisco</h3><p>3 landmarks · Starter collection</p></div>${icon('chevron', 15)}</button><div class="section-header"><h3>Saved places</h3><span class="result-count" style="margin:0">${saved.length}</span></div>` + (saved.length ? saved.map(placeRow).join('') : `<div class="empty-state"><div class="empty-icon">${icon('bookmark', 25)}</div><h3>Start your collection</h3><p>Open any place and tap Save.<br>Your next adventure starts with a pin.</p></div>`) + `<p class="sample-note">Stored locally in this browser. No account or cloud synchronization.</p>`;
    }
    else if (ui.panel === 'recent') {
        const recent = (history.state.recent || []).map(findPlace).filter(Boolean);
        html = panelTitle('Recently explored', false) + `<p class="subtext">Pick up where curiosity left you.</p>` + (recent.length ? `<div style="margin-top:18px">${recent.map(placeRow).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">${icon('clock', 25)}</div><h3>A fresh start</h3><p>The places you open appear here.<br>There’s a whole city to discover.</p></div>`);
    }
    else if (ui.panel === 'maps') {
        html = `<div class="panel-topline"><h2>My maps</h2><button class="icon-btn" data-action="export" title="Export your project" aria-label="Export your project">${icon('download', 18)}</button></div><div class="eyebrow">YOUR PERSONAL ATLAS</div><input class="project-title" id="project-name" value="${esc(history.state.name)}" maxlength="120" aria-label="Project name"><p class="project-meta"><span class="live-dot"></span>Local workspace <span>·</span> ${history.state.features.length} ${history.state.features.length === 1 ? 'feature' : 'features'}</p><div class="action-row"><button class="primary-button" data-action="edit">${icon('line', 16)} ${ui.editing ? 'Editing map' : 'Open editor'}</button><button class="secondary-button" data-action="import">${icon('upload', 16)} Import</button></div><div class="editor-hint">${icon('spark', 14)}<span style="display:block;margin-top:5px">A place, a route, a thought. Add a pin or draw right on the map. Every detail is yours to edit.</span></div><div class="section-header"><h3>Map layers</h3><button class="text-button" data-action="fit">Fit all ${icon('fit', 12)}</button></div><div class="feature-list">${history.state.features.length ? [...history.state.features].reverse().map(f => `<div class="feature-row ${ui.selected.has(f.id) ? 'selected' : ''} ${f.visible === false ? 'dim' : ''}" data-feature-id="${esc(f.id)}" role="button" tabindex="0" aria-label="Select ${esc(f.name)}">${icon(f.type === 'measure' ? 'ruler' : f.type, 16)}<span class="feature-row-name">${esc(f.name)}</span><button class="icon-btn" data-toggle-visible="${esc(f.id)}" title="Toggle visibility" aria-label="Toggle visibility of ${esc(f.name)}">${icon(f.visible === false ? 'eyeOff' : 'eye', 14)}</button><button class="icon-btn" data-toggle-lock="${esc(f.id)}" title="Toggle lock" aria-label="Toggle lock of ${esc(f.name)}">${icon(f.locked ? 'lock' : 'unlock', 14)}</button></div>`).join('') : `<p class="subtext">An empty canvas, in the best way.<br>Choose a tool to add your first feature.</p>`}</div><div class="action-row"><button class="secondary-button full-width" data-action="export">${icon('download', 16)} Export map & data</button></div><button class="text-button" data-action="load-sample">${icon('spark', 14)} Try a sample editable map</button><p class="sample-note">Edits live in this document, not in OpenStreetMap. Export regularly to keep a portable copy.</p>`;
    }
    else if (ui.panel === 'route') {
        html = renderRoutePanel();
    }
    content.innerHTML = html;
    hydrate(content);
    bindSidebar(content);
    $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === ui.panel || (ui.panel === 'place' || ui.panel === 'results' || ui.panel === 'route') && b.dataset.nav === 'explore'));
    updateSavedCount();
}
function bindSidebar(content) { $$('[data-open-place]', content).forEach(b => b.onclick = () => showPlace(findPlace(b.dataset.openPlace))); $$('[data-action]', content).forEach(b => b.onclick = () => action(b.dataset.action)); $$('[data-feature-id]', content).forEach(row => { const select = () => { ui.selected = new Set([row.dataset.featureId]); enableEditor(false); renderSidebar(); renderInspector(); const f = selectedFeature(); if (f?.coordinates.length) {
    const bounds = f.coordinates.map(c => camera.screen(c));
    if (bounds.every(p => !isOnscreen(p, 0)))
        camera.fit(f.coordinates, 150);
} invalidate(); }; row.onclick = e => { if (!e.target.closest('button'))
    select(); }; row.onkeydown = e => { if (e.key === 'Enter')
    select(); }; }); $$('[data-toggle-visible]', content).forEach(b => b.onclick = e => { e.stopPropagation(); history.commit(s => { const f = s.features.find(f => f.id === b.dataset.toggleVisible); f.visible = f.visible === false; }); renderSidebar(); }); $$('[data-toggle-lock]', content).forEach(b => b.onclick = e => { e.stopPropagation(); history.commit(s => { const f = s.features.find(f => f.id === b.dataset.toggleLock); f.locked = !f.locked; }); renderSidebar(); renderInspector(); }); const name = $('#project-name', content); if (name) {
    name.oninput = () => history.commit(s => s.name = name.value, 'project-name');
    name.onblur = () => { history.endGroup(); renderSidebar(); };
} bindRoutePanel(content); }
function setPanel(name) { ui.panel = name; $('#suggestions').hidden = true; renderSidebar(); if (matchMedia('(max-width:720px)').matches)
    document.body.classList.add('mobile-panel'); if (!ui.editing)
    ui.selected.clear(); invalidate(); }
function showPlace(place) { if (!place)
    return; ui.place = place; ui.panel = 'place'; history.state.recent = [place.id, ...(history.state.recent || []).filter(id => id !== place.id)].slice(0, 30); if (!PLACES.some(p => p.id === place.id) && !(history.state.savedPlaces || []).some(p => p.id === place.id))
    history.state.savedPlaces.push(clone(place)); onDocumentChanged(); setPanel('place'); flyTo(place.coord, Math.max(camera.zoom, 14)); }
function flyTo(coord, zoom) { cancelAnimationFrame(routeAnimation); const target = project(coord), from = [...camera.center], z0 = camera.zoom; let dx = target[0] - from[0]; dx -= Math.round(dx); const start = performance.now(), duration = matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 550; const step = now => { const t = duration ? clamp((now - start) / duration, 0, 1) : 1, e = 1 - (1 - t) ** 3; camera.center = [from[0] + dx * e, from[1] + (target[1] - from[1]) * e]; camera.zoom = z0 + (zoom - z0) * e; camera.normalize(); invalidate(); if (t < 1)
    routeAnimation = requestAnimationFrame(step); }; routeAnimation = requestAnimationFrame(step); }
function setCity(city) { ui.city = city.name; ui.citySubtitle = city.name === 'San Francisco' ? 'California, United States' : 'Live OpenStreetMap'; $('#view-city').textContent = ui.city; $('#view-subtitle').textContent = ui.citySubtitle; if (city.name !== 'San Francisco')
    setBasemap('live'); flyTo(city.coord, city.zoom); }
function category(name) { ui.category = name; ui.searchQuery = name; ui.results = PLACES.filter(p => !name || p.category === name); $('#search').value = name || ''; $$('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === name)); setPanel('results'); }
function action(name) { switch (name) {
    case 'explore':
        ui.category = null;
        ui.place = null;
        $$('[data-category]').forEach(b => b.classList.remove('active'));
        setPanel('explore');
        break;
    case 'city-home':
        setCity(CITY_PRESETS[0]);
        break;
    case 'browse-all':
        ui.category = null;
        ui.searchQuery = 'San Francisco';
        ui.results = PLACES.filter(p => !p.sample);
        setPanel('results');
        break;
    case 'edit':
        enableEditor();
        break;
    case 'fit':
        fitFeatures();
        break;
    case 'load-sample':
        loadSample();
        break;
    case 'import':
        $('#file-input').click();
        break;
    case 'export':
        exportDialog();
        break;
    case 'online-search':
        onlineSearch(ui.searchQuery || $('#search').value || 'San Francisco');
        break;
    case 'save-place':
        toggleSaved(ui.place);
        break;
    case 'route-place':
        ui.routeTo = ui.place;
        ui.routes = [];
        ui.routeError = '';
        setPanel('route');
        break;
    case 'pin-place': {
        const p = ui.place, f = createFeature('pin', [p.coord], { name: p.name, text: p.name });
        history.commit(s => s.features.push(f));
        ui.selected = new Set([f.id]);
        enableEditor();
        notice('Place added to your editable map.');
        break;
    }
    case 'share-place':
        copyText(`${location.href.split('#')[0]}#map=15/${ui.place.coord[1].toFixed(6)}/${ui.place.coord[0].toFixed(6)}/0`);
        break;
    case 'starter-collection':
        ui.category = null;
        ui.searchQuery = 'A weekend in San Francisco';
        ui.results = PLACES.slice(0, 3);
        setPanel('results');
        camera.fit(ui.results.map(p => p.coord), 110);
        invalidate();
        break;
} }
function toggleSaved(place) { if (!place)
    return; let added = false; history.commit(s => { if (s.saved.includes(place.id))
    s.saved = s.saved.filter(id => id !== place.id);
else {
    s.saved.push(place.id);
    added = true;
    if (!PLACES.some(p => p.id === place.id) && !s.savedPlaces.some(p => p.id === place.id))
        s.savedPlaces.push(clone(place));
} }); renderSidebar(); notice(added ? 'Added to your saved places.' : 'Removed from saved places.'); }
function parseCoordinates(text) { const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/); if (!m)
    return null; const lat = +m[1], lng = +m[2]; return Math.abs(lat) <= 85.05112878 && Math.abs(lng) <= 180 ? [lng, lat] : null; }
function coordinatePlace(coord) { return { id: 'coord-' + coord.join(','), name: 'Dropped pin', subtitle: `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`, description: 'A point selected on the map.', coord, icon: 'pin', color: '#4285f4', category: 'Coordinate', tags: ['Custom location'], area: 'Map coordinate' }; }
function localMatches(query) { const q = query.toLowerCase(); return [...CITY_PRESETS.map(c => ({ ...c, isCity: true, subtitle: 'City · live street map', icon: 'globe' })), ...PLACES].filter(p => (p.name + ' ' + p.category).toLowerCase().includes(q)).slice(0, 7); }
function searchSuggestions() { const q = $('#search').value.trim(), box = $('#suggestions'); if (q.length < 2) {
    box.hidden = true;
    return;
} const matches = localMatches(q); box.innerHTML = matches.map((p, i) => `<button data-suggestion="${i}">${icon(p.icon || 'pin', 17)}<span class="suggestion-text">${esc(p.name)}<span class="suggestion-sub" style="display:block">${esc(p.isCity ? 'City · live street map' : p.sample ? 'Illustrative sample place' : p.category)}</span></span></button>`).join('') + `<button data-online>${icon('globe', 17)}<span>Search OpenStreetMap for “${esc(q)}”</span></button>`; $$('[data-suggestion]', box).forEach(b => b.onclick = () => { const p = matches[+b.dataset.suggestion]; $('#search').value = p.name; box.hidden = true; if (p.isCity) {
    setCity(p);
    setPanel('explore');
}
else
    showPlace(p); }); $('[data-online]', box).onclick = () => onlineSearch(q); box.hidden = false; }
function submitSearch() { const q = $('#search').value.trim(); $('#suggestions').hidden = true; if (!q) {
    setPanel('explore');
    return;
} const coordinate = parseCoordinates(q); if (coordinate) {
    setBasemap('live');
    showPlace(coordinatePlace(coordinate));
    return;
} const city = CITY_PRESETS.find(c => c.name.toLowerCase() === q.toLowerCase()); if (city) {
    setCity(city);
    setPanel('explore');
    return;
} const exact = PLACES.find(p => p.name.toLowerCase() === q.toLowerCase()); if (exact) {
    showPlace(exact);
    return;
} const match = PLACES.filter(p => (p.name + ' ' + p.category).toLowerCase().includes(q.toLowerCase())); if (match.length) {
    ui.category = null;
    ui.results = match;
    ui.searchQuery = q;
    setPanel('results');
}
else
    onlineSearch(q); }
async function onlineSearch(query) { if (!query.trim())
    return; ui.searchQuery = query; ui.category = null; ui.searching = true; ui.results = []; const serial = ++ui.searchSerial; setPanel('results'); try {
    const results = await services.search(query);
    if (serial !== ui.searchSerial)
        return;
    ui.results = results;
    if (results.length) {
        setBasemap('live');
        camera.fit(results.map(r => r.coord), 100);
    }
    else
        notice('No places found. Try a more specific address.');
}
catch (e) {
    if (serial === ui.searchSerial)
        notice(`Online search unavailable. ${e.message}`, true);
}
finally {
    if (serial === ui.searchSerial) {
        ui.searching = false;
        if (ui.panel === 'results')
            renderSidebar();
        invalidate();
    }
} }
function renderRoutePanel() { const from = ui.routeFrom?.name || '', to = ui.routeTo?.name || ''; const r = ui.routes[ui.routeIndex]; return panelTitle('Directions') + `<div class="route-inputs"><div class="route-field"><span class="route-node"></span><input id="route-from" list="route-places" value="${esc(from)}" placeholder="Starting point or lat, lon" aria-label="Route starting point"></div><div class="route-field"><span class="route-node end"></span><input id="route-to" list="route-places" value="${esc(to)}" placeholder="Destination or lat, lon" aria-label="Route destination"></div><button id="route-swap" class="route-swap" title="Swap origin and destination" aria-label="Swap origin and destination">${icon('swap', 16)}</button><datalist id="route-places">${allPlaces().map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist></div><div class="mode-tabs"><button class="active" title="Driving with OSRM">${icon('car', 16)} Drive</button><button disabled title="Walking requires a separately configured walking routing profile">${icon('walk', 16)} Walk</button><button disabled title="Cycling requires a separately configured cycling routing profile">${icon('bike', 16)} Cycle</button></div><button id="get-route" class="primary-button full-width" ${ui.routeBusy ? 'disabled' : ''}>${icon('route', 16)} ${ui.routeBusy ? 'Finding a route…' : 'Get directions'}</button>${ui.routeBusy ? '<div class="loading-line"></div>' : ''}${ui.routeError ? `<div class="route-disclaimer" role="alert">${esc(ui.routeError)}</div><button id="direct-measure" class="secondary-button full-width">${icon('ruler', 16)} Measure direct distance instead</button>` : ''}${ui.routes.map((route, i) => `<button class="route-card ${ui.routeIndex === i ? 'selected' : ''}" data-route-index="${i}"><div><h3>${i === 0 ? 'Recommended route' : 'Alternative route'}</h3><small>${esc(route.summary || 'Driving · OpenStreetMap road network')}</small></div><span class="route-time">${Math.max(1, Math.round(route.duration / 60))} min<small>${formatDistance(route.distance)}</small></span></button>`).join('')}${r ? `<div class="action-row"><button id="route-to-map" class="secondary-button">${icon('plus', 15)} Add to my map</button><button id="toggle-steps" class="secondary-button">${icon('line', 15)} ${ui.routeSteps ? 'Hide' : 'Show'} steps</button></div>${ui.routeSteps ? `<ol class="steps-list">${r.steps.map((s, i) => `<li><span>${i + 1}</span><div>${esc(stepInstruction(s))}<small>${formatDistance(s.distance)}</small></div></li>`).join('')}</ol>` : ''}` : ''}<div class="route-disclaimer">Routes come from the configured OSRM driving service. Estimates do not include live traffic. This is a planning tool, not turn-by-turn navigation. Walking and cycling are unavailable with the default driving profile.</div><p class="sample-note">Right-click the map to set your starting point or destination. You can also enter an address or “latitude, longitude”.</p>`; }
function stepInstruction(s) { const m = s.maneuver || {}, street = s.name ? ` onto ${s.name}` : ''; if (m.type === 'depart')
    return `Start${s.name ? ' on ' + s.name : ''}`; if (m.type === 'arrive')
    return 'Arrive at your destination'; if (m.type === 'roundabout' || m.type === 'rotary')
    return `Enter the roundabout${m.exit ? ', take exit ' + m.exit : ''}${street}`; return `${m.type === 'new name' ? 'Continue' : (m.type || 'Continue').replace(/-/g, ' ')}${m.modifier ? ' ' + m.modifier : ''}${street}`.replace(/^./, c => c.toUpperCase()); }
function bindRoutePanel(root) { const swap = $('#route-swap', root); if (swap)
    swap.onclick = () => { [ui.routeFrom, ui.routeTo] = [ui.routeTo, ui.routeFrom]; ui.routes = []; ui.routeError = ''; renderSidebar(); invalidate(); }; const get = $('#get-route', root); if (get)
    get.onclick = getDirections; for (const id of ['route-from', 'route-to']) {
    const field = $('#' + id, root);
    if (field)
        field.onkeydown = e => { if (e.key === 'Enter')
            getDirections(); };
} $$('[data-route-index]', root).forEach(b => b.onclick = () => { ui.routeIndex = +b.dataset.routeIndex; renderSidebar(); invalidate(); }); const add = $('#route-to-map', root); if (add)
    add.onclick = () => { const r = ui.routes[ui.routeIndex], f = createFeature('line', r.coordinates, { name: `${ui.routeFrom.name} → ${ui.routeTo.name}`, style: { ...DEFAULT_STYLE, width: 5 } }); history.commit(s => s.features.push(f)); ui.routes = []; ui.selected = new Set([f.id]); enableEditor(); notice('Driving route copied into your editable map.'); }; const steps = $('#toggle-steps', root); if (steps)
    steps.onclick = () => { ui.routeSteps = !ui.routeSteps; renderSidebar(); }; const direct = $('#direct-measure', root); if (direct)
    direct.onclick = () => { const f = createFeature('measure', [ui.routeFrom.coord, ui.routeTo.coord], { name: 'Direct distance · not a road route', style: { ...DEFAULT_STYLE, stroke: '#cf873e' } }); history.commit(s => s.features.push(f)); ui.selected = new Set([f.id]); enableEditor(); camera.fit(f.coordinates, 120); notice('Added a straight-line measurement, not a navigable route.'); }; }
async function resolveEndpoint(text, existing) { const coord = parseCoordinates(text); if (coord)
    return coordinatePlace(coord); if (existing?.name === text)
    return existing; const known = allPlaces().find(p => p.name.toLowerCase() === text.toLowerCase()); if (known)
    return known; const city = CITY_PRESETS.find(p => p.name.toLowerCase() === text.toLowerCase()); if (city)
    return { ...city, id: uid(), category: 'City' }; const results = await services.search(text); if (!results.length)
    throw new Error(`Could not locate “${text}”.`); return results[0]; }
async function getDirections() { const from = $('#route-from')?.value.trim(), to = $('#route-to')?.value.trim(); if (!from || !to) {
    notice('Enter both a starting point and a destination.', true);
    return;
} const serial = ++ui.activeRouteSerial; ui.routeBusy = true; ui.routeError = ''; ui.routes = []; renderSidebar(); try {
    const a = await resolveEndpoint(from, ui.routeFrom), b = await resolveEndpoint(to, ui.routeTo);
    if (distance(a.coord, b.coord) < 2)
        throw new Error('Choose two different locations.');
    const routes = await services.route(a.coord, b.coord);
    if (serial !== ui.activeRouteSerial)
        return;
    ui.routeFrom = a;
    ui.routeTo = b;
    ui.routes = routes;
    ui.routeIndex = 0;
    setBasemap('live');
    camera.fit(routes[0].coordinates, 90);
    notice('Driving route ready. Estimates do not include live traffic.');
}
catch (e) {
    if (serial === ui.activeRouteSerial) {
        ui.routeError = `Road routing is currently unavailable. ${e.name === 'AbortError' ? 'The request timed out.' : e.message} No estimated line has been substituted for a real route.`;
        notice('Could not load a road route. Your map remains available.', true);
    }
}
finally {
    if (serial === ui.activeRouteSerial) {
        ui.routeBusy = false;
        if (ui.panel === 'route')
            renderSidebar();
        invalidate();
    }
} }
const TOOLS = [['select', 'select', 'Select / move', 'V'], ['pin', 'pin', 'Add a pin', 'P'], ['line', 'line', 'Draw a line', 'L'], ['polygon', 'polygon', 'Draw a polygon', 'G'], ['rectangle', 'rectangle', 'Draw a rectangle', 'R'], ['circle', 'circle', 'Draw a circle', 'C'], ['text', 'text', 'Add a label', 'T'], ['measure', 'ruler', 'Measure distance', 'M']];
function renderToolbar() { const bar = $('#editor-toolbar'); bar.innerHTML = TOOLS.map(([key, i, label, k]) => `<button class="tool-button ${ui.tool === key ? 'active' : ''}" data-tool="${key}" aria-label="${label} (${k})" aria-pressed="${ui.tool === key}" title="${label} (${k})">${icon(i, 18)}</button>`).join('') + `<span class="tool-separator"></span><button id="undo-button" class="tool-button" title="Undo (Ctrl/⌘ Z)" aria-label="Undo">${icon('undo', 18)}</button><button id="redo-button" class="tool-button" title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo">${icon('redo', 18)}</button>`; $$('[data-tool]', bar).forEach(b => b.onclick = () => setTool(b.dataset.tool)); $('#undo-button').onclick = undo; $('#redo-button').onclick = redo; updateUndo(); }
function updateUndo() { const u = $('#undo-button'), r = $('#redo-button'); if (u)
    u.disabled = !history.past.length; if (r)
    r.disabled = !history.future.length; }
function undo() { ui.draft = []; if (history.undo()) {
    ui.selected = new Set([...ui.selected].filter(id => history.state.features.some(f => f.id === id)));
    renderSidebar();
    renderInspector();
    updateToolTip();
}
else
    notice('Nothing to undo yet.'); }
function redo() { if (history.redo()) {
    renderSidebar();
    renderInspector();
}
else
    notice('Nothing to redo.'); }
function enableEditor(changePanel = true) { ui.editing = true; document.body.classList.add('editor-open'); $('#editor-toolbar').hidden = false; $('#inspector').hidden = false; $('#create-map').innerHTML = `${icon('check', 16)}<span>Done editing</span>`; if (changePanel)
    ui.panel = 'maps'; renderToolbar(); renderSidebar(); renderInspector(); updateToolTip(); if (matchMedia('(max-width:720px)').matches)
    document.body.classList.remove('mobile-panel'); invalidate(); }
function exitEditor() { ui.editing = false; ui.draft = []; ui.tool = 'select'; ui.selected.clear(); document.body.classList.remove('editor-open'); $('#editor-toolbar').hidden = true; $('#inspector').hidden = true; $('#map-tip').hidden = true; $('#create-map').innerHTML = `${icon('plus', 16)}<span>Create map</span>`; stage.classList.remove('drawing'); invalidate(); }
function setTool(tool) { if (!ui.editing)
    enableEditor(); ui.tool = tool; ui.draft = []; ui.pointer = null; if (tool !== 'select')
    ui.selected.clear(); renderToolbar(); renderInspector(); updateToolTip(); stage.classList.toggle('drawing', tool !== 'select'); stage.focus({ preventScroll: true }); invalidate(); }
function updateToolTip() { const tip = $('#map-tip'); if (!ui.editing) {
    tip.hidden = true;
    return;
} const instructions = { select: 'Select a feature to edit · Drag to move · Hold Space to pan', pin: 'Click the map to drop a pin', line: 'Click to add points · Enter or double-click to finish', polygon: 'Click to draw a boundary · Enter or double-click to finish', rectangle: 'Drag from one corner to the other', circle: 'Drag from the center to set a radius', text: 'Click to place a label · Edit its typography in the inspector', measure: 'Click to measure · Enter or double-click to finish' }; tip.innerHTML = esc(instructions[ui.tool]) + (ui.draft.length ? ' <kbd>Esc</kbd> to cancel' : ''); tip.hidden = false; }
function propField(label, key, value, { min, max, step = 1, type = 'number' } = {}) { return `<div class="field"><label>${esc(label)}</label><input data-style="${key}" aria-label="${esc(label)}" type="${type}" value="${esc(value)}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} step="${step}"></div>`; }
function colorField(label, key, value) { return `<div class="field"><label>${label}</label><div class="color-field"><input type="color" data-style="${key}" aria-label="${label}" value="${esc(value)}"><span>${esc(value.toUpperCase())}</span></div></div>`; }
function renderInspector() {
    const panel = $('#inspector');
    if (!ui.editing) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    const f = selectedFeature(), s = { ...DEFAULT_STYLE, ...f?.style }, count = ui.selected.size;
    let html = `<div class="inspector-header"><div><h3>${f ? (count > 1 ? `${count} features selected` : 'Feature properties') : 'Map studio'}</h3><small>${f ? `${esc(f.type)}${f.locked ? ' · Locked' : ''}` : 'Make the map your own'}</small></div><button id="close-editor" class="icon-btn" title="Finish editing" aria-label="Finish editing">${icon('close', 17)}</button></div>`;
    if (!f) {
        html += `<div class="inspector-empty"><div class="empty-icon">${icon('map', 23)}</div><h4>A little mark. A bigger story.</h4><p>Choose a tool, then create on the map. Select a feature to change its geometry, appearance, or typography.</p><div class="tool-help-grid">${[['pin', 'Drop a pin'], ['line', 'Draw a path'], ['polygon', 'Mark an area'], ['text', 'Add a label']].map(([t, label]) => `<button data-pick-tool="${t}">${icon(t, 18)}${label}</button>`).join('')}</div></div><div class="inspector-section"><div class="switch-row"><span>Snap to nearby vertices</span><button id="snap-toggle" class="switch ${ui.snap ? 'on' : ''}" aria-label="Toggle vertex snapping" aria-pressed="${ui.snap}"></button></div><p class="inspector-status">${history.state.features.length} features in this document<br>Ctrl/⌘ Z to undo · Shift-click to multiselect</p></div>`;
    }
    else if (f.locked) {
        html += `<div class="inspector-empty"><div class="empty-icon">${icon('lock', 23)}</div><h4>This layer is locked.</h4><p>Unlock it to edit geometry, move vertices, or change its appearance.</p><button id="unlock-feature" class="primary-button full-width" style="margin-top:17px">${icon('unlock', 16)} Unlock layer</button></div>`;
    }
    else {
        html += `<div class="inspector-section"><div class="field"><label>Layer name</label><input id="feature-name" aria-label="Layer name" maxlength="160" value="${esc(f.name)}"></div>${['text', 'pin'].includes(f.type) ? `<div class="field"><label>${f.type === 'text' ? 'Label text' : 'Pin label'}</label><textarea id="feature-text" aria-label="Label text" maxlength="2000" placeholder="Write something worth finding…">${esc(f.text || '')}</textarea></div>` : ''}</div>`;
        if (f.type === 'text' || f.type === 'pin' && f.text) {
            html += `<div class="inspector-section"><div class="inspector-section-title">Typography</div><div class="field"><label>Font family</label><select data-style="font" aria-label="Font family">${[['Inter, Arial, sans-serif', 'Inter / Sans serif'], ['-apple-system, BlinkMacSystemFont, sans-serif', 'System sans'], ['Georgia, serif', 'Georgia'], ['Times New Roman, serif', 'Times New Roman'], ['ui-monospace, SFMono-Regular, Consolas, monospace', 'Monospace'], ['Trebuchet MS, sans-serif', 'Trebuchet']].map(([v, t]) => `<option value="${esc(v)}" ${s.font === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="field-pair">${propField('Font size', 'size', s.size, { min: 8, max: 96 })}<div class="field"><label>Weight</label><select data-style="weight" aria-label="Font weight">${[300, 400, 500, 600, 700, 800, 900].map(w => `<option value="${w}" ${s.weight === w ? 'selected' : ''}>${{ 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[w]}</option>`).join('')}</select></div></div><div class="format-buttons"><button data-format="bold" title="Bold" aria-label="Bold" class="${s.weight >= 700 ? 'active' : ''}">${icon('bold', 15)}</button><button data-format="italic" title="Italic" aria-label="Italic" class="${s.italic ? 'active' : ''}">${icon('italic', 15)}</button><span class="tool-separator" style="height:25px"></span>${['left', 'center', 'right'].map(a => `<button data-align="${a}" title="Align ${a}" aria-label="Align ${a}" class="${s.align === a ? 'active' : ''}">${icon('align' + a[0].toUpperCase() + a.slice(1), 15)}</button>`).join('')}</div><div class="field-pair" style="margin-top:16px">${propField('Letter spacing', 'letterSpacing', s.letterSpacing, { min: -2, max: 12, step: .25 })}${propField('Line height', 'lineHeight', s.lineHeight, { min: .8, max: 3, step: .05 })}</div><div class="field-pair">${colorField('Text color', 'color', s.color)}${colorField('Text halo', 'halo', s.halo)}</div><div class="field-pair">${propField('Halo width', 'haloWidth', s.haloWidth, { min: 0, max: 12, step: .5 })}${propField('Rotation °', 'rotation', s.rotation, { min: -180, max: 180 })}</div></div>`;
        }
        if (f.type !== 'text') {
            html += `<div class="inspector-section"><div class="inspector-section-title">Appearance</div><div class="field-pair">${colorField(f.type === 'pin' ? 'Pin color' : 'Stroke', 'stroke', s.stroke)}${['polygon', 'rectangle', 'circle'].includes(f.type) ? colorField('Fill', 'fill', s.fill) : propField('Line width', 'width', s.width, { min: 1, max: 30 })}</div>${['polygon', 'rectangle', 'circle'].includes(f.type) ? `<div class="field-pair">${propField('Stroke width', 'width', s.width, { min: 1, max: 30 })}${propField('Fill opacity', 'opacity', s.opacity, { min: 0, max: 1, step: .05 })}</div>` : ''}</div>`;
        }
        const c = f.coordinates[0];
        html += `<div class="inspector-section"><div class="inspector-section-title">Geometry</div>${['text', 'pin'].includes(f.type) ? `<div class="field-pair"><div class="field"><label>Latitude</label><input id="feature-lat" type="number" step=".00001" min="-85.05112" max="85.05112" value="${c[1].toFixed(6)}" aria-label="Latitude"></div><div class="field"><label>Longitude</label><input id="feature-lng" type="number" step=".00001" min="-180" max="180" value="${c[0].toFixed(6)}" aria-label="Longitude"></div></div>` : `<p class="vertex-coord">${f.coordinates.length} control vertices${f.holes?.length ? ` · ${f.holes.length} holes` : ''}</p><p class="inspector-status">${['line', 'measure'].includes(f.type) ? formatDistance(pathDistance(f.coordinates)) : f.type === 'circle' ? `Radius ${formatDistance(distance(...f.coordinates))}` : formatArea(sphericalArea(featureRings(f)[0]) - featureRings(f).slice(1).reduce((a, r) => a + sphericalArea(r), 0))}<br>Drag a handle to reshape. Alt-click removes a vertex. Double-click an edge to insert one.</p>`}</div><div class="inspector-section"><div class="format-buttons"><button id="duplicate-feature" title="Duplicate (Ctrl/⌘ D)" aria-label="Duplicate feature">${icon('copy', 15)}</button><button id="lock-feature" title="Lock layer" aria-label="Lock layer">${icon('lock', 15)}</button><button id="bring-forward" title="Bring forward" aria-label="Bring layer forward">${icon('upload', 15)}</button><button id="send-backward" title="Send backward" aria-label="Send layer backward">${icon('download', 15)}</button><button id="delete-feature" title="Delete" aria-label="Delete feature" style="margin-left:auto;color:#cd6464">${icon('trash', 15)}</button></div><p class="inspector-status">${count > 1 ? 'Style changes apply to all unlocked selected features.' : 'Changes save automatically in this browser.'}</p></div>`;
    }
    panel.innerHTML = html;
    $('#close-editor').onclick = exitEditor;
    $$('[data-pick-tool]', panel).forEach(b => b.onclick = () => setTool(b.dataset.pickTool));
    const snap = $('#snap-toggle');
    if (snap)
        snap.onclick = () => { ui.snap = !ui.snap; renderInspector(); };
    const unlock = $('#unlock-feature');
    if (unlock)
        unlock.onclick = () => { history.commit(state => state.features.filter(x => ui.selected.has(x.id)).forEach(x => x.locked = false)); renderInspector(); };
    if (!f || f.locked)
        return;
    const bind = (selector, handler) => { const el = $(selector, panel); if (el)
        el.onclick = handler; };
    $('#feature-name').oninput = e => changeSelected(x => x.name = e.target.value, 'feature-name');
    const text = $('#feature-text');
    if (text)
        text.oninput = e => { const v = e.target.value; changeSelected(x => { if (['text', 'pin'].includes(x.type)) {
            x.text = v;
            if (x.type === 'text')
                x.name = v.split('\n')[0].slice(0, 120) || 'Text label';
        } }, 'feature-text'); };
    $$('[data-style]', panel).forEach(el => { const key = el.dataset.style; el.oninput = () => { let value = el.value; if (!['font', 'stroke', 'fill', 'color', 'halo', 'align'].includes(key)) {
        value = Number(value);
        if (!Number.isFinite(value))
            return;
        const limits = { size: [8, 96], width: [1, 30], opacity: [0, 1], letterSpacing: [-2, 12], lineHeight: [.8, 3], weight: [100, 900], haloWidth: [0, 12], rotation: [-180, 180] };
        if (limits[key])
            value = clamp(value, ...limits[key]);
    } changeSelected(x => x.style[key] = value, `style-${key}`); if (el.type === 'color')
        el.nextElementSibling.textContent = value.toUpperCase(); }; el.onchange = () => { history.endGroup(); if (el.tagName === 'SELECT')
        renderInspector(); }; });
    $$('[data-format]', panel).forEach(b => b.onclick = () => { changeSelected(x => { if (b.dataset.format === 'bold')
        x.style.weight = x.style.weight >= 700 ? 400 : 700;
    else
        x.style.italic = !x.style.italic; }); renderInspector(); });
    $$('[data-align]', panel).forEach(b => b.onclick = () => { changeSelected(x => x.style.align = b.dataset.align); renderInspector(); });
    for (const [selector, index, min, max] of [['#feature-lat', 1, -85.05112878, 85.05112878], ['#feature-lng', 0, -180, 180]]) {
        const el = $(selector, panel);
        if (el)
            el.onchange = () => { const v = Number(el.value); if (Number.isFinite(v)) {
                changeSelected(x => x.coordinates[0][index] = clamp(v, min, max));
                renderInspector();
            } };
    }
    bind('#duplicate-feature', duplicateSelection);
    bind('#delete-feature', deleteSelection);
    bind('#lock-feature', () => { changeSelected(x => x.locked = true); renderInspector(); });
    bind('#bring-forward', () => reorder(1));
    bind('#send-backward', () => reorder(-1));
    $$('input,textarea,select', panel).forEach(el => el.addEventListener('blur', () => history.endGroup()));
}
function changeSelected(fn, group = null) { history.commit(state => state.features.filter(f => ui.selected.has(f.id) && !f.locked).forEach(fn), group); }
function reorder(direction) { history.commit(state => { const ids = state.features.map(f => f.id).filter(id => ui.selected.has(id)); if (direction > 0)
    ids.reverse(); for (const id of ids) {
    const i = state.features.findIndex(f => f.id === id), j = i + direction;
    if (j >= 0 && j < state.features.length && !ui.selected.has(state.features[j].id))
        [state.features[i], state.features[j]] = [state.features[j], state.features[i]];
} }); renderSidebar(); }
function deleteSelection() { const ids = history.state.features.filter(f => ui.selected.has(f.id) && !f.locked).map(f => f.id); if (!ids.length)
    return; history.commit(s => s.features = s.features.filter(f => !ids.includes(f.id))); ui.selected.clear(); renderSidebar(); renderInspector(); notice(`Deleted ${ids.length === 1 ? 'feature' : ids.length + ' features'}. Undo is available.`); }
function translateFeature(f, dx, dy) { const move = c => camera.coord([camera.screen(c)[0] + dx, camera.screen(c)[1] + dy]); f.coordinates = f.coordinates.map(move); if (f.holes)
    f.holes = f.holes.map(r => r.map(move)); }
function duplicateSelection() { const copies = history.state.features.filter(f => ui.selected.has(f.id)).map(f => { const c = clone(f); c.id = uid(); c.name += ' copy'; c.locked = false; translateFeature(c, 20, 20); return c; }); if (!copies.length)
    return; history.commit(s => s.features.push(...copies)); ui.selected = new Set(copies.map(f => f.id)); renderSidebar(); renderInspector(); invalidate(); }
function fitFeatures() { const coords = history.state.features.filter(f => f.visible !== false).flatMap(f => f.coordinates); if (coords.length)
    camera.fit(coords, Math.min(camera.width, camera.height) * .2);
else
    setCity(CITY_PRESETS[0]); invalidate(); }
function loadSample() { const features = [createFeature('polygon', [[-122.469, 37.802], [-122.459, 37.8035], [-122.45, 37.801], [-122.451, 37.796], [-122.466, 37.796]], { name: 'An afternoon in the Presidio', style: { ...DEFAULT_STYLE, stroke: '#53926e', fill: '#6baa7c', opacity: .2 } }), createFeature('line', [[-122.4484, 37.8028], [-122.45, 37.8046], [-122.459, 37.806], [-122.468, 37.8068], [-122.475, 37.810]], { name: 'Waterfront sketch · not a routed path', style: { ...DEFAULT_STYLE, stroke: '#3275db', width: 4 } }), createFeature('pin', [[-122.4484, 37.8028]], { name: 'Meet here', text: 'Meet here', style: { ...DEFAULT_STYLE, stroke: '#df8261', color: '#a76045', size: 14 } }), createFeature('text', [[-122.453, 37.8117]], { name: 'Take the scenic route.', text: 'Take the scenic route.', style: { ...DEFAULT_STYLE, font: 'Georgia, serif', size: 26, italic: true, weight: 400, color: '#447487', halo: '#d6eaf1', haloWidth: 2 } }), createFeature('circle', [[-122.431, 37.797], [-122.4275, 37.797]], { name: 'A nearby neighborhood', style: { ...DEFAULT_STYLE, stroke: '#b089bc', fill: '#bd9bca', opacity: .15, width: 2 } })]; history.commit(s => s.features.push(...features)); ui.selected = new Set([features[3].id]); ui.basemap = 'atlas'; enableEditor(); camera.fit(features.flatMap(f => f.coordinates), 110); camera.zoom -= .3; invalidate(); notice('Sample features added. The blue path is an editable sketch, not a road route.'); }
function finishDraft() { let points = clone(ui.draft); if (points.length > 1 && distance(points.at(-1), points.at(-2)) < .3)
    points.pop(); const needed = ui.tool === 'polygon' ? 3 : 2; if (points.length < needed) {
    notice(`Add at least ${needed} points to finish.`);
    return;
} const f = createFeature(ui.tool, points, { style: { ...DEFAULT_STYLE, stroke: ui.tool === 'measure' ? '#c8843e' : DEFAULT_STYLE.stroke } }); history.commit(s => s.features.push(f)); ui.selected = new Set([f.id]); ui.draft = []; ui.pointer = null; ui.tool = 'select'; stage.classList.remove('drawing'); renderToolbar(); renderSidebar(); renderInspector(); updateToolTip(); invalidate(); }
function vertices(f) { return [{ ring: -1, coords: f.coordinates }, ...(f.holes || []).map((coords, ring) => ({ ring, coords }))].flatMap(r => r.coords.map((coord, index) => ({ coord, index, ring: r.ring, feature: f }))); }
function hitVertex(p) { for (const f of history.state.features.filter(f => ui.selected.has(f.id) && f.visible !== false && !f.locked && !['text', 'pin'].includes(f.type))) {
    for (const v of vertices(f)) {
        const q = camera.screen(v.coord);
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 9)
            return v;
    }
} return null; }
function hitFeature(p) {
    for (const f of [...history.state.features].reverse()) {
        if (f.visible === false)
            continue;
        const points = f.coordinates.map(c => camera.screen(c));
        if (f.type === 'text') {
            const label = drawnLabels.find(l => l.featureId === f.id);
            if (label) {
                const dx = p[0] - label.x, dy = p[1] - label.y, a = -(f.style.rotation || 0) * Math.PI / 180, x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
                if (Math.abs(x) < label.atlas.width / 2 + 5 && Math.abs(y) < label.atlas.height / 2 + 5)
                    return f;
            }
        }
        else if (f.type === 'pin') {
            if (Math.hypot(p[0] - points[0][0], p[1] - points[0][1] + 10) < 17)
                return f;
        }
        else if (['line', 'measure'].includes(f.type)) {
            for (let i = 1; i < points.length; i++)
                if (segmentDistance(p, points[i - 1], points[i]) < Math.max(7, f.style.width / 2 + 3))
                    return f;
        }
        else {
            const rings = featureRings(f).map(r => r.map(c => camera.screen(c)));
            if (inRing(p, rings[0]) && !rings.slice(1).some(r => inRing(p, r)))
                return f;
            for (const ring of rings)
                for (let i = 0; i < ring.length; i++)
                    if (segmentDistance(p, ring[i], ring[(i + 1) % ring.length]) < 7)
                        return f;
        }
    }
    return null;
}
function snapped(p, excludeId) { if (!ui.snap)
    return camera.coord(p); let closest = null, best = 10; for (const f of history.state.features) {
    if (f.visible === false || f.id === excludeId)
        continue;
    for (const v of vertices(f)) {
        const q = camera.screen(v.coord), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best) {
            best = d;
            closest = v.coord;
        }
    }
} return closest ? clone(closest) : camera.coord(p); }
let pointerMap = new Map(), gesture = null, spacePan = false, lastMotion = null, inertia = 0;
function pointFromEvent(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function stopMotion() { cancelAnimationFrame(inertia); cancelAnimationFrame(routeAnimation); }
function beginPinch() { if (pointerMap.size !== 2)
    return; const [a, b] = [...pointerMap.values()]; gesture = { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], distance: Math.hypot(a[0] - b[0], a[1] - b[1]), angle: Math.atan2(b[1] - a[1], b[0] - a[0]), zoom: camera.zoom, bearing: camera.bearing, center: [...camera.center] }; gesture.anchor = camera.screenWorld(gesture.mid); if (ui.drag?.original)
    history.state = ui.drag.original; ui.drag = null; ui.draft = []; }
function onPointerDown(e) {
    if (e.target.closest('button,input,select,textarea,.popover,.context-menu,.map-top,.editor-toolbar'))
        return;
    if (e.button === 2)
        return;
    stopMotion();
    $('#context-menu').hidden = true;
    $('#suggestions').hidden = true;
    const p = pointFromEvent(e);
    pointerMap.set(e.pointerId, p);
    stage.setPointerCapture(e.pointerId);
    stage.focus({ preventScroll: true });
    if (pointerMap.size === 2) {
        beginPinch();
        return;
    }
    if (pointerMap.size > 2)
        return;
    const pan = !ui.editing || ui.tool === 'select' && !hitFeature(p) || spacePan || e.button === 1;
    const v = ui.editing && !spacePan && ui.tool === 'select' ? hitVertex(p) : null;
    if (v && e.altKey) {
        const ring = v.ring < 0 ? v.feature.coordinates : v.feature.holes[v.ring], min = ['line', 'measure'].includes(v.feature.type) ? 2 : 3;
        if (!['rectangle', 'circle'].includes(v.feature.type) && ring.length > min) {
            history.commit(s => { const f = s.features.find(f => f.id === v.feature.id); (v.ring < 0 ? f.coordinates : f.holes[v.ring]).splice(v.index, 1); });
            renderInspector();
        }
        pointerMap.delete(e.pointerId);
        return;
    }
    const common = { start: p, last: p, moved: false, time: performance.now(), velocity: [0, 0] };
    if (spacePan || e.button === 1) {
        ui.drag = { ...common, type: 'pan' };
    }
    else if (ui.editing && ui.tool === 'select') {
        if (v)
            ui.drag = { ...common, type: 'vertex', vertex: v, original: clone(history.state) };
        else {
            const f = hitFeature(p);
            if (f) {
                if (e.shiftKey) {
                    ui.selected.has(f.id) ? ui.selected.delete(f.id) : ui.selected.add(f.id);
                }
                else if (!ui.selected.has(f.id))
                    ui.selected = new Set([f.id]);
                ui.drag = { ...common, type: f.locked ? 'locked' : 'move', original: clone(history.state) };
                renderSidebar();
                renderInspector();
            }
            else if (e.shiftKey) {
                ui.lasso = [p, p];
                ui.drag = { ...common, type: 'lasso' };
            }
            else {
                ui.selected.clear();
                ui.drag = { ...common, type: 'pan' };
                renderInspector();
                renderSidebar();
            }
        }
    }
    else if (ui.editing && ['rectangle', 'circle'].includes(ui.tool)) {
        ui.draft = [snapped(p), snapped(p)];
        ui.drag = { ...common, type: 'shape' };
    }
    else if (ui.editing)
        ui.drag = { ...common, type: 'draw' };
    else
        ui.drag = { ...common, type: 'pan' };
    if (ui.drag.type === 'pan')
        stage.classList.add('dragging');
    e.preventDefault();
    invalidate();
}
function onPointerMove(e) {
    const p = pointFromEvent(e);
    $('#coordinate-display').textContent = camera.coord(p).slice().reverse().map(v => v.toFixed(5)).join(', ');
    ui.pointer = snapped(p);
    if (pointerMap.has(e.pointerId))
        pointerMap.set(e.pointerId, p);
    if (gesture && pointerMap.size >= 2) {
        const [a, b] = [...pointerMap.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
        camera.center = [...gesture.center];
        camera.zoom = clamp(gesture.zoom + Math.log2(d / Math.max(1, gesture.distance)), 2, 20);
        camera.bearing = gesture.bearing + Math.atan2(b[1] - a[1], b[0] - a[0]) - gesture.angle;
        const world = camera.screenWorld(mid);
        camera.center[0] += gesture.anchor[0] - world[0];
        camera.center[1] += gesture.anchor[1] - world[1];
        camera.normalize();
        invalidate();
        return;
    }
    const drag = ui.drag;
    if (!drag) {
        if (ui.draft.length)
            invalidate();
        return;
    }
    const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > 3)
        drag.moved = true;
    if (drag.type === 'pan') {
        camera.pan(dx, dy);
        const dt = Math.max(8, performance.now() - drag.time);
        drag.velocity = [dx / dt * 16, dy / dt * 16];
        drag.time = performance.now();
    }
    else if (drag.type === 'shape') {
        ui.draft[1] = snapped(p);
    }
    else if (drag.type === 'vertex') {
        const f = history.state.features.find(f => f.id === drag.vertex.feature.id);
        (drag.vertex.ring < 0 ? f.coordinates : f.holes[drag.vertex.ring])[drag.vertex.index] = snapped(p, f.id);
    }
    else if (drag.type === 'move' && drag.moved) {
        const a = camera.screenWorld(drag.start), b = camera.screenWorld(p), delta = [b[0] - a[0], b[1] - a[1]];
        for (const f of history.state.features) {
            if (!ui.selected.has(f.id) || f.locked)
                continue;
            const orig = drag.original.features.find(x => x.id === f.id), move = c => { const w = project(c); const ll = unproject([w[0] + delta[0], w[1] + delta[1]]); ll[0] = ((ll[0] + 180) % 360 + 360) % 360 - 180; ll[1] = clamp(ll[1], -85.05112878, 85.05112878); return ll; };
            f.coordinates = orig.coordinates.map(move);
            if (orig.holes)
                f.holes = orig.holes.map(r => r.map(move));
        }
    }
    else if (drag.type === 'lasso')
        ui.lasso[1] = p;
    drag.last = p;
    invalidate();
}
function onPointerUp(e) {
    const p = pointFromEvent(e);
    pointerMap.delete(e.pointerId);
    if (gesture) {
        if (pointerMap.size < 2) {
            gesture = null;
            const remaining = [...pointerMap.values()][0];
            ui.drag = remaining ? { type: 'pan', start: remaining, last: remaining, moved: true, velocity: [0, 0], time: performance.now() } : null;
        }
        return;
    }
    const drag = ui.drag;
    ui.drag = null;
    stage.classList.remove('dragging');
    if (!drag)
        return;
    if (e.type === 'pointercancel') {
        if (drag.original)
            history.state = drag.original;
        ui.draft = [];
        ui.lasso = null;
        invalidate();
        return;
    }
    if (['move', 'vertex'].includes(drag.type) && drag.moved) {
        const features = clone(history.state.features);
        history.state = drag.original;
        history.commit(s => s.features = features);
        renderSidebar();
        renderInspector();
    }
    else if (['move', 'vertex'].includes(drag.type) && drag.original)
        history.state = drag.original;
    else if (drag.type === 'shape') {
        if (drag.moved) {
            const f = createFeature(ui.tool, ui.draft);
            history.commit(s => s.features.push(f));
            ui.selected = new Set([f.id]);
            setTool('select');
            renderSidebar();
            renderInspector();
        }
        else
            ui.draft = [];
    }
    else if (drag.type === 'draw' && !drag.moved) {
        const coord = snapped(p);
        if (['pin', 'text'].includes(ui.tool)) {
            const f = createFeature(ui.tool, [coord]);
            if (ui.tool === 'text')
                f.style.size = 22;
            history.commit(s => s.features.push(f));
            ui.selected = new Set([f.id]);
            const wasText = ui.tool === 'text';
            setTool('select');
            renderSidebar();
            renderInspector();
            if (wasText)
                requestAnimationFrame(() => { $('#feature-text')?.focus(); $('#feature-text')?.select(); });
        }
        else {
            ui.draft.push(coord);
            updateToolTip();
        }
    }
    else if (drag.type === 'lasso') {
        const a = drag.start, b = p, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        ui.selected = new Set(history.state.features.filter(f => f.visible !== false && f.coordinates.some(c => { const q = camera.screen(c); return q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1; })).map(f => f.id));
        ui.lasso = null;
        renderSidebar();
        renderInspector();
    }
    else if (drag.type === 'pan' && drag.moved && performance.now() - drag.time < 60 && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
        let [vx, vy] = drag.velocity;
        const step = () => { vx *= .91; vy *= .91; if (Math.hypot(vx, vy) < .2)
            return; camera.pan(vx, vy); invalidate(); inertia = requestAnimationFrame(step); };
        inertia = requestAnimationFrame(step);
    }
    invalidate();
}
function onDoubleClick(e) { if (e.target.closest('button,.popover,.context-menu'))
    return; e.preventDefault(); const p = pointFromEvent(e); if (ui.editing && ['line', 'polygon', 'measure'].includes(ui.tool)) {
    finishDraft();
    return;
} if (ui.editing && ui.tool === 'select') {
    for (const f of history.state.features.filter(f => ui.selected.has(f.id) && !f.locked && ['line', 'polygon', 'measure'].includes(f.type))) {
        const rings = [f.coordinates, ...(f.holes || [])];
        for (let r = 0; r < rings.length; r++) {
            const ring = rings[r], points = ring.map(c => camera.screen(c)), closed = f.type === 'polygon';
            for (let i = 0; i < points.length - (closed ? 0 : 1); i++)
                if (segmentDistance(p, points[i], points[(i + 1) % points.length]) < 10) {
                    history.commit(s => { const target = s.features.find(x => x.id === f.id); (r === 0 ? target.coordinates : target.holes[r - 1]).splice(i + 1, 0, camera.coord(p)); });
                    renderInspector();
                    invalidate();
                    return;
                }
        }
    }
    return;
} camera.zoomAt(1, p); invalidate(); }
function openContext(e) { if (e.target.closest('button,.popover'))
    return; e.preventDefault(); const p = pointFromEvent(e), coord = camera.coord(p), menu = $('#context-menu'); ui.contextCoord = coord; menu.innerHTML = `<div class="context-coord">${coord[1].toFixed(6)}, ${coord[0].toFixed(6)}</div><button data-context="from">${icon('route', 16)} Directions from here</button><button data-context="to">${icon('pin', 16)} Directions to here</button><hr><button data-context="pin">${icon('plus', 16)} Add a pin to my map</button><button data-context="text">${icon('text', 16)} Add a text label</button><button data-context="measure">${icon('ruler', 16)} Measure from here</button><button data-context="copy">${icon('copy', 16)} Copy coordinates</button>`; menu.style.left = `${clamp(p[0], 8, camera.width - 230)}px`; menu.style.top = `${clamp(p[1], 8, camera.height - 290)}px`; menu.hidden = false; $$('[data-context]', menu).forEach(b => b.onclick = () => { menu.hidden = true; switch (b.dataset.context) {
    case 'from':
        ui.routeFrom = coordinatePlace(coord);
        ui.routes = [];
        setPanel('route');
        break;
    case 'to':
        ui.routeTo = coordinatePlace(coord);
        ui.routes = [];
        setPanel('route');
        break;
    case 'pin':
    case 'text': {
        const f = createFeature(b.dataset.context, [coord]);
        history.commit(s => s.features.push(f));
        ui.selected = new Set([f.id]);
        enableEditor();
        break;
    }
    case 'measure':
        setTool('measure');
        ui.draft = [coord];
        updateToolTip();
        break;
    case 'copy':
        copyText(`${coord[1].toFixed(6)}, ${coord[0].toFixed(6)}`);
        break;
} invalidate(); }); }
function setBasemap(mode) { ui.basemap = mode; safeWrite('wayline.basemap', mode); if (mode === 'live' && location.protocol === 'file:')
    notice('Live streets needs a localhost or HTTPS server. The offline map and editor work here.'); if (!$('#layers-popover').hidden)
    renderLayers(); invalidate(); }
function renderLayers() { const p = $('#layers-popover'); p.innerHTML = `<div class="popover-title">Your kind of map<button id="close-layers" class="icon-btn" aria-label="Close layers">${icon('close', 17)}</button></div><div class="layer-options"><button data-basemap="atlas" class="layer-option ${ui.basemap === 'atlas' ? 'active' : ''}"><span class="layer-thumb"></span>Wayline reference</button><button data-basemap="live" class="layer-option ${ui.basemap === 'live' ? 'active' : ''}"><span class="layer-thumb live"></span>Live streets</button></div><div class="switch-row"><span>Places on the map</span><button id="places-toggle" class="switch ${ui.showPlaces ? 'on' : ''}" aria-label="Toggle places" aria-pressed="${ui.showPlaces}"></button></div><div class="switch-row"><span>Vector labels</span><button id="labels-toggle" class="switch ${ui.showLabels ? 'on' : ''}" aria-label="Toggle vector labels" aria-pressed="${ui.showLabels}"></button></div><p class="subtext">${ui.basemap === 'atlas' ? 'An original, illustrative San Francisco map rendered as vectors. It is approximate and is not for navigation.' : 'Live OpenStreetMap raster tiles. Only visible tiles are requested. Raster-embedded labels cannot be switched off.'}</p>${ui.basemap === 'live' && tiles.failed ? `<button id="retry-tiles" class="text-button" style="margin-top:10px">Retry unavailable tiles</button>` : ''}<button id="layer-settings" class="text-button" style="margin-top:13px">${icon('gear', 13)} Configure map providers</button>`; $('#close-layers').onclick = () => p.hidden = true; $$('[data-basemap]', p).forEach(b => b.onclick = () => setBasemap(b.dataset.basemap)); $('#places-toggle').onclick = () => { ui.showPlaces = !ui.showPlaces; renderLayers(); invalidate(); }; $('#labels-toggle').onclick = () => { ui.showLabels = !ui.showLabels; renderLayers(); invalidate(); }; $('#layer-settings').onclick = () => { p.hidden = true; settingsDialog(); }; const retry = $('#retry-tiles'); if (retry)
    retry.onclick = () => { tiles.retry(); renderLayers(); }; }
function toggleTheme() { ui.dark = !ui.dark; document.documentElement.dataset.theme = ui.dark ? 'dark' : 'light'; safeWrite('wayline.theme', ui.dark ? 'dark' : 'light'); $('#theme-toggle').innerHTML = icon(ui.dark ? 'sun' : 'moon'); invalidate(); }
function showModal(title, body) { const d = $('#modal'); $('#modal-content').innerHTML = `<div class="modal-header"><h2>${esc(title)}</h2><button id="close-modal" class="icon-btn" aria-label="Close dialog">${icon('close', 20)}</button></div><div class="modal-body">${body}</div>`; $('#close-modal').onclick = () => d.close(); if (!d.open)
    d.showModal(); return $('#modal-content'); }
function helpDialog() { const keys = [['Search', '/'], ['Map editor', 'E'], ['Select / move', 'V'], ['Pin / text', 'P / T'], ['Line / polygon', 'L / G'], ['Rectangle / circle', 'R / C'], ['Measure', 'M'], ['Finish a path', 'Enter'], ['Cancel / deselect', 'Esc'], ['Undo', '⌘/Ctrl Z'], ['Redo', '⌘/Ctrl Shift Z'], ['Duplicate', '⌘/Ctrl D'], ['Delete selection', 'Delete'], ['Pan with any tool', 'Space + drag'], ['Move precisely', 'Arrow keys'], ['Move 10 pixels', 'Shift + arrows']]; showModal('A world of possibilities', `<p><strong>Wayline</strong> is an independent map explorer and geographic editor, built in plain JavaScript. The familiar interface is inspired by Google Maps, but it does not use Google’s maps, data, or services.</p><h3>Make the map yours</h3><p>Draw pins, paths, polygons, rectangles, circles, and text. Select a feature to edit it. Shift-click to multiselect; Shift-drag to box-select. Drag handles to reshape. Double-click an edge to add a vertex; Alt-click a vertex to remove it. Hold Space to pan.</p><h3>Keyboard shortcuts</h3><div class="shortcuts">${keys.map(([a, b]) => `<div class="shortcut"><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div><h3>Rendering & data</h3><p>Renderer: <strong>${esc(renderer.backend)}</strong>. WebGPU draws batched map geometry, raster tiles, and browser-shaped text runs. Canvas 2D is the fallback. The timing pill reports measured CPU preparation/submission time, not GPU execution time or an FPS claim.</p><p>The offline San Francisco map is original, approximate reference artwork. Live streets use OpenStreetMap raster tiles; online search uses Nominatim; driving routes use OSRM. Public endpoints are demonstration services, not production infrastructure. Search runs on explicit submission, never server-side autocomplete.</p><h3>What stays local</h3><p>Your document, saved places, and view are stored in this browser. Search queries, tile coordinates, and route endpoints go to the providers you choose. There are no analytics, accounts, live traffic, business reviews, Street View, or cloud collaboration. Export regularly to keep a portable backup.</p><p><a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener">Tile policy</a> · <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noopener">Search policy</a> · <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a></p>`); }
function settingsDialog() { const root = showModal('Map providers', `<p>Choose your own infrastructure. The defaults are public demonstration services; for a production application, configure hosted or self-hosted providers.</p><div class="field"><label>Raster tiles · 256 × 256 XYZ URL</label><input id="provider-tiles" value="${esc(config.tileURL)}" spellcheck="false"></div><div class="field"><label>Tile attribution · visible on the map</label><input id="provider-attribution" value="${esc(config.tileAttribution)}"></div><div class="field"><label>Nominatim-compatible search endpoint</label><input id="provider-search" value="${esc(config.geocodeURL)}" spellcheck="false"></div><div class="field"><label>OSRM-compatible driving route endpoint</label><input id="provider-routes" value="${esc(config.routeURL)}" spellcheck="false"></div><div class="provider-warning">These values are stored in your browser and are visible to visitors. Do not enter server secrets. Provider authentication must support public client usage. HTTPS is required, except for localhost development.</div><button id="save-providers" class="primary-button full-width">${icon('check', 16)} Save providers</button><h3>Appearance</h3><button id="settings-theme" class="secondary-button full-width">${icon(ui.dark ? 'sun' : 'moon', 16)} Switch to ${ui.dark ? 'light' : 'dark'} mode</button>`); $('#settings-theme', root).onclick = () => { toggleTheme(); settingsDialog(); }; $('#save-providers', root).onclick = () => { try {
    const tile = $('#provider-tiles').value.trim(), search = $('#provider-search').value.trim(), route = $('#provider-routes').value.trim(), attribution = $('#provider-attribution').value.trim();
    for (const v of [tile, search, route]) {
        const u = new URL(v.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0'));
        if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
            throw new Error('Use HTTPS endpoints, or HTTP on localhost.');
        if (u.username || u.password)
            throw new Error('Do not put usernames or passwords in provider URLs.');
    }
    if (!['{z}', '{x}', '{y}'].every(t => tile.includes(t)))
        throw new Error('Tile URLs must contain {z}, {x}, and {y}.');
    if (!attribution)
        throw new Error('Enter the tile provider’s required attribution.');
    const changed = config.geocodeURL !== search;
    Object.assign(config, { tileURL: tile, tileAttribution: attribution, geocodeURL: search, routeURL: route });
    services.geocodeURL = search;
    services.routeURL = route;
    if (changed) {
        services.cache = {};
        safeWrite('wayline.search-cache', {});
    }
    tiles.setURL(tile);
    safeWrite('wayline.providers', config);
    $('#modal').close();
    notice('Map providers updated.');
    invalidate();
}
catch (e) {
    notice(e.message, true);
} }; }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function slugName() { return history.state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wayline-map'; }
function projectFile() { return { format: 'wayline-project', version: 1, document: clone(history.state), view: { center: [...camera.center], zoom: camera.zoom, bearing: camera.bearing }, settings: { basemap: ui.basemap, dark: ui.dark } }; }
function exportDialog() { const root = showModal('Take your map with you', `<p>Your work is yours. Export a portable project, interoperable GeoJSON, or a visual snapshot.</p><div class="field"><button class="secondary-button full-width" data-export="project">${icon('folder', 17)} Wayline project · JSON</button></div><div class="field"><button class="secondary-button full-width" data-export="geojson">${icon('globe', 17)} Geographic features · GeoJSON</button></div><div class="field"><button class="secondary-button full-width" data-export="png">${icon('camera', 17)} Current map view · PNG</button></div><div class="field"><button class="secondary-button full-width" data-export="svg">${icon('map', 17)} Reference map & annotations · SVG</button></div><p>Project files include features, saved places, and the camera view. GeoJSON retains Wayline styling and circle/rectangle metadata. SVG uses the illustrative vector reference layer, not live raster tiles. PNG includes visible map attribution.</p><button id="share-view" class="text-button">${icon('share', 15)} Copy a link to this map view</button>`); $$('[data-export]', root).forEach(b => b.onclick = async () => { try {
    const type = b.dataset.export;
    if (type === 'project')
        downloadBlob(new Blob([JSON.stringify(projectFile(), null, 2)], { type: 'application/json' }), slugName() + '.wayline.json');
    else if (type === 'geojson')
        downloadBlob(new Blob([JSON.stringify(toGeoJSON(history.state.features), null, 2)], { type: 'application/geo+json' }), slugName() + '.geojson');
    else if (type === 'png') {
        b.disabled = true;
        downloadBlob(await renderer.snapshot(), slugName() + '.png');
        b.disabled = false;
    }
    else
        downloadBlob(new Blob([exportSVG()], { type: 'image/svg+xml' }), slugName() + '.svg');
    notice('Export created.');
}
catch (e) {
    b.disabled = false;
    notice('Export failed: ' + e.message, true);
} }); $('#share-view').onclick = () => { const c = unproject(camera.center); copyText(`${location.href.split('#')[0]}#map=${camera.zoom.toFixed(2)}/${c[1].toFixed(6)}/${c[0].toFixed(6)}/${(camera.bearing * 180 / Math.PI).toFixed(2)}`); }; }
function exportSVG() {
    const { frame } = buildFrame(true), out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(camera.width)}" height="${Math.round(camera.height)}" viewBox="0 0 ${camera.width} ${camera.height}"><title>${esc(history.state.name)}</title><desc>Wayline illustrative reference map. Not for navigation.</desc><rect width="100%" height="100%" fill="${frame.clear}"/>`];
    const color = c => `rgb(${c.slice(0, 3).map(v => Math.round(v * 255)).join(',')})`;
    const tris = data => { for (let i = 0; i < data.length; i += 18)
        out.push(`<path d="M${data[i].toFixed(2)} ${data[i + 1].toFixed(2)}L${data[i + 6].toFixed(2)} ${data[i + 7].toFixed(2)}L${data[i + 12].toFixed(2)} ${data[i + 13].toFixed(2)}Z" fill="${color(data.slice(i + 2, i + 6))}" fill-opacity="${data[i + 5]}"/>`); };
    const lines = data => { for (let i = 0; i < data.length; i += 12) {
        const c = color(data.slice(i + 4, i + 8));
        if (Math.hypot(data[i] - data[i + 2], data[i + 1] - data[i + 3]) < .001)
            out.push(`<circle cx="${data[i]}" cy="${data[i + 1]}" r="${data[i + 8]}" fill="${c}" fill-opacity="${data[i + 7]}"/>`);
        else
            out.push(`<path d="M${data[i]} ${data[i + 1]}L${data[i + 2]} ${data[i + 3]}" stroke="${c}" stroke-opacity="${data[i + 7]}" stroke-width="${data[i + 8] * 2}" fill="none" stroke-linecap="round" ${data[i + 9] ? `stroke-dasharray="${data[i + 9] * .6} ${data[i + 9] * .4}"` : ''}/>`);
    } };
    tris(frame.baseTriangles);
    lines(frame.baseLines);
    tris(frame.triangles);
    lines(frame.lines);
    for (const t of frame.texts) {
        const s = { size: 13, font: 'Arial, sans-serif', weight: 500, color: '#465362', halo: '#ffffff', haloWidth: 2, lineHeight: 1.25, align: 'center', ...t.style }, a = renderer.atlas.add(t), h = a?.height || s.size * 1.5, w = a?.width || t.text.length * s.size * .5, pad = s.haloWidth + 4, x = s.align === 'left' ? -w / 2 + pad : s.align === 'right' ? w / 2 - pad : 0;
        out.push(`<g transform="translate(${t.x} ${t.y}) rotate(${s.rotation || 0})"><text font-family="${esc(s.font)}" font-size="${s.size}" font-weight="${s.weight}" font-style="${s.italic ? 'italic' : 'normal'}" text-anchor="${s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle'}" dominant-baseline="hanging" letter-spacing="${s.letterSpacing || 0}" fill="${s.color}" stroke="${s.halo}" stroke-width="${s.haloWidth * 2}" paint-order="stroke" stroke-linejoin="round">${t.text.split('\n').map((l, i) => `<tspan x="${x}" y="${-h / 2 + pad + i * s.size * s.lineHeight}">${esc(l)}</tspan>`).join('')}</text></g>`);
    }
    out.push(`<rect x="0" y="${camera.height - 24}" width="100%" height="24" fill="#fff" fill-opacity=".92"/><text x="10" y="${camera.height - 8}" font-size="11" font-family="Arial" fill="#334155">Wayline · Illustrative reference map · Not for navigation</text></svg>`);
    return out.join('');
}
async function copyText(text) { try {
    if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    notice('Copied to clipboard.');
}
catch {
    showModal('Copy this link or coordinate', `<p>Clipboard access is unavailable in this browser context. Select and copy the value below.</p><div class="field"><textarea id="copy-value" readonly aria-label="Text to copy">${esc(text)}</textarea></div>`);
    $('#copy-value').select();
} }
async function importFile(file) {
    if (!file)
        return;
    try {
        if (file.size > 5 * 1024 * 1024)
            throw new Error('Import files must be smaller than 5 MB.');
        const data = JSON.parse(await file.text());
        let features;
        if (data.format === 'wayline-project') {
            if (data.version !== 1)
                throw new Error('Unsupported Wayline project version.');
            if (!data.document || !Array.isArray(data.document.features))
                throw new Error('Invalid project document.');
            features = fromGeoJSON(toGeoJSON(data.document.features));
            const oldToNew = new Map(data.document.features.map((f, i) => [f.id, features[i]?.id]));
            history.commit(s => { s.name = String(data.document.name || 'Imported map').slice(0, 120); s.features = features; s.saved = (Array.isArray(data.document.saved) ? data.document.saved : []).filter(id => typeof id === 'string').slice(0, 500); s.savedPlaces = (Array.isArray(data.document.savedPlaces) ? data.document.savedPlaces : []).filter(p => p && Array.isArray(p.coord) && p.coord.length === 2 && p.coord.every(Number.isFinite) && Math.abs(p.coord[0]) <= 180 && Math.abs(p.coord[1]) <= 85.05112878).slice(0, 500).map(p => ({ id: String(p.id).slice(0, 160), name: String(p.name || 'Saved place').slice(0, 160), subtitle: String(p.subtitle || '').slice(0, 300), category: String(p.category || 'Place').slice(0, 80), coord: p.coord, description: String(p.description || '').slice(0, 2000), icon: 'pin', color: '#4285f4', source: 'Imported project', tags: [], area: String(p.area || '').slice(0, 160) })); s.recent = []; });
            if (data.view && Array.isArray(data.view.center) && data.view.center.length === 2 && data.view.center.every(Number.isFinite)) {
                camera.center = data.view.center;
                camera.zoom = clamp(Number(data.view.zoom) || 13, 2, 20);
                camera.bearing = Number.isFinite(data.view.bearing) ? data.view.bearing : 0;
                camera.normalize();
            }
            else
                camera.fit(features.flatMap(f => f.coordinates), 100);
        }
        else {
            features = fromGeoJSON(data);
            if (history.state.features.length + features.length > 2000)
                throw new Error('The combined document exceeds the 2,000-feature limit.');
            history.commit(s => s.features.push(...features));
            camera.fit(features.flatMap(f => f.coordinates), 100);
        }
        ui.selected = new Set(features.length ? [features.at(-1).id] : []);
        enableEditor();
        renderSidebar();
        renderInspector();
        invalidate();
        notice(`Imported ${features.length} features. You can undo this import.`);
    }
    catch (e) {
        notice(`Import failed: ${e.message}`, true);
    }
    finally {
        $('#file-input').value = '';
    }
}
function workspaceDialog() { const root = showModal('Your local Wayline', `<p>A personal workspace, without an account. Your map and collections are stored only in this browser.</p><div class="tool-help-grid">${[['explore', 'compass', 'Explore places'], ['saved', 'bookmark', 'Saved places'], ['maps', 'map', 'My maps'], ['recent', 'clock', 'Recently explored']].map(([page, i, label]) => `<button data-workspace-panel="${page}">${icon(i, 18)}${label}</button>`).join('')}</div><div class="action-row"><button id="workspace-theme" class="secondary-button">${icon(ui.dark ? 'sun' : 'moon', 16)} ${ui.dark ? 'Light' : 'Dark'} mode</button><button id="workspace-help" class="secondary-button">${icon('help', 16)} Help & shortcuts</button></div><p>${history.state.features.length} features · ${history.state.saved.length} saved places<br>No sign-in, analytics, or cloud synchronization.</p>`); $$('[data-workspace-panel]', root).forEach(b => b.onclick = () => { $('#modal').close(); setPanel(b.dataset.workspacePanel); }); $('#workspace-theme').onclick = () => { toggleTheme(); workspaceDialog(); }; $('#workspace-help').onclick = helpDialog; }
function bindUI() {
    hydrate();
    document.documentElement.dataset.theme = ui.dark ? 'dark' : 'light';
    $('#theme-toggle').innerHTML = icon(ui.dark ? 'sun' : 'moon');
    $('#search-form').onsubmit = e => { e.preventDefault(); submitSearch(); };
    $('#search').oninput = searchSuggestions;
    $('#search').onfocus = () => { if ($('#search').value.trim())
        searchSuggestions(); };
    $('#search').onkeydown = e => { if (e.key === 'Escape') {
        $('#suggestions').hidden = true;
        $('#search').blur();
    } if (e.key === 'ArrowDown') {
        const first = $('#suggestions button');
        if (first) {
            e.preventDefault();
            first.focus();
        }
    } };
    $('#directions-button').onclick = () => { if (ui.editing)
        exitEditor(); setPanel('route'); };
    $('#theme-toggle').onclick = toggleTheme;
    $('#help-button').onclick = helpDialog;
    $('#settings-button').onclick = settingsDialog;
    $('#profile-button').onclick = workspaceDialog;
    $('#brand').onclick = () => { if (matchMedia('(max-width:720px)').matches)
        workspaceDialog();
    else {
        exitEditor();
        ui.category = null;
        setPanel('explore');
        setCity(CITY_PRESETS[0]);
    } };
    $$('[data-nav]').forEach(b => b.onclick = () => { if (b.dataset.nav !== 'maps' && ui.editing)
        exitEditor(); setPanel(b.dataset.nav); });
    $$('[data-category]').forEach(b => b.onclick = () => category(ui.category === b.dataset.category ? null : b.dataset.category));
    $('#more-categories').onclick = () => action('browse-all');
    $('#create-map').onclick = () => ui.editing ? exitEditor() : enableEditor();
    $('#sidebar-toggle').onclick = () => { if (matchMedia('(max-width:720px)').matches)
        document.body.classList.toggle('mobile-panel');
    else
        document.body.classList.toggle('sidebar-collapsed'); invalidate(); };
    $('#layers-button').onclick = () => { const p = $('#layers-popover'); p.hidden = !p.hidden; if (!p.hidden)
        renderLayers(); };
    $('#zoom-in').onclick = () => { stopMotion(); camera.zoomAt(1, [camera.width / 2, camera.height / 2]); invalidate(); };
    $('#zoom-out').onclick = () => { stopMotion(); camera.zoomAt(-1, [camera.width / 2, camera.height / 2]); invalidate(); };
    $('#compass-button').onclick = () => { camera.bearing = 0; invalidate(); };
    $('#fit-button').onclick = fitFeatures;
    $('#locate-button').onclick = () => { if (!navigator.geolocation) {
        notice('Geolocation is unavailable in this browser.', true);
        return;
    } notice('Requesting your location…'); navigator.geolocation.getCurrentPosition(pos => { ui.location = [pos.coords.longitude, pos.coords.latitude]; ui.city = 'Your location'; ui.citySubtitle = 'Device location'; $('#view-city').textContent = ui.city; $('#view-subtitle').textContent = ui.citySubtitle; setBasemap('live'); flyTo(ui.location, 15); notice('Centered on your device location.'); }, err => notice(err.code === 1 ? 'Location access was denied. Search for a place instead.' : 'Your device location is currently unavailable.', true), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }); };
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('dblclick', onDoubleClick);
    stage.addEventListener('contextmenu', openContext);
    stage.addEventListener('wheel', e => { if (e.target.closest('.popover,.context-menu,.editor-toolbar,.map-top'))
        return; e.preventDefault(); stopMotion(); const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? camera.height : 1; camera.zoomAt(-e.deltaY * factor * (e.ctrlKey ? .005 : .002), pointFromEvent(e)); invalidate(); }, { passive: false });
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.searchbox,.suggestions'))
        $('#suggestions').hidden = true; if (!e.target.closest('#layers-popover,#layers-button'))
        $('#layers-popover').hidden = true; if (!e.target.closest('#context-menu'))
        $('#context-menu').hidden = true; });
    document.addEventListener('keydown', e => {
        const input = e.target.matches('input,textarea,select,[contenteditable=true]');
        if ($('#modal').open)
            return;
        if (input) {
            if (e.key === 'Escape') {
                e.target.blur();
                $('#suggestions').hidden = true;
            }
            return;
        }
        const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
        if (key === ' ') {
            spacePan = true;
            e.preventDefault();
            return;
        }
        if (mod && key === 'z') {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
            return;
        }
        if (mod && key === 'y') {
            e.preventDefault();
            redo();
            return;
        }
        if (mod && key === 'd' && ui.editing) {
            e.preventDefault();
            duplicateSelection();
            return;
        }
        if (mod && key === 's') {
            e.preventDefault();
            downloadBlob(new Blob([JSON.stringify(projectFile(), null, 2)], { type: 'application/json' }), slugName() + '.wayline.json');
            return;
        }
        if (mod && key === 'o') {
            e.preventDefault();
            $('#file-input').click();
            return;
        }
        if (key === '/') {
            e.preventDefault();
            $('#search').focus();
            return;
        }
        if (key === 'escape') {
            ui.draft = [];
            ui.selected.clear();
            ui.lasso = null;
            $('#context-menu').hidden = true;
            $('#layers-popover').hidden = true;
            if (ui.editing) {
                ui.tool = 'select';
                renderToolbar();
                renderInspector();
                renderSidebar();
                updateToolTip();
                stage.classList.remove('drawing');
            }
            invalidate();
            return;
        }
        if (key === 'e') {
            ui.editing ? exitEditor() : enableEditor();
            return;
        }
        if (ui.editing) {
            const tool = TOOLS.find(t => t[3].toLowerCase() === key);
            if (tool && !mod && !e.altKey) {
                e.preventDefault();
                setTool(tool[0]);
                return;
            }
            if (key === 'enter' && ui.draft.length) {
                e.preventDefault();
                finishDraft();
                return;
            }
            if (['delete', 'backspace'].includes(key)) {
                e.preventDefault();
                deleteSelection();
                return;
            }
            if (e.key.startsWith('Arrow') && ui.selected.size) {
                e.preventDefault();
                const d = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
                changeSelected(f => translateFeature(f, dx, dy), 'nudge');
                return;
            }
        }
        if (key === '+' || key === '=') {
            e.preventDefault();
            camera.zoomAt(1, [camera.width / 2, camera.height / 2]);
            invalidate();
        }
        if (key === '-') {
            e.preventDefault();
            camera.zoomAt(-1, [camera.width / 2, camera.height / 2]);
            invalidate();
        }
        if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            camera.pan(e.key === 'ArrowLeft' ? 80 : e.key === 'ArrowRight' ? -80 : 0, e.key === 'ArrowUp' ? 80 : e.key === 'ArrowDown' ? -80 : 0);
            invalidate();
        }
    });
    document.addEventListener('keyup', e => { if (e.code === 'Space')
        spacePan = false; if (e.key.startsWith('Arrow'))
        history.endGroup(); });
    window.addEventListener('blur', () => { spacePan = false; pointerMap.clear(); gesture = null; if (ui.drag?.original)
        history.state = ui.drag.original; ui.drag = null; stage.classList.remove('dragging'); });
    $('#file-input').onchange = e => importFile(e.target.files?.[0]);
    let dragDepth = 0;
    document.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        dragDepth++;
        document.body.classList.add('drop-active');
    } });
    document.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files'))
        e.preventDefault(); });
    document.addEventListener('dragleave', () => { if (--dragDepth <= 0) {
        dragDepth = 0;
        document.body.classList.remove('drop-active');
    } });
    document.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('drop-active'); if (e.dataTransfer?.files?.length)
        importFile(e.dataTransfer.files[0]); });
    $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) {
        const r = e.target.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            e.target.close();
    } });
    const observer = new ResizeObserver(() => invalidate());
    observer.observe(stage);
    window.addEventListener('beforeunload', () => safeWrite('wayline.document', history.state));
}
async function boot() {
    bindUI();
    renderSidebar();
    renderer = new Renderer($('#map-canvas'), backend => { $('#backend-label').textContent = backend; $('#engine-pill').classList.toggle('fallback', backend !== 'WebGPU'); if (tiles)
        invalidate(); });
    await renderer.init(new URLSearchParams(location.search).get('renderer') === 'canvas');
    tiles = new TileManager(renderer, () => { if (!$('#layers-popover').hidden)
        renderLayers(); invalidate(); }, config.tileURL);
    invalidate();
    window.Wayline = Object.freeze({ version: '1.0.0', getRenderer: () => ({ backend: renderer.backend, reason: renderer.fallbackReason || null, stats: { ...renderer.stats } }), getDocument: () => clone(history.state), getView: () => ({ center: unproject(camera.center), zoom: camera.zoom, bearing: camera.bearing, width: camera.width, height: camera.height }), getSelection: () => [...ui.selected], screen: coord => camera.screen(coord), coordinates: point => camera.coord(point), setView: (coord, zoom = 13) => { camera.center = project(coord); camera.zoom = clamp(zoom, 2, 20); camera.bearing = 0; camera.normalize(); invalidate(); }, exportGeoJSON: () => toGeoJSON(history.state.features), exportProject: projectFile, importGeoJSON: data => { const features = fromGeoJSON(data); if (history.state.features.length + features.length > 2000)
            throw new Error('The document exceeds the 2,000-feature limit.'); history.commit(s => s.features.push(...features)); invalidate(); return features.length; }, setBasemap, setTheme: theme => { if ((theme === 'dark') !== ui.dark)
            toggleTheme(); }, openEditor: enableEditor, closeEditor: exitEditor, setTool, undo, redo, geometry: Object.freeze({ project, unproject, distance, sphericalArea, fromGeoJSON, toGeoJSON, Camera, History }), ready: true });
    document.dispatchEvent(new CustomEvent('wayline:ready', { detail: { backend: renderer.backend } }));
}
boot().catch(error => { console.error(error); notice('Wayline could not start: ' + error.message, true); $('#backend-label').textContent = 'Startup error'; });
