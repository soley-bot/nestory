import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

// Actual feature components and CSS; only Next routing/image/theme and auth
// actions are isolated. The server binds loopback and rejects non-GET requests.
const phase = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(phase)) throw Error('Use before or after');
const output = resolve('output/playwright/feature-layout', phase);
await mkdir(output, { recursive: true });
const stubPlugin = { name: 'synthetic-boundaries', setup(builder) {
  if (phase === 'before') builder.onLoad({ filter: /\.tsx?$/, namespace: 'file' }, ({ path }) => {
    if (!path.startsWith(resolve('src') + '\\')) return;
    const contents = execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'show', 'db86c5d09c71c485a5b5d4ad1772cdcc00b51451:' + relative(process.cwd(), path).replaceAll('\\', '/')], { encoding: 'utf8' });
    return { contents, loader: path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: resolve(path, '..') };
  });
  builder.onResolve({ filter: /^(next\/(link|image|navigation)|@\/components\/theme-toggle|@\/features\/auth\/actions)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
    let contents;
    if (path === 'next/link') contents = `import React from 'react'; export default function Link({prefetch,onNavigate,scroll,children,...props}) { return <a {...props}>{children}</a> }`;
    else if (path === 'next/image') contents = `import React from 'react'; export default function Image({fill,priority,...props}) { return <img {...props}/> }`;
    else if (path === 'next/navigation') contents = `export const usePathname=()=>'/finance/accounts'; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){},replace(){},refresh(){}});`;
    else if (path.includes('theme-toggle')) contents = `import React from 'react'; export function ThemeToggle(){ return <button type="button" aria-label="Toggle theme">◐</button> }`;
    else contents = `export async function loginAction(){ await new Promise(r=>setTimeout(r,250)); return {message:'Unable to sign in to InternationalResidentialCommunityManagementServices_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ. Check your email and password, then try again.'}; }`;
    return { contents, loader: 'jsx', resolveDir: process.cwd() };
  });
} };
const bundle = await build({ absWorkingDir: process.cwd(), tsconfig: resolve('tsconfig.json'), entryPoints: [resolve('scripts/feature-layout-fixtures.jsx')], bundle: true, write: false, platform: 'browser', jsx: 'automatic', plugins: [stubPlugin], define: { 'process.env.NODE_ENV': '"development"' } });
const css = await postcss([tailwind({ base: process.cwd(), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: resolve('src/app/globals.css') });
await writeFile(resolve(output, 'fixture.js'), bundle.outputFiles[0].contents);
await writeFile(resolve(output, 'fixture.css'), css.css);
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server = createServer(async (request, response) => {
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  if (request.url === '/fixture.js' || request.url === '/fixture.css') {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'application/javascript' : 'text/css');
    response.end(await readFile(resolve(output, request.url.slice(1))));
  } else if (request.url.startsWith('/logo/')) {
    const asset=resolve('public', '.'+new URL(request.url,'http://127.0.0.1').pathname);
    if(!asset.startsWith(resolve('public')+sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type',asset.endsWith('.svg')?'image/svg+xml':'image/png'); response.end(await readFile(asset)); }
    catch { response.writeHead(404).end(); }
  } else { response.setHeader('Content-Type', 'text/html'); response.end(html); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
const results = [];
function inspectLayout() {
  const unintended = [], clipped = [], sharedClipped = [], textOutsideBox = [], textOutsideCell = [];
  for (const element of document.querySelectorAll('body *')) {
    if (element.closest('.sr-only, [aria-hidden="true"], [inert]') || ['SCRIPT','STYLE','OPTION'].includes(element.tagName)) continue;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
    const parents = [];
    let parent = element.parentElement;
    while (parent) { parents.push(parent); parent = parent.parentElement; }
    const scrolling = parents.find(p => ['auto','scroll'].includes(getComputedStyle(p).overflowX));
    const record = { tag:element.tagName, text:element.textContent.slice(0,100), class:typeof element.className === 'string' ? element.className : '' };
    if ((rect.right > innerWidth+1 || rect.left < -1) && !scrolling) unintended.push(record);
    const cell = element.closest('td,th');
    if (cell) for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const range=document.createRange(); range.selectNode(node);
      const textRect=range.getBoundingClientRect(), cellRect=cell.getBoundingClientRect();
      if (textRect.right>cellRect.right+1 || textRect.left<cellRect.left-1) textOutsideCell.push(record);
    }
    if (element.childElementCount !== 0 || !element.textContent.trim()) continue;
    const range = document.createRange(); range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();
    const truncates = (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth+1) || (Number(style.webkitLineClamp) > 0 && element.scrollHeight > element.clientHeight+1);
    // A local scroll viewport deliberately hides the unscrolled portion of a
    // table/board. Only inspect clipping ancestors inside that viewport.
    const clipParents = scrolling ? parents.slice(0, parents.indexOf(scrolling)) : parents;
    const hiddenParent = clipParents.find(p => {
      if (p === document.body || p === document.documentElement) return false; // Root overflow clips to the viewport, including fixed overlays.
      const ps=getComputedStyle(p), pr=p.getBoundingClientRect();
      return (['hidden','clip'].includes(ps.overflowX) && (textRect.right>pr.right+1 || textRect.left<pr.left-1)) || (['hidden','clip'].includes(ps.overflowY) && (textRect.bottom>pr.bottom+3 || textRect.top<pr.top-3));
    });
    if (truncates || hiddenParent) {
      if (element.closest('nav[aria-label="Breadcrumb"]')) sharedClipped.push(record);
      else clipped.push(record);
    }
    if (!['inline','contents'].includes(style.display) && style.textOverflow !== 'ellipsis' && (textRect.right>rect.right+1 || textRect.left<rect.left-1 || textRect.bottom>rect.bottom+3 || textRect.top<rect.top-3)) textOutsideBox.push(record);
  }
  return { documentOverflow:document.documentElement.scrollWidth>innerWidth+1, unintended, clipped, sharedClipped, textOutsideBox, textOutsideCell };
}
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    for (const surface of ['auth', 'dashboard', 'property', 'unit', 'unit-inspector', 'properties-register', 'units-register', 'people-register', 'leases-register', 'timeline-register', 'person-search', 'property-filters', 'report-filters', 'people', 'leases', 'maintenance', 'timeline', 'reports', 'report-detail', 'settings', 'documents', 'finance', 'empty', 'loading']) {
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on('pageerror', onError);
      await page.goto(`http://127.0.0.1:${server.address().port}/?surface=${surface}`);
      await page.locator('main').waitFor();
      if (surface === 'reports') {
        await page.getByRole('button', { name: 'Expand all', exact: true }).click();
        await page.locator('summary').click();
      }
      if (surface === 'report-detail') {
        await page.getByRole('button', {name:/View details for/}).click();
        await page.getByRole('dialog').waitFor();
        await page.evaluate(() => Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      }
      if (surface === 'person-search') {
        await page.getByRole('combobox').click();
        await page.getByRole('listbox').waitFor();
        await page.evaluate(() => Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      }
      if (surface === 'property-filters') {
        await page.getByRole('button', {name:'Filters', exact:true}).click();
        await page.getByRole('heading', {name:'Filter properties', exact:true}).waitFor();
        await page.evaluate(() => Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      }
      if (surface === 'auth') {
        await page.locator('input[name=email]').fill('synthetic@example.invalid');
        await page.locator('input[name=password]').fill('synthetic-password');
        await page.locator('button[type=submit]').click();
        await page.getByRole('alert').waitFor();
      }
      const assertion = await page.evaluate(inspectLayout);
      await page.screenshot({ path: resolve(output, `${surface}-${width}.png`), fullPage: true });
      if (surface === 'reports') {
        await page.locator('summary').click();
        await page.screenshot({ path:resolve(output, `reports-table-${width}.png`), fullPage:true });
      }
      if (surface === 'reports' || surface === 'finance' || surface === 'maintenance') {
        await page.evaluate(() => document.querySelectorAll('*').forEach(e=> { if(['auto','scroll'].includes(getComputedStyle(e).overflowX)) e.scrollLeft=e.scrollWidth; }));
        await page.screenshot({ path:resolve(output, `${surface}-scroll-end-${width}.png`), fullPage:true });
      }
      if (surface === 'finance') {
        await page.locator('td').filter({hasText:'USD 9,876,543,210.99'}).first().scrollIntoViewIfNeeded();
        await page.screenshot({ path:resolve(output, `finance-amount-${width}.png`), fullPage:true });
      }
      results.push({ surface, width, ...assertion, errors });
      page.off('pageerror', onError);
    }
    await page.close();
  }
  // 200% zoom reflow equivalent: 1440 physical pixels / 2 = 720 CSS pixels.
  const page = await browser.newPage({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const surface of ['auth','property','unit','unit-inspector','people','leases','timeline','reports','report-detail','settings','finance']) {
    await page.goto(`http://127.0.0.1:${server.address().port}/?surface=${surface}`);
    if (surface === 'reports') await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    if (surface === 'report-detail') {
      await page.getByRole('button', {name:/View details for/}).click();
      await page.getByRole('dialog').waitFor();
      await page.evaluate(() => Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    }
    await page.screenshot({ path: resolve(output, `${surface}-zoom-200.png`), fullPage: true });
    results.push({ surface, width:720, zoomReflowEquivalent:200, ...await page.evaluate(inspectLayout) });
  }
  await page.close();
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
await writeFile(resolve(output, 'assertions.json'), JSON.stringify(results, null, 2));
await writeFile(resolve(output, 'environment.json'), JSON.stringify({generatedAt:new Date().toISOString(),phase,reviewedBase:'db86c5d09c71c485a5b5d4ad1772cdcc00b51451',node:process.version,browser:browser.version(),viewports:[320,390,768,1440],zoom:{reflowEquivalent:200,cssViewport:720,deviceScaleFactor:2,nativeBrowserZoom:false},source:phase==='before'?'Reviewed Git source':'Isolated working tree',fonts:'System fallback; next/font Google download is not run',mockedBoundaries:['Next Link/navigation/image','Theme toggle','Auth action'],network:'Loopback GET only; external browser requests aborted'},null,2));
const failures=results.filter(r=>r.documentOverflow||r.unintended?.length||r.clipped?.length||r.textOutsideBox?.length||r.textOutsideCell?.length||r.errors?.length);
console.log(JSON.stringify({ phase, cases:results.length, failureCount:failures.length, failures:phase==='after'?failures.map(r=>({surface:r.surface,width:r.width,overflow:r.documentOverflow,unintended:r.unintended.length,clipped:r.clipped.length,textOutsideBox:r.textOutsideBox.length,textOutsideCell:r.textOutsideCell.length})):undefined, sharedClipped:results.filter(r=>r.sharedClipped.length).map(r=>[r.surface,r.width]), errors:results.filter(r=>r.errors?.length) }, null, 2));
if(phase==='after'&&failures.length) process.exitCode=1;
