import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
assert(!/#live\s*\{\s*display:\s*none/.test(css),'Research feedback must remain visible on narrow screens');
console.log('Research feedback remains visible: PASS');
