#!/usr/bin/env python3
"""Deterministic browser tests. Set WAYLINE_URL to exercise a real secure origin.
The default in-memory document avoids network dependencies. It exercises Canvas,
not WebGPU; WebGPU validation needs HTTPS/localhost and a supported adapter.
Requires: pip install playwright; playwright install chromium (or CHROMIUM_PATH).
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
REPORT=[]

def passed(name, details=None):
    REPORT.append({'test':name,'status':'passed',**({'details':details} if details else {})})
    print('PASS',name,details or '',flush=True)

async def main():
 async with async_playwright() as p:
  executable=os.getenv('CHROMIUM_PATH','/usr/bin/chromium')
  kwargs={'headless':os.getenv('WAYLINE_HEADLESS','1') != '0','args':[]}
  if Path(executable).exists(): kwargs['executable_path']=executable
  browser=await p.chromium.launch(**kwargs)
  page=await browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  if os.getenv('WAYLINE_URL'):
   await page.goto(os.environ['WAYLINE_URL'],wait_until='domcontentloaded')
  else:
   await page.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
  await page.wait_for_function('window.Wayline?.ready',timeout=25000)
  await page.evaluate("Wayline.setBasemap('atlas')")
  await page.wait_for_timeout(200)
  renderer=await page.evaluate('Wayline.getRenderer()')
  passed('Application boots with a real renderer',renderer['backend'])
  assert await page.locator('h1').first.inner_text()=='Your world.\nA little closer.'
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  passed('Desktop layout has no horizontal overflow')
  await page.screenshot(path=str(ROOT/'tests'/'desktop.png'))

  geo=await page.evaluate('''() => {const g=Wayline.geometry; const points=[[-122.435,37.785],[0,0],[179.9,70],[-18.6,-62]];let max=0;for(const p of points){const r=g.unproject(g.project(p));max=Math.max(max,Math.abs(p[0]-r[0]),Math.abs(p[1]-r[1]));}const cam=new g.Camera([179.99,0],8);cam.setSize(1000,700);const a=cam.coord([250,190]);cam.zoomAt(2.35,[250,190]);const b=cam.coord([250,190]);const d=g.distance(a,b);cam.pan(100000,200000);return {roundtrip:max,anchorDriftMeters:d,normalized:cam.center.every(Number.isFinite)&&cam.center[0]>=0&&cam.center[0]<=1&&cam.center[1]>=0&&cam.center[1]<=1,londonParis:g.distance([-.1276,51.5074],[2.3522,48.8566])};}''')
  assert geo['roundtrip']<1e-9 and geo['anchorDriftMeters']<.001 and geo['normalized']
  assert 300000<geo['londonParis']<400000
  passed('Mercator round trips, anchor zoom, camera normalization, geodesic distance',geo)

  z=await page.evaluate('Wayline.getView().zoom')
  await page.locator('#zoom-in').click()
  assert abs((await page.evaluate('Wayline.getView().zoom'))-z-1)<1e-9
  await page.locator('#zoom-out').click()
  passed('Zoom controls change the real camera')

  await page.locator('#search').fill('Palace of Fine Arts')
  await page.locator('#search').press('Enter')
  await page.wait_for_timeout(650)
  assert await page.locator('.place-detail-title').inner_text()=='Palace of Fine Arts'
  await page.locator('[data-action="save-place"]').click()
  assert 'palace' in await page.evaluate('Wayline.getDocument().saved')
  await page.locator('[data-nav="saved"]').click()
  assert await page.locator('[data-open-place="palace"]').count()==1
  passed('Local search, place details, and saved collection')

  await page.locator('#create-map').click()
  assert await page.locator('#editor-toolbar').is_visible()
  # A central clear region avoids the property panel and floating controls.
  await page.locator('[data-tool="pin"]').click()
  await page.mouse.click(900,520)
  assert len(await page.evaluate('Wayline.getDocument().features'))==1
  assert (await page.evaluate('Wayline.getDocument().features[0].type'))=='pin'
  passed('Pointer pin creation writes a geographic feature')

  await page.locator('[data-tool="text"]').click()
  await page.mouse.click(1000,610)
  await page.locator('#feature-text').fill('Łódź • مرحبا\nFind your own way')
  await page.get_by_label('Font size',exact=True).fill('32')
  await page.get_by_label('Font size',exact=True).press('Tab')
  await page.get_by_label('Italic',exact=True).click()
  doc=await page.evaluate('Wayline.getDocument()')
  text=[f for f in doc['features'] if f['type']=='text'][0]
  assert text['text']=='Łódź • مرحبا\nFind your own way' and text['style']['size']==32 and text['style']['italic']
  await page.get_by_label('Align left',exact=True).click()
  passed('Multiline Unicode labels and typography controls')

  await page.locator('[data-tool="line"]').click()
  await page.mouse.click(740,400)
  await page.mouse.click(840,350)
  await page.mouse.click(960,430)
  await page.keyboard.press('Enter')
  assert (await page.evaluate('Wayline.getDocument().features.at(-1).coordinates.length'))==3
  passed('Polyline drawing and Enter completion')

  await page.locator('[data-tool="polygon"]').click()
  for x,y in [(740,620),(840,700),(690,730)]: await page.mouse.click(x,y)
  await page.keyboard.press('Enter')
  assert (await page.evaluate('Wayline.getDocument().features.at(-1).type'))=='polygon'
  old=await page.evaluate('Wayline.getDocument().features.at(-1).coordinates[0]')
  await page.mouse.move(740,620);await page.mouse.down();await page.mouse.move(755,600,steps=4);await page.mouse.up()
  new=await page.evaluate('Wayline.getDocument().features.at(-1).coordinates[0]')
  assert old!=new
  passed('Polygon creation and draggable geometry vertices')

  for tool, coords in [('rectangle',(960,680,1100,800)),('circle',(1080,460,1170,490))]:
   await page.locator(f'[data-tool="{tool}"]').click()
   x,y,x1,y1=coords
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x1,y1,steps=5);await page.mouse.up()
   assert await page.evaluate('Wayline.getDocument().features.at(-1).type')==tool
  passed('Rectangle and circle drag gestures')

  await page.locator('[data-tool="measure"]').click()
  await page.mouse.click(800,830);await page.mouse.click(1050,850);await page.keyboard.press('Enter')
  assert await page.evaluate('Wayline.getDocument().features.at(-1).type')=='measure'
  count=await page.evaluate('Wayline.getDocument().features.length')
  await page.get_by_label('Duplicate feature',exact=True).click()
  assert await page.evaluate('Wayline.getDocument().features.length')==count+1
  await page.locator('#undo-button').click()
  assert await page.evaluate('Wayline.getDocument().features.length')==count
  await page.locator('#redo-button').click()
  assert await page.evaluate('Wayline.getDocument().features.length')==count+1
  passed('Measurement, duplication, transactional undo/redo')

  result=await page.evaluate('''() => {const g=Wayline.geometry, data=Wayline.exportGeoJSON(), re=g.fromGeoJSON(data);let rejected=false;try{g.fromGeoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[1000,90]},properties:{}}]});}catch{rejected=true;}const hole=g.fromGeoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-122.44,37.79],[-122.43,37.79],[-122.43,37.8],[-122.44,37.8],[-122.44,37.79]],[[-122.438,37.792],[-122.434,37.792],[-122.434,37.796],[-122.438,37.796],[-122.438,37.792]]]},properties:{name:'Polygon with a hole',style:{fill:'#00ff00'}}}]});return {types:re.map(f=>f.type),rejected,holes:hole[0].holes.length,text:re.find(f=>f.type==='text').text};}''')
  assert result['rejected'] and result['holes']==1
  assert set(['pin','text','line','polygon','rectangle','circle','measure']).issubset(result['types'])
  passed('GeoJSON round trip, polygon holes, malformed coordinates rejected')

  await page.evaluate('Wayline.closeEditor()')
  await page.locator('#theme-toggle').click()
  assert await page.locator('html').get_attribute('data-theme')=='dark'
  await page.screenshot(path=str(ROOT/'tests'/'dark.png'))
  passed('Dark theme redraws the map and chrome')
  await page.locator('#theme-toggle').click()

  # Network adapters get deterministic fixtures, not live third-party services.
  await page.evaluate('''() => {window.fetch=async url=> {const u=String(url);if(u.includes('/search'))return new Response(JSON.stringify([{osm_type:'node',osm_id:12345,name:'Test landmark',display_name:'Test landmark, Test city',lon:'-122.41',lat:'37.80',type:'attraction',address:{city:'Test city'}}]),{status:200,headers:{'Content-Type':'application/json'}});if(u.includes('/route/'))return new Response(JSON.stringify({code:'Ok',routes:[{geometry:{coordinates:[[-122.3937,37.7955],[-122.425,37.799],[-122.4783,37.8199]]},distance:9800,duration:1080,legs:[{summary:'Fixture Road',steps:[{distance:500,duration:60,name:'Fixture Road',maneuver:{type:'depart'}},{distance:9300,duration:1020,name:'Fixture Bridge',maneuver:{type:'arrive'}}]}]}]}),{status:200,headers:{'Content-Type':'application/json'}});throw new Error('External tile request intentionally disabled in deterministic tests');}; }''')
  await page.locator('#directions-button').click()
  await page.locator('#get-route').click()
  await page.wait_for_selector('.route-card',timeout=5000)
  assert '18 min' in await page.locator('.route-time').inner_text()
  await page.locator('#toggle-steps').click()
  assert await page.locator('.steps-list li').count()==2
  passed('OSRM adapter, route selection, and maneuver list (fixture, not live network)')

  await page.locator('#search').fill('A place from the fixture service')
  await page.locator('#search').press('Enter')
  await page.wait_for_selector('[data-open-place="osm-node-12345"]',timeout=5000)
  passed('Explicit Nominatim-compatible online search (fixture, not live network)')

  await page.evaluate('Wayline.setBasemap("atlas")')
  await page.locator('[data-nav="maps"]').click()
  await page.locator('[data-action="load-sample"]').click()
  await page.wait_for_timeout(200)
  await page.screenshot(path=str(ROOT/'tests'/'editor.png'))
  passed('Editable sample map and inspector integration')

  await page.locator('[data-action="export"]').first.click()
  assert await page.locator('[data-export]').count()==4
  # Capture generated bytes without relying on platform download permissions.
  await page.evaluate('''() => {window.__exports=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__exports.push(b);return original(b);};}''')
  await page.locator('[data-export="geojson"]').click()
  await page.locator('[data-export="svg"]').click()
  await page.locator('[data-export="png"]').click()
  await page.wait_for_timeout(300)
  exports=await page.evaluate('''async()=>Promise.all(window.__exports.map(async b=>({type:b.type,size:b.size,prefix:b.type==='image/png'?'png':(await b.text()).slice(0,80)})))''')
  assert len(exports)>=3 and all(e['size']>100 for e in exports)
  assert any(e['type']=='image/png' for e in exports)
  assert any(e['type']=='image/svg+xml' for e in exports)
  await page.locator('#close-modal').click()
  passed('GeoJSON, SVG, and PNG export produce nonempty artifacts',exports)

  # New in-memory document at phone size.
  mobile=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
  mobile.on('pageerror',lambda e:errors.append(str(e)))
  await mobile.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
  await mobile.wait_for_function('window.Wayline?.ready',timeout=25000)
  assert await mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await mobile.locator('#sidebar-toggle').click()
  assert await mobile.locator('#sidebar-content').is_visible()
  await mobile.screenshot(path=str(ROOT/'tests'/'mobile.png'))
  await mobile.locator('#brand').click()
  await mobile.locator('[data-workspace-panel="saved"]').click()
  assert 'Your places' in await mobile.locator('#sidebar-content').inner_text()
  passed('Mobile layout, bottom sheet, and mobile navigation')
  assert not errors,errors
  passed('No uncaught page exceptions during the suite')
  report={'renderer':renderer,'liveNetworkValidated':False,'webgpuValidated':renderer['backend']=='WebGPU','tests':REPORT}
  (ROOT/'tests'/'results.json').write_text(json.dumps(report,indent=2))
  print(f'\n{len(REPORT)} browser checks passed.',flush=True)
  await browser.close()

if __name__=='__main__':asyncio.run(main())
