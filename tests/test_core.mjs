import assert from 'node:assert/strict';
import {Camera,History,project,unproject,distance,triangulateRings,fromGeoJSON,toGeoJSON,createFeature} from '../src/core.js';
let checks=0;
function test(name,fn){fn();checks++;console.log(`PASS ${name}`);}
function area(tris){let a=0;for(let i=0;i<tris.length;i+=3){const [p,q,r]=tris.slice(i,i+3);a+=Math.abs((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))/2;}return a;}
test('Mercator forward/inverse roundtrip',()=>{for(const p of [[0,0],[180,85],[-122.42,37.78],[18.6714,50.2945]]){const q=unproject(project(p));assert.ok(Math.abs(p[0]-q[0])<1e-10&&Math.abs(p[1]-q[1])<1e-10);}});
test('Cursor-anchored zoom with bearing',()=>{const c=new Camera([18.6714,50.2945],14);c.setSize(1000,600);c.bearing=1.2;const a=c.coord([121,453]);c.zoomAt(1.74,[121,453]);assert.ok(distance(a,c.coord([121,453]))<.001);});
test('Dateline-aware fitting',()=>{const c=new Camera();c.setSize(1000,700);c.fit([[179.9,10],[-179.9,10.1]],50);assert.ok(c.zoom>10);assert.ok(Math.abs(Math.abs(unproject(c.center)[0])-180)<.01);});
test('History transactions coalesce and replay',()=>{const h=new History({value:0});h.commit(s=>s.value=1,'value');h.commit(s=>s.value=2,'value');assert.equal(h.past.length,1);h.undo();assert.equal(h.state.value,0);h.redo();assert.equal(h.state.value,2);h.undo();h.commit(s=>s.value=7);assert.equal(h.future.length,0);});
test('Convex polygon triangulation',()=>assert.equal(area(triangulateRings([[[0,0],[10,0],[10,10],[0,10]]])),100));
test('Concave polygon triangulation',()=>assert.equal(area(triangulateRings([[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]]])),7));
test('Polygon hole has even/odd fill',()=>assert.equal(area(triangulateRings([[[0,0],[10,0],[10,10],[0,10]],[[3,3],[7,3],[7,7],[3,7]]])),84));
test('Multiple holes subtract correctly',()=>assert.equal(area(triangulateRings([[[0,0],[10,0],[10,10],[0,10]],[[1,1],[2,1],[2,2],[1,2]],[[6,6],[9,6],[9,9],[6,9]]])),90));
test('GeoJSON preserves editable primitive types',()=>{const features=['pin','text','line','polygon','rectangle','circle','measure'].map(t=>createFeature(t,t==='pin'||t==='text'?[[1,1]]:t==='polygon'?[[1,1],[2,1],[1,2]]:[[1,1],[2,2]]));assert.deepEqual(fromGeoJSON(toGeoJSON(features)).map(f=>f.type),features.map(f=>f.type));});
test('GeoJSON rejects nonfinite coordinates',()=>assert.throws(()=>fromGeoJSON({type:'Feature',geometry:{type:'Point',coordinates:[Infinity,0]}})));
test('GeoJSON rejects out-of-range latitude',()=>assert.throws(()=>fromGeoJSON({type:'Feature',geometry:{type:'Point',coordinates:[0,90]}})));
test('Imported styles are sanitized and bounded',()=>{const f=fromGeoJSON({type:'Feature',geometry:{type:'Point',coordinates:[0,0]},properties:{waylineType:'text',text:'Łódź مرحبا',style:{size:99999,color:'url(javascript:bad)',opacity:-50}}})[0];assert.equal(f.style.size,96);assert.equal(f.style.opacity,0);assert.match(f.style.color,/^#[a-f0-9]{6}$/i);assert.equal(f.text,'Łódź مرحبا');});
console.log(`\n${checks} core checks passed.`);
