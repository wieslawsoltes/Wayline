import { project, clamp, inRing } from './core.js';
import { rgba } from './engine.js';
/** Original, approximate San Francisco reference artwork. NOT an OSM extract.
 * Live OSM tiles are a distinct selectable layer with attribution and bounded requests. */
const LAND = [[-122.53, 37.70], [-122.514, 37.745], [-122.511, 37.771], [-122.514, 37.78], [-122.505, 37.791], [-122.492, 37.794], [-122.481, 37.809], [-122.468, 37.809], [-122.459, 37.806], [-122.449, 37.807], [-122.443, 37.808], [-122.432, 37.807], [-122.427, 37.81], [-122.419, 37.809], [-122.413, 37.810], [-122.405, 37.808], [-122.4, 37.808], [-122.399, 37.805], [-122.391, 37.797], [-122.387, 37.789], [-122.385, 37.779], [-122.38, 37.774], [-122.378, 37.762], [-122.379, 37.750], [-122.366, 37.741], [-122.357, 37.723], [-122.356, 37.70]];
const NORTH = [[-122.56, 37.87], [-122.46, 37.87], [-122.464, 37.848], [-122.478, 37.835], [-122.479, 37.826], [-122.49, 37.824], [-122.506, 37.831], [-122.53, 37.828], [-122.56, 37.827]];
const ISLAND = [[-122.424, 37.826], [-122.422, 37.829], [-122.418, 37.828], [-122.421, 37.824]];
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const PARKS = [
    { name: 'Golden Gate Park', at: [-122.481, 37.7693], ring: [[-122.51, 37.7718], [-122.455, 37.774], [-122.454, 37.7663], [-122.51, 37.7645]], size: 14 },
    { name: 'Presidio of\nSan Francisco', at: [-122.466, 37.7987], ring: [[-122.489, 37.791], [-122.472, 37.809], [-122.458, 37.805], [-122.447, 37.8], [-122.45, 37.787], [-122.484, 37.787]], size: 15 },
    { name: 'Lincoln Park', at: [-122.498, 37.783], ring: [[-122.511, 37.780], [-122.496, 37.789], [-122.491, 37.785], [-122.494, 37.779]], size: 11 },
    { name: 'Lafayette\nPark', at: [-122.4275, 37.7915], ring: rect(-122.4297, 37.79, .0046, .003), size: 10 },
    { name: 'Alta Plaza', at: [-122.438, 37.791], ring: rect(-122.44, 37.7898, .004, .0027), size: 10 },
    { name: 'Alamo\nSquare', at: [-122.4347, 37.7764], ring: rect(-122.437, 37.7749, .0044, .0028), size: 10 },
    { name: 'Dolores\nPark', at: [-122.426, 37.76], ring: rect(-122.428, 37.7585, .0042, .0032), size: 11 },
    { name: 'Fort Mason', at: [-122.431, 37.8055], ring: [[-122.436, 37.803], [-122.428, 37.802], [-122.426, 37.809], [-122.435, 37.807]], size: 11 },
    { name: 'Crissy Field', at: [-122.460, 37.805], ring: [[-122.468, 37.8035], [-122.455, 37.8025], [-122.448, 37.8055], [-122.46, 37.807]], size: 11 },
    { name: 'Buena Vista\nPark', at: [-122.442, 37.768], ring: [[-122.447, 37.766], [-122.444, 37.772], [-122.439, 37.771], [-122.437, 37.767]], size: 10 },
    { name: 'Mission Bay', at: [-122.391, 37.768], ring: rect(-122.394, 37.766, .005, .003), size: 10 }
];
const WATER = [{ ring: [[-122.482, 37.773], [-122.477, 37.772], [-122.476, 37.769], [-122.48, 37.7685], [-122.483, 37.7702]] }, { ring: rect(-122.475, 37.768, .002, .001) }];
const ROADS = [];
function road(coords, kind = 'local', name = '') {
    // Remove collinear sampling vertices once, before any frame is built.
    const reduced = [];
    for (const p of coords) {
        const a = reduced.at(-2), b = reduced.at(-1);
        if (a && Math.abs((b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0])) < 1e-13)
            reduced[reduced.length - 1] = p;
        else
            reduced.push(p);
    }
    ROADS.push({ coords: reduced, kind, name });
}
const skip = p => !inRing(p, LAND) || PARKS.some(k => inRing(p, k.ring));
function grid(x0, x1, y0, y1, dx, dy, slant = 0) {
    for (let x = x0; x <= x1; x += dx) {
        let points = [];
        for (let y = y0; y <= y1 + .0001; y += dy / 3) {
            const p = [x + slant * (y - y0), y];
            if (skip(p)) {
                if (points.length > 1)
                    road(points);
                points = [];
            }
            else
                points.push(p);
        }
        if (points.length > 1)
            road(points);
    }
    for (let y = y0; y <= y1; y += dy) {
        let points = [];
        for (let x = x0; x <= x1 + .0001; x += dx / 3) {
            const p = [x + slant * (y - y0), y];
            if (skip(p)) {
                if (points.length > 1)
                    road(points);
                points = [];
            }
            else
                points.push(p);
        }
        if (points.length > 1)
            road(points);
    }
}
grid(-122.510, -122.451, 37.740, 37.786, .0023, .0015, .03);
grid(-122.449, -122.403, 37.747, 37.806, .0021, .00135, -.06);
for (let i = 0; i < 13; i++) {
    const lng = -122.421 + i * .0025, lat = 37.77 + i * .0014;
    road([[lng, lat], [lng + .016, lat - .012]], 'local');
}
for (let i = 0; i < 11; i++) {
    const lng = -122.422 + i * .0016, lat = 37.769 - i * .0012;
    road([[lng, lat], [lng + .031, lat + .016]], 'local');
}
road([[-122.511, 37.780], [-122.465, 37.781], [-122.436, 37.782], [-122.417, 37.783], [-122.406, 37.787], [-122.399, 37.791]], 'major', 'Geary Boulevard');
road([[-122.5, 37.786], [-122.47, 37.787], [-122.453, 37.7876], [-122.431, 37.789], [-122.409, 37.792]], 'major', 'California Street');
road([[-122.422, 37.771], [-122.422, 37.785], [-122.424, 37.796], [-122.425, 37.804]], 'major', 'Van Ness Avenue');
road([[-122.443, 37.760], [-122.433, 37.765], [-122.421, 37.775], [-122.404, 37.787], [-122.394, 37.795]], 'major', 'Market Street');
road([[-122.476, 37.744], [-122.477, 37.76], [-122.477, 37.773], [-122.479, 37.786], [-122.477, 37.795], [-122.475, 37.802], [-122.478, 37.812], [-122.481, 37.822], [-122.489, 37.834]], 'highway', 'Highway 1');
road([[-122.478, 37.807], [-122.464, 37.8], [-122.447, 37.799], [-122.431, 37.799], [-122.424, 37.798]], 'highway', 'Lombard Street');
road([[-122.447, 37.8], [-122.436, 37.798], [-122.419, 37.797], [-122.407, 37.804]], 'major', 'Lombard Street');
road([[-122.412, 37.804], [-122.406, 37.796], [-122.402, 37.792]], 'major', 'Columbus Avenue');
road([[-122.391, 37.79], [-122.383, 37.799], [-122.370, 37.808], [-122.355, 37.819]], 'highway', 'Bay Bridge');
road([[-122.438, 37.746], [-122.43, 37.756], [-122.417, 37.768], [-122.407, 37.771], [-122.395, 37.776], [-122.391, 37.79]], 'highway', 'US 101');
road([[-122.464, 37.789], [-122.46, 37.796], [-122.466, 37.800], [-122.464, 37.805]], 'park', 'Presidio Boulevard');
road([[-122.507, 37.769], [-122.49, 37.770], [-122.48, 37.771], [-122.47, 37.77], [-122.456, 37.772]], 'park', 'John F. Kennedy Drive');
const NEIGHBORHOODS = [['MARINA DISTRICT', -122.437, 37.801], ['PACIFIC HEIGHTS', -122.437, 37.7937], ['RUSSIAN HILL', -122.419, 37.799], ['NORTH BEACH', -122.408, 37.799], ['CHINATOWN', -122.406, 37.794], ['NOB HILL', -122.415, 37.791], ['FINANCIAL\nDISTRICT', -122.4, 37.793], ['INNER RICHMOND', -122.470, 37.779], ['OUTER RICHMOND', -122.496, 37.778], ['JAPANTOWN', -122.430, 37.785], ['WESTERN ADDITION', -122.438, 37.781], ['HAIGHT-ASHBURY', -122.448, 37.771], ['COLE VALLEY', -122.451, 37.762], ['INNER SUNSET', -122.469, 37.761], ['SOMA', -122.408, 37.778], ['MISSION DISTRICT', -122.419, 37.761], ['THE CASTRO', -122.436, 37.759], ['CIVIC CENTER', -122.417, 37.779], ['PRESIDIO HEIGHTS', -122.455, 37.786]];
export function drawReferenceMap(frame, camera, dark = false) {
    frame.clear = dark ? '#243641' : '#c5e1ed';
    const land = rgba(dark ? '#252a31' : '#f4f3ef'), park = rgba(dark ? '#293e35' : '#c9dfba'), water = rgba(frame.clear);
    const screenRing = ring => ring.map(c => camera.screen(c));
    for (const ring of [LAND, NORTH, ISLAND])
        frame.polygon([screenRing(ring)], land, true);
    if (camera.zoom < 10)
        return;
    for (const p of PARKS)
        frame.polygon([screenRing(p.ring)], park, true);
    for (const p of WATER)
        frame.polygon([screenRing(p.ring)], water, true);
    const scale = clamp(2 ** (camera.zoom - 13), .3, 4), visible = [];
    for (const r of ROADS) {
        const points = r.coords.map(p => camera.screen(p));
        if (points.every(p => p[0] < -50) || points.every(p => p[0] > camera.width + 50) || points.every(p => p[1] < -50) || points.every(p => p[1] > camera.height + 50))
            continue;
        visible.push({ ...r, points });
    }
    for (const kind of ['local', 'park', 'major', 'highway']) {
        for (const r of visible.filter(r => r.kind === kind)) {
            const width = (kind === 'highway' ? 8 : kind === 'major' ? 6 : kind === 'park' ? 3.5 : 3.4) * scale;
            frame.path(r.points, rgba(dark ? '#373d45' : kind === 'highway' ? '#d8c69d' : '#deddd6'), width + 1.6, false, 0, true);
        }
        for (const r of visible.filter(r => r.kind === kind)) {
            const width = (kind === 'highway' ? 8 : kind === 'major' ? 6 : kind === 'park' ? 3.5 : 3.4) * scale;
            frame.path(r.points, rgba(dark ? (kind === 'highway' ? '#71624a' : '#454b52') : (kind === 'highway' ? '#ffebba' : '#ffffff')), width, false, 0, true);
        }
    }
}
export function referenceLabels(camera, dark = false) {
    const labels = [];
    const add = (text, coord, style = {}, priority = 0) => { const [x, y] = camera.screen(coord); if (x > -150 && x < camera.width + 150 && y > -50 && y < camera.height + 50)
        labels.push({ text, x, y, style: { size: 11, weight: 500, color: dark ? '#aebcce' : '#6a747c', halo: dark ? '#252a31' : '#f4f3ef', haloWidth: 2, ...style }, priority, collision: true }); };
    if (camera.zoom < 11) {
        add('SAN FRANCISCO', [-122.445, 37.78], { size: 18, letterSpacing: 3 }, 10);
        return labels;
    }
    for (const [name, lng, lat] of NEIGHBORHOODS)
        add(name, [lng, lat], { size: camera.zoom > 13.5 ? 11 : 10, letterSpacing: 1.1 }, 2);
    for (const p of PARKS)
        if (p.size > 11 || camera.zoom > 13.3)
            add(p.name, p.at, { size: p.size, color: dark ? '#96cba1' : '#537946', halo: dark ? '#293e35' : '#c9dfba', weight: 500 }, 5);
    add('San Francisco Bay', [-122.376, 37.811], { size: 16, italic: true, color: dark ? '#89b3cf' : '#6f9bab', halo: dark ? '#243641' : '#c5e1ed', letterSpacing: .4 }, 5);
    add('Golden Gate Bridge', [-122.478, 37.818], { size: 12, color: dark ? '#eac59f' : '#955b39', rotation: -76 }, 4);
    for (const r of ROADS.filter(r => r.name && r.kind === 'major')) {
        const i = Math.floor(r.coords.length / 2), a = camera.screen(r.coords[i - 1]), b = camera.screen(r.coords[i]);
        let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
        if (angle > 90)
            angle -= 180;
        if (angle < -90)
            angle += 180;
        add(r.name, r.coords[i], { size: 10, color: dark ? '#b1b7c2' : '#85888a', rotation: angle, haloWidth: 2 }, 1);
    }
    return labels;
}
export class TileManager {
    constructor(renderer, onChange, url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png') { this.renderer = renderer; this.onChange = onChange; this.url = url; this.cache = new Map(); this.queue = []; this.active = 0; this.maxActive = 6; this.nextSlot = 0; this.visible = new Set(); this.failed = 0; this.loaded = 0; this.enabled = false; this.generation = 0; }
    setURL(url) { this.generation++; for (const t of this.cache.values())
        t.bitmap?.close?.(); this.cache.clear(); this.renderer.tileSources.clear(); this.queue = []; this.nextSlot = 0; this.loaded = this.failed = 0; this.url = url; }
    update(camera, enabled, dark) {
        this.enabled = enabled;
        this.frame = [];
        if (!enabled || location.protocol === 'file:') {
            this.queue = [];
            return this.frame;
        }
        const z = clamp(Math.floor(camera.zoom), 2, 19), n = 2 ** z, s = 256 * 2 ** (camera.zoom - z);
        const corners = [[0, 0], [camera.width, 0], [0, camera.height], [camera.width, camera.height]].map(p => camera.screenWorld(p));
        const xs = corners.map(p => p[0] * n), ys = corners.map(p => p[1] * n);
        const req = [];
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(n - 1, Math.floor(Math.max(...ys))); y++)
            for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++) {
                const xx = ((x % n) + n) % n, key = `${z}/${xx}/${y}`, p = camera.worldToScreen([(x + .5) / n, (y + .5) / n]);
                req.push({ key, z, x: xx, y, s, screen: p, dist: Math.hypot(p[0] - camera.width / 2, p[1] - camera.height / 2) });
            }
        req.sort((a, b) => a.dist - b.dist);
        const needed = req.slice(0, 100);
        this.visible = new Set(needed.map(r => r.key));
        this.queue = this.queue.filter(t => this.visible.has(t.key));
        for (const r of needed) {
            let t = this.cache.get(r.key);
            if (!t) {
                t = { ...r, status: 'queued', last: performance.now(), generation: this.generation };
                this.cache.set(r.key, t);
                this.queue.push(t);
            }
            t.last = performance.now();
            if (t.status === 'ready')
                this.frame.push({ x: r.screen[0], y: r.screen[1], size: s, rotation: camera.bearing, slot: t.slot, dark });
            else {
                for (let pz = z - 1; pz >= Math.max(2, z - 3); pz--) {
                    const factor = 2 ** (z - pz), parent = this.cache.get(`${pz}/${Math.floor(r.x / factor)}/${Math.floor(r.y / factor)}`);
                    if (parent?.status === 'ready') {
                        parent.last = performance.now();
                        this.frame.push({ x: r.screen[0], y: r.screen[1], size: s, rotation: camera.bearing, slot: parent.slot, dark, uv: [(r.x % factor) / factor, (r.y % factor) / factor, 1 / factor, 1 / factor] });
                        break;
                    }
                }
            }
        }
        for (const [key, t] of this.cache)
            if (t.status === 'queued' && !this.visible.has(key))
                this.cache.delete(key);
        this.pump();
        return this.frame;
    }
    pump() { while (this.enabled && this.active < this.maxActive && this.queue.length) {
        const t = this.queue.shift();
        if (!this.visible.has(t.key) || t.status !== 'queued')
            continue;
        this.load(t);
    } }
    async load(t) {
        this.active++;
        t.status = 'loading';
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
        try {
            const url = this.url.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
            const response = await fetch(url, { signal: controller.signal, mode: 'cors', credentials: 'omit' });
            if (!response.ok)
                throw new Error(`Tiles returned HTTP ${response.status}.`);
            const bitmap = await createImageBitmap(await response.blob());
            if (t.generation !== this.generation) {
                bitmap.close();
                return;
            }
            if (bitmap.width !== 256 || bitmap.height !== 256) {
                bitmap.close();
                throw new Error('The tile provider must return 256 × 256 raster tiles.');
            }
            let slot;
            if (this.nextSlot < 128)
                slot = this.nextSlot++;
            else {
                const victim = [...this.cache.values()].filter(v => v.status === 'ready' && !this.visible.has(v.key)).sort((a, b) => a.last - b.last)[0];
                if (!victim) {
                    bitmap.close();
                    throw new Error('Tile cache is full.');
                }
                slot = victim.slot;
                victim.bitmap.close();
                this.cache.delete(victim.key);
            }
            t.slot = slot;
            t.bitmap = bitmap;
            this.renderer.uploadTile(slot, bitmap);
            t.status = 'ready';
            this.loaded++;
        }
        catch (e) {
            if (t.generation === this.generation) {
                t.status = 'error';
                t.error = e.message;
                this.failed++;
            }
        }
        finally {
            clearTimeout(timer);
            this.active--;
            this.onChange?.();
            this.pump();
        }
    }
    retry() { for (const [k, t] of this.cache)
        if (t.status === 'error')
            this.cache.delete(k); this.failed = 0; this.onChange?.(); }
}
