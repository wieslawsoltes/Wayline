import { clamp, triangulateRings } from './core.js';
export function rgba(hex, alpha = 1) { const s = hex.replace('#', ''); return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255, alpha]; }
const cssColor = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
export class Frame {
    constructor() { this.baseTriangles = []; this.baseLines = []; this.triangles = []; this.lines = []; this.texts = []; this.tiles = []; this.attribution = 'Illustrative basemap · not for navigation'; this.clear = '#c7e2ed'; }
    line(a, b, color, width = 2, dash = 0, base = false) { if (!a || !b)
        return; const target = base ? this.baseLines : this.lines; target.push(...a, ...b, ...color, width / 2, dash, 0, 0); }
    path(points, color, width = 2, closed = false, dash = 0, base = false) { for (let i = 1; i < points.length; i++)
        this.line(points[i - 1], points[i], color, width, dash, base); if (closed && points.length > 2)
        this.line(points.at(-1), points[0], color, width, dash, base); }
    dot(p, color, r = 4, base = false) { this.line(p, p, color, r * 2, 0, base); }
    polygon(rings, color, base = false) { const data = base ? this.baseTriangles : this.triangles; for (const p of triangulateRings(rings))
        data.push(...p, ...color); }
    label(text, x, y, style = {}, extra = {}) { this.texts.push({ text: String(text), x, y, style, ...extra }); }
}
/** Browser-shaped whole-label atlas: native ligatures, Unicode shaping, multiline
 * alignment and IME editing are preserved; GPU receives cached textured runs. */
export class TextAtlas {
    constructor(size = 2048) { this.size = size; this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size; this.ctx = this.canvas.getContext('2d'); this.cache = new Map(); this.x = 2; this.y = 2; this.row = 0; this.dirty = true; this.scale = 2; }
    reset() { this.ctx.clearRect(0, 0, this.size, this.size); this.cache.clear(); this.x = this.y = 2; this.row = 0; this.dirty = true; }
    key(item) { return JSON.stringify([item.text, item.style]); }
    add(item) {
        const key = this.key(item);
        if (this.cache.has(key))
            return this.cache.get(key);
        const s = { size: 13, font: 'Arial, sans-serif', weight: 500, italic: false, letterSpacing: 0, lineHeight: 1.25, color: '#465362', halo: '#ffffff', haloWidth: 2, align: 'center', ...item.style };
        const ctx = this.ctx, scale = this.scale, lines = item.text.split('\n').slice(0, 40);
        ctx.font = `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px ${s.font}`;
        if ('letterSpacing' in ctx)
            ctx.letterSpacing = `${s.letterSpacing}px`;
        const pad = s.haloWidth + 4, width = Math.max(1, ...lines.map(l => ctx.measureText(l).width)) + pad * 2, height = lines.length * s.size * s.lineHeight + pad * 2;
        const factor = Math.min(scale, 1900 / width, 1800 / height), w = Math.ceil(width * factor), h = Math.ceil(height * factor);
        if (this.x + w + 2 > this.size) {
            this.x = 2;
            this.y += this.row + 2;
            this.row = 0;
        }
        if (this.y + h + 2 > this.size)
            return null;
        const x = this.x, y = this.y;
        this.x += w + 2;
        this.row = Math.max(this.row, h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.translate(x, y);
        ctx.scale(factor, factor);
        ctx.font = `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px ${s.font}`;
        if ('letterSpacing' in ctx)
            ctx.letterSpacing = `${s.letterSpacing}px`;
        ctx.textBaseline = 'top';
        ctx.textAlign = s.align;
        ctx.lineJoin = 'round';
        ctx.lineWidth = s.haloWidth * 2;
        ctx.strokeStyle = s.halo;
        ctx.fillStyle = s.color;
        const tx = s.align === 'left' ? pad : s.align === 'right' ? width - pad : width / 2;
        lines.forEach((text, i) => { const firstLetter = text.match(/\p{L}/u)?.[0] || ''; ctx.direction = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.test(firstLetter) ? 'rtl' : 'ltr'; const ty = pad + i * s.size * s.lineHeight; if (s.haloWidth)
            ctx.strokeText(text, tx, ty); ctx.fillText(text, tx, ty); });
        ctx.restore();
        const entry = { x, y, w, h, width, height };
        this.cache.set(key, entry);
        this.dirty = true;
        return entry;
    }
    prepare(items) { let results = items.map(i => this.add(i)); if (results.some(x => !x)) {
        this.reset();
        results = items.map(i => this.add(i));
    } return items.map((item, i) => ({ ...item, atlas: results[i] })).filter(i => i.atlas); }
}
const SHARED = `struct View { size: vec2f, pad: vec2f }; @group(0) @binding(0) var<uniform> view: View;
fn clip(p:vec2f)->vec4f{return vec4f(p.x/view.size.x*2.-1.,1.-p.y/view.size.y*2.,0.,1.);}
fn corner(i:u32)->vec2f {var p=array<vec2f,6>(vec2f(0.,0.),vec2f(1.,0.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,0.),vec2f(1.,1.));return p[i];}`;
const SOLID = SHARED + `
struct Out{@builtin(position) pos:vec4f,@location(0) color:vec4f};
@vertex fn vs(@location(0) p:vec2f,@location(1) color:vec4f)->Out{var o:Out;o.pos=clip(p);o.color=color;return o;}
@fragment fn fs(i:Out)->@location(0) vec4f{return vec4f(i.color.rgb*i.color.a,i.color.a);}`;
const LINE = SHARED + `
struct Out{@builtin(position) pos:vec4f,@location(0) local:vec2f,@location(1) @interpolate(flat) len:f32,@location(2) color:vec4f,@location(3) @interpolate(flat) params:vec4f};
@vertex fn vs(@builtin(vertex_index) i:u32,@location(0) ab:vec4f,@location(1) color:vec4f,@location(2) params:vec4f)->Out{
 let delta=ab.zw-ab.xy;let len=length(delta);let dir=select(vec2f(1.,0.),delta/max(len,.0001),len>.0001);let n=vec2f(-dir.y,dir.x);let r=params.x+1.5;let c=corner(i);let local=vec2f(c.x*(len+2.*r)-r,(c.y*2.-1.)*r);
 var o:Out;o.pos=clip(ab.xy+dir*local.x+n*local.y);o.local=local;o.len=len;o.color=color;o.params=params;return o;}
@fragment fn fs(i:Out)->@location(0) vec4f{let p=i.local;let d=length(vec2f(p.x-clamp(p.x,0.,i.len),p.y))-i.params.x;let aa=max(fwidth(d),.65);var a=1.-smoothstep(-aa,aa,d);if(i.params.y>0.&&p.x>=0.&&p.x<=i.len){let q=(p.x+i.params.z)/i.params.y;if(fract(q)>.6){a=0.;}}a*=i.color.a;return vec4f(i.color.rgb*a,a);}`;
function quadShader(array = false) {
    return SHARED + `
@group(0) @binding(1) var tex:${array ? 'texture_2d_array<f32>' : 'texture_2d<f32>'}; @group(0) @binding(2) var samp:sampler;
struct Out{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) @interpolate(flat) params:vec4f};
@vertex fn vs(@builtin(vertex_index) i:u32,@location(0) rect:vec4f,@location(1) uv:vec4f,@location(2) params:vec4f)->Out{let c=corner(i);let p=(c-.5)*rect.zw;let co=cos(params.x);let si=sin(params.x);var o:Out;o.pos=clip(rect.xy+vec2f(p.x*co-p.y*si,p.x*si+p.y*co));o.uv=uv.xy+c*uv.zw;o.params=params;return o;}
@fragment fn fs(i:Out)->@location(0) vec4f{var c=textureSample(tex,samp,i.uv${array ? ',i32(i.params.z)' : ''});if(i.params.w>.5){let l=dot(c.rgb,vec3f(.2126,.7152,.0722));c=vec4f(mix(vec3f(.22,.25,.3),vec3f(.09,.12,.16),l),c.a);}let a=c.a*i.params.y;return vec4f(c.rgb*a,a);}`;
}
const BLEND = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
export class Renderer {
    constructor(canvas, onStatus) { this.canvas = canvas; this.onStatus = onStatus; this.backend = 'Starting'; this.atlas = new TextAtlas(); this.buffers = new Map(); this.dpr = 1; this.stats = { cpu: 0, items: 0, draws: 0 }; this.device = null; this.tileSources = new Map(); }
    async init(forceCanvas = false) {
        try {
            if (forceCanvas || !navigator.gpu || !window.isSecureContext)
                throw new Error('WebGPU is unavailable in this browser or context.');
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter)
                throw new Error('No compatible GPU adapter.');
            this.device = await adapter.requestDevice();
            this.device.addEventListener('uncapturederror', e => { console.error('WebGPU validation:', e.error.message); this.onStatus?.('GPU validation error'); });
            this.context = this.canvas.getContext('webgpu');
            if (!this.context)
                throw new Error('No WebGPU canvas context.');
            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
            this.uniform = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            const pipeline = async (code, buffers) => { const m = this.device.createShaderModule({ code }); const info = await m.getCompilationInfo(); const errors = info.messages.filter(x => x.type === 'error'); if (errors.length)
                throw new Error(errors.map(e => e.message).join('\n')); return this.device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: this.format, blend: BLEND }] }, primitive: { topology: 'triangle-list' } }); };
            this.solid = await pipeline(SOLID, [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'float32x4' }] }]);
            const inst = [{ arrayStride: 48, stepMode: 'instance', attributes: [0, 1, 2].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }];
            [this.line, this.text, this.tile] = await Promise.all([pipeline(LINE, inst), pipeline(quadShader(false), inst), pipeline(quadShader(true), inst)]);
            this.groups = new Map();
            for (const p of [this.solid, this.line])
                this.groups.set(p, this.device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] }));
            this.textTexture = this.device.createTexture({ size: [this.atlas.size, this.atlas.size], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
            this.tileTexture = this.device.createTexture({ size: [256, 256, 128], dimension: '2d', format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
            const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
            for (const [p, t, array] of [[this.text, this.textTexture, false], [this.tile, this.tileTexture, true]])
                this.groups.set(p, this.device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: t.createView(array ? { dimension: '2d-array' } : {}) }, { binding: 2, resource: sampler }] }));
            this.device.lost.then(info => { if (info.reason !== 'destroyed') {
                this.fallback('GPU device lost; using Canvas');
                this.onStatus?.(this.backend);
            } });
            this.backend = 'WebGPU';
            this.onStatus?.('WebGPU');
        }
        catch (error) {
            console.info('Wayline renderer fallback:', error.message);
            this.fallback(error.message);
        }
        return this;
    }
    fallback(reason) { if (this.device) {
        this.device.destroy();
        this.device = null;
    } const replacement = document.createElement('canvas'); replacement.id = this.canvas.id; replacement.className = this.canvas.className; replacement.setAttribute('aria-label', this.canvas.getAttribute('aria-label') || 'Interactive map'); this.canvas.replaceWith(replacement); this.canvas = replacement; this.ctx = replacement.getContext('2d', { alpha: false }); this.backend = 'Canvas 2D'; this.fallbackReason = reason; this.onStatus?.(this.backend); }
    resize(w, h) { this.width = w; this.height = h; this.dpr = Math.min(devicePixelRatio || 1, 2); const pw = Math.max(1, Math.round(w * this.dpr)), ph = Math.max(1, Math.round(h * this.dpr)); if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
    } }
    uploadTile(slot, bitmap) { this.tileSources.set(slot, bitmap); if (this.device)
        this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: this.tileTexture, origin: [0, 0, slot] }, [256, 256]); }
    buffer(key, data) { const bytes = data.length * 4; if (!bytes)
        return null; let entry = this.buffers.get(key); if (!entry || entry.size < bytes) {
        entry?.buffer.destroy();
        const size = 2 ** Math.ceil(Math.log2(Math.max(256, bytes)));
        entry = { size, buffer: this.device.createBuffer({ size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }) };
        this.buffers.set(key, entry);
    } this.device.queue.writeBuffer(entry.buffer, 0, new Float32Array(data)); return entry.buffer; }
    render(frame) {
        const start = performance.now();
        const labels = this.atlas.prepare(frame.texts);
        this.stats.labelsDropped = frame.texts.length - labels.length;
        this.lastFrame = frame;
        this.lastLabels = labels;
        this.stats.draws = 0;
        if (this.device)
            this.renderGPU(frame, labels);
        else
            this.renderCanvas(frame, labels);
        this.stats.cpu = performance.now() - start;
        this.stats.items = frame.baseLines.length / 12 + frame.lines.length / 12 + frame.triangles.length / 18 + labels.length + frame.tiles.length;
        return this.stats;
    }
    renderGPU(f, labels, capture = null) {
        const d = this.device;
        d.queue.writeBuffer(this.uniform, 0, new Float32Array([this.width, this.height, 0, 0]));
        if (this.atlas.dirty) {
            d.queue.copyExternalImageToTexture({ source: this.atlas.canvas }, { texture: this.textTexture }, [this.atlas.size, this.atlas.size]);
            this.atlas.dirty = false;
        }
        const clear = rgba(f.clear), encoder = d.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: capture ? capture.texture.createView() : this.context.getCurrentTexture().createView(), clearValue: { r: clear[0], g: clear[1], b: clear[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
        const draw = (p, key, data, stride, inst = false) => { if (!data.length)
            return; pass.setPipeline(p); pass.setBindGroup(0, this.groups.get(p)); pass.setVertexBuffer(0, this.buffer(key, data)); if (inst)
            pass.draw(6, data.length / stride);
        else
            pass.draw(data.length / stride); this.stats.draws++; };
        draw(this.solid, 'base-fill', f.baseTriangles, 6);
        draw(this.line, 'base-lines', f.baseLines, 12, true);
        const tiles = [];
        for (const t of f.tiles)
            tiles.push(t.x, t.y, t.size + .35, t.size + .35, ...(t.uv || [0, 0, 1, 1]), t.rotation, 1, t.slot, t.dark ? 1 : 0);
        draw(this.tile, 'tiles', tiles, 12, true);
        draw(this.solid, 'over-fill', f.triangles, 6);
        draw(this.line, 'over-lines', f.lines, 12, true);
        const td = [];
        for (const t of labels) {
            const a = t.atlas;
            td.push(t.x, t.y, a.width, a.height, a.x / this.atlas.size, a.y / this.atlas.size, a.w / this.atlas.size, a.h / this.atlas.size, (t.style.rotation || 0) * Math.PI / 180, 1, 0, 0);
        }
        draw(this.text, 'text', td, 12, true);
        pass.end();
        if (capture)
            encoder.copyTextureToBuffer({ texture: capture.texture }, { buffer: capture.buffer, bytesPerRow: capture.bytesPerRow, rowsPerImage: this.canvas.height }, [this.canvas.width, this.canvas.height]);
        d.queue.submit([encoder.finish()]);
    }
    renderCanvas(f, labels) {
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = f.clear;
        ctx.fillRect(0, 0, this.width, this.height);
        const tris = data => { let last = ''; for (let i = 0; i < data.length; i += 18) {
            const c = cssColor(data.slice(i + 2, i + 6));
            if (c !== last) {
                if (last)
                    ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = c;
                last = c;
            }
            ctx.moveTo(data[i], data[i + 1]);
            ctx.lineTo(data[i + 6], data[i + 7]);
            ctx.lineTo(data[i + 12], data[i + 13]);
            ctx.closePath();
        } if (last)
            ctx.fill(); if (data.length)
            this.stats.draws++; };
        const lines = data => { ctx.lineCap = ctx.lineJoin = 'round'; let key = ''; for (let i = 0; i < data.length; i += 12) {
            const color = cssColor(data.slice(i + 4, i + 8)), width = data[i + 8] * 2, dash = data[i + 9], k = color + ':' + width + ':' + dash;
            if (k !== key) {
                if (key)
                    ctx.stroke();
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.setLineDash(dash ? [dash * .6, dash * .4] : []);
                key = k;
            }
            ctx.moveTo(data[i], data[i + 1]);
            ctx.lineTo(data[i + 2] + (data[i] === data[i + 2] && data[i + 1] === data[i + 3] ? .001 : 0), data[i + 3]);
        } if (key)
            ctx.stroke(); ctx.setLineDash([]); if (data.length)
            this.stats.draws++; };
        tris(f.baseTriangles);
        lines(f.baseLines);
        for (const t of f.tiles) {
            const bitmap = this.tileSources.get(t.slot);
            if (!bitmap)
                continue;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(t.rotation);
            if (t.dark)
                ctx.filter = 'invert(90%) hue-rotate(180deg) saturate(55%) brightness(80%)';
            const uv = t.uv || [0, 0, 1, 1];
            ctx.drawImage(bitmap, uv[0] * 256, uv[1] * 256, uv[2] * 256, uv[3] * 256, -t.size / 2, -t.size / 2, t.size + .35, t.size + .35);
            ctx.restore();
        }
        tris(f.triangles);
        lines(f.lines);
        for (const t of labels) {
            const a = t.atlas;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate((t.style.rotation || 0) * Math.PI / 180);
            ctx.drawImage(this.atlas.canvas, a.x, a.y, a.w, a.h, -a.width / 2, -a.height / 2, a.width, a.height);
            ctx.restore();
        }
        this.atlas.dirty = false;
    }
    async snapshot() {
        if (!this.lastFrame)
            throw new Error('Map is not ready.');
        const width = this.canvas.width, height = this.canvas.height, c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        if (this.device) {
            // Capture into an owned attachment. Reading the presentation canvas after
            // an asynchronous wait is not reliable because its texture may be recycled.
            const device = this.device, bytesPerRow = Math.ceil(width * 4 / 256) * 256;
            const texture = device.createTexture({ size: [width, height], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
            const buffer = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            try {
                const labels = this.atlas.prepare(this.lastFrame.texts);
                this.renderGPU(this.lastFrame, labels, { texture, buffer, bytesPerRow });
                await buffer.mapAsync(GPUMapMode.READ);
                const src = new Uint8Array(buffer.getMappedRange()), pixels = new Uint8ClampedArray(width * height * 4), bgra = this.format.startsWith('bgra');
                for (let y = 0; y < height; y++) {
                    if (!bgra)
                        pixels.set(src.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
                    else
                        for (let x = 0; x < width; x++) {
                            const a = y * bytesPerRow + x * 4, b = (y * width + x) * 4;
                            pixels[b] = src[a + 2];
                            pixels[b + 1] = src[a + 1];
                            pixels[b + 2] = src[a];
                            pixels[b + 3] = src[a + 3];
                        }
                }
                ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
            }
            finally {
                if (buffer.mapState === 'mapped')
                    buffer.unmap();
                buffer.destroy();
                texture.destroy();
            }
        }
        else {
            this.render(this.lastFrame);
            ctx.drawImage(this.canvas, 0, 0);
        }
        ctx.font = `${12 * this.dpr}px Arial`;
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.fillRect(0, height - 24 * this.dpr, width, 24 * this.dpr);
        ctx.fillStyle = '#334155';
        ctx.fillText('Wayline  |  ' + this.lastFrame.attribution, 10 * this.dpr, height - 8 * this.dpr);
        return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Unable to export PNG.')), 'image/png'));
    }
}
