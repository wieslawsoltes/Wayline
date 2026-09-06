/** Wayline geometry and immutable document primitives. No runtime dependencies. */
export const TAU = Math.PI * 2;
export const EARTH_RADIUS = 6371008.8;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const clone = value => JSON.parse(JSON.stringify(value));
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function project([lng, lat]) {
    const phi = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
    return [(lng + 180) / 360, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2];
}
export function unproject([x, y]) { return [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI]; }
export function distance(a, b) {
    const rad = Math.PI / 180, p = a[1] * rad, q = b[1] * rad;
    const h = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}
export function pathDistance(points) { let d = 0; for (let i = 1; i < points.length; i++)
    d += distance(points[i - 1], points[i]); return d; }
export function sphericalArea(points) {
    let sum = 0;
    const r = Math.PI / 180;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        let dl = (b[0] - a[0]) * r;
        dl = (dl + Math.PI * 3) % TAU - Math.PI;
        sum += dl * (2 + Math.sin(a[1] * r) + Math.sin(b[1] * r));
    }
    const a = Math.abs(sum * EARTH_RADIUS * EARTH_RADIUS / 2), full = 4 * Math.PI * EARTH_RADIUS * EARTH_RADIUS;
    return Math.min(a, full - a);
}
export const formatDistance = d => d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
export const formatArea = a => a < 1e6 ? `${Math.round(a).toLocaleString()} m²` : `${(a / 1e6).toFixed(2)} km²`;
export function destination(center, meters, bearing) {
    const d = meters / EARTH_RADIUS, br = bearing * Math.PI / 180, p = center[1] * Math.PI / 180, l = center[0] * Math.PI / 180;
    const lat = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(br));
    return [(l + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(lat))) * 180 / Math.PI, lat * 180 / Math.PI];
}
export function circleRing(center, edge, count = 72) { const r = distance(center, edge); return Array.from({ length: count }, (_, i) => destination(center, r, i * 360 / count)); }
export function segmentDistance(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
export function inRing(p, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])
        inside = !inside;
} return inside; }
/** Scanline triangulation, even/odd fill: supports concave rings and polygon holes.
 * Planar non-self-intersecting GeoJSON rings are required. Horizontal bands split at every vertex. */
export function triangulateRings(rings) {
    const edges = [], ys = [];
    for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            ys.push(a[1]);
            if (Math.abs(a[1] - b[1]) > 1e-12)
                edges.push(a[1] < b[1] ? [a, b] : [b, a]);
        }
    ys.sort((a, b) => a - b);
    const levels = ys.filter((y, i) => !i || y - ys[i - 1] > 1e-10), result = [];
    const xAt = (e, y) => e[0][0] + (e[1][0] - e[0][0]) * (y - e[0][1]) / (e[1][1] - e[0][1]);
    for (let i = 1; i < levels.length; i++) {
        const y0 = levels[i - 1], y1 = levels[i], mid = (y0 + y1) / 2;
        const active = edges.filter(e => e[0][1] <= mid && e[1][1] >= mid).sort((a, b) => xAt(a, mid) - xAt(b, mid));
        for (let j = 0; j + 1 < active.length; j += 2) {
            const a = [xAt(active[j], y0), y0], b = [xAt(active[j + 1], y0), y0], c = [xAt(active[j + 1], y1), y1], d = [xAt(active[j], y1), y1];
            result.push(a, b, c, a, c, d);
        }
    }
    return result;
}
export class Camera {
    constructor(center = [-122.435, 37.785], zoom = 13.65) { this.center = project(center); this.zoom = zoom; this.bearing = 0; this.width = 100; this.height = 100; }
    get scale() { return 256 * 2 ** this.zoom; }
    setSize(w, h) { this.width = w; this.height = h; }
    screen(coord) { return this.worldToScreen(project(coord)); }
    worldToScreen(p) { let dx = p[0] - this.center[0]; dx -= Math.round(dx); const x = dx * this.scale, y = (p[1] - this.center[1]) * this.scale, c = Math.cos(this.bearing), s = Math.sin(this.bearing); return [this.width / 2 + x * c - y * s, this.height / 2 + x * s + y * c]; }
    screenWorld([x, y]) { const c = Math.cos(this.bearing), s = Math.sin(this.bearing), dx = x - this.width / 2, dy = y - this.height / 2; return [this.center[0] + (dx * c + dy * s) / this.scale, this.center[1] + (-dx * s + dy * c) / this.scale]; }
    coord(p) { const ll = unproject(this.screenWorld(p)); ll[0] = ((ll[0] + 180) % 360 + 360) % 360 - 180; return ll; }
    normalize() { this.center[0] = ((this.center[0] % 1) + 1) % 1; this.center[1] = clamp(this.center[1], 0, 1); }
    pan(dx, dy) { const c = Math.cos(this.bearing), s = Math.sin(this.bearing); this.center[0] -= (dx * c + dy * s) / this.scale; this.center[1] -= (-dx * s + dy * c) / this.scale; this.normalize(); }
    zoomAt(delta, point) { const a = this.screenWorld(point); this.zoom = clamp(this.zoom + delta, 2, 20); const b = this.screenWorld(point); this.center[0] += a[0] - b[0]; this.center[1] += a[1] - b[1]; this.normalize(); }
    fit(coords, padding = 100) { if (!coords.length)
        return; const points = coords.map(project); const xs = points.map(p => p[0]), ys = points.map(p => p[1]); let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 - x0 > .5) {
        const xx = xs.map(x => x < .5 ? x + 1 : x);
        x0 = Math.min(...xx);
        x1 = Math.max(...xx);
    } const y0 = Math.min(...ys), y1 = Math.max(...ys); this.center = [(x0 + x1) / 2, (y0 + y1) / 2]; this.zoom = clamp(Math.log2(Math.min(Math.max(50, this.width - padding * 2) / (256 * (x1 - x0 || 1e-5)), Math.max(50, this.height - padding * 2) / (256 * (y1 - y0 || 1e-5)))), 2, 18); this.bearing = 0; this.normalize(); }
}
export class History {
    constructor(state, onChange) { this.state = clone(state); this.past = []; this.future = []; this.onChange = onChange; this.limit = 80; this.group = null; }
    commit(fn, group = null) { if (!group || this.group !== group) {
        this.past.push(clone(this.state));
        if (this.past.length > this.limit)
            this.past.shift();
    } this.group = group; fn(this.state); this.future = []; this.onChange?.(this.state); }
    endGroup() { this.group = null; }
    undo() { if (!this.past.length)
        return false; this.future.push(clone(this.state)); this.state = this.past.pop(); this.group = null; this.onChange?.(this.state); return true; }
    redo() { if (!this.future.length)
        return false; this.past.push(clone(this.state)); this.state = this.future.pop(); this.group = null; this.onChange?.(this.state); return true; }
}
export const DEFAULT_STYLE = { stroke: '#2563eb', fill: '#4285f4', opacity: 0.22, width: 3, font: 'Inter, Arial, sans-serif', size: 18, weight: 600, italic: false, letterSpacing: 0, lineHeight: 1.25, align: 'center', color: '#194378', halo: '#ffffff', haloWidth: 3, rotation: 0 };
export function createFeature(type, coordinates, extra = {}) { return { id: uid(), type, coordinates: clone(coordinates), name: type === 'text' ? 'A little discovery' : `${type[0].toUpperCase() + type.slice(1)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, text: type === 'text' ? 'A little discovery' : '', visible: true, locked: false, style: { ...DEFAULT_STYLE }, ...extra }; }
export function featureRings(f) { if (f.type === 'circle')
    return [circleRing(f.coordinates[0], f.coordinates[1])]; if (f.type === 'rectangle') {
    const [a, b] = f.coordinates;
    return [[[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]];
} return [f.coordinates, ...(f.holes || [])]; }
export function toGeoJSON(features) { return { type: 'FeatureCollection', features: features.map(f => { let geometry; if (['pin', 'text'].includes(f.type))
        geometry = { type: 'Point', coordinates: f.coordinates[0] };
    else if (['line', 'measure'].includes(f.type))
        geometry = { type: 'LineString', coordinates: f.coordinates };
    else
        geometry = { type: 'Polygon', coordinates: featureRings(f).map(r => [...r, r[0]]) }; return { type: 'Feature', id: f.id, geometry, properties: { name: f.name, text: f.text, waylineType: f.type, style: f.style, visible: f.visible, locked: f.locked, ...(f.type === 'circle' ? { circleCenter: f.coordinates[0], circleEdge: f.coordinates[1] } : {}), ...(f.type === 'rectangle' ? { rectangleCorners: f.coordinates } : {}) } }; }) }; }
export function fromGeoJSON(input) {
    const entries = input?.type === 'FeatureCollection' ? input.features : input?.type === 'Feature' ? [input] : null;
    if (!Array.isArray(entries) || entries.length > 2000)
        throw new Error('Expected a GeoJSON FeatureCollection with at most 2,000 features.');
    let points = 0;
    const coord = c => { if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 85.05113)
        throw new Error('Invalid longitude/latitude coordinate.'); if (++points > 25000)
        throw new Error('This document exceeds the 25,000-vertex import limit.'); return [c[0], c[1]]; };
    const ring = r => { if (!Array.isArray(r) || r.length < 3 || r.length > 3000)
        throw new Error('Each polygon ring must contain 3–3,000 vertices.'); const p = r.map(coord); if (p.length > 3 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1])
        p.pop(); return p; };
    const safeStyle = s => { const o = { ...DEFAULT_STYLE }; if (!s || typeof s !== 'object')
        return o; for (const k of ['stroke', 'fill', 'color', 'halo'])
        if (/^#[0-9a-f]{6}$/i.test(s[k]))
            o[k] = s[k]; for (const [k, a, b] of [['opacity', 0, 1], ['width', 1, 30], ['size', 8, 96], ['weight', 100, 900], ['letterSpacing', -2, 12], ['lineHeight', .8, 3], ['haloWidth', 0, 12], ['rotation', -180, 180]])
        if (Number.isFinite(s[k]))
            o[k] = clamp(s[k], a, b); if (['left', 'center', 'right'].includes(s.align))
        o.align = s.align; if (typeof s.font === 'string' && s.font.length < 120)
        o.font = s.font.replace(/[<>;{}]/g, ''); o.italic = !!s.italic; return o; };
    const result = [];
    function add(g, p = {}) {
        if (!g)
            throw new Error('Missing geometry.');
        let type, c, holes = [];
        switch (g.type) {
            case 'Point':
                type = p.waylineType === 'text' ? 'text' : 'pin';
                c = [coord(g.coordinates)];
                break;
            case 'LineString':
                type = p.waylineType === 'measure' ? 'measure' : 'line';
                if (g.coordinates.length < 2)
                    throw new Error('A line needs at least two vertices.');
                c = g.coordinates.map(coord);
                break;
            case 'Polygon':
                type = 'polygon';
                if (!g.coordinates?.length)
                    throw new Error('A polygon needs a ring.');
                [c, ...holes] = g.coordinates.map(ring);
                if (p.waylineType === 'circle' && p.circleCenter && p.circleEdge) {
                    type = 'circle';
                    c = [coord(p.circleCenter), coord(p.circleEdge)];
                    holes = [];
                }
                else if (p.waylineType === 'rectangle' && p.rectangleCorners?.length === 2) {
                    type = 'rectangle';
                    c = p.rectangleCorners.map(coord);
                    holes = [];
                }
                break;
            case 'MultiPoint':
                g.coordinates.forEach(c => add({ type: 'Point', coordinates: c }, p));
                return;
            case 'MultiLineString':
                g.coordinates.forEach(c => add({ type: 'LineString', coordinates: c }, p));
                return;
            case 'MultiPolygon':
                g.coordinates.forEach(c => add({ type: 'Polygon', coordinates: c }, p));
                return;
            default: throw new Error(`Unsupported geometry: ${g.type}.`);
        }
        result.push(createFeature(type, c, { name: String(p.name || 'Imported feature').slice(0, 160), text: String(p.text || '').slice(0, 2000), style: safeStyle(p.style), visible: p.visible !== false, locked: !!p.locked, holes }));
        if (result.length > 2000)
            throw new Error('At most 2,000 features are supported.');
    }
    for (const e of entries) {
        if (e.type !== 'Feature')
            throw new Error('Invalid GeoJSON feature.');
        add(e.geometry, e.properties || {});
    }
    return result;
}
