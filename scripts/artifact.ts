import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Turns the single-file build (dist-single/index.html) into the page format the claude.ai artifact host expects:
 * a fragment of title, links, styles, body markup and scripts, which the host wraps in its own document.
 * The music stays beside the page as music/track1.mp3 to music/track4.mp3.
 */

const html = readFileSync('dist-single/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Dead Pixels</title>';
const links = [...html.matchAll(/<link [^>]*>/g)].map(m => m[0]).filter(l => !/rel="(icon|modulepreload)"/.test(l));
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '').trim();
if (!scripts.length || !styles.length || !body) throw new Error('dist-single/index.html is missing its script, styles or body');
const out = [title, ...links, ...styles, body, ...scripts.map(s => `<script type="module">${s}</script>`)].join('\n');
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/index.html', out);
console.log(`dist-artifact/index.html: ${(out.length / 1024).toFixed(1)} KB`);
