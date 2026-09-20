// Must be the first thing index.js imports, with nothing else mixed into
// this file's own import list either — Babel's CommonJS transform hoists
// every `import` statement above plain statements, so any polyfill setup
// that isn't itself the first import ends up racing later imports (like
// `./App`, which transitively touches web3.js) instead of preceding them.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (v) => JSON.parse(JSON.stringify(v));
}
