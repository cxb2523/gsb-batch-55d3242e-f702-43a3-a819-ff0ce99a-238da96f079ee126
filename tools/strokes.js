// strokes.js (tools) — read src/strokes.js from node without eval.
const fs = require('fs'), path = require('path');
exports.load = function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'strokes.js'), 'utf8');
  const b64 = /var STROKES = "([A-Za-z0-9+/=]*)";/.exec(src);
  const ends = /var PHASE_ENDS = (\[[\d,\s]*\]);/.exec(src);
  if (!b64 || !ends) throw new Error('src/strokes.js is not in the expected format');
  return { bytes: Buffer.from(b64[1], 'base64'), phaseEnds: JSON.parse(ends[1]), source: src };
};
