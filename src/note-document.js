/* Pure Markdown boundaries and three-way merging. Never evaluate note content. */
function splitNote(text, identity) {
  text = text.replace(/\r\n/g, '\n');
  const begin = '<!-- zotero-bridge:' + identity + ':begin -->';
  const end = '<!-- zotero-bridge:' + identity + ':end -->';
  const a = text.indexOf(begin), b = text.indexOf(end);
  if (a < 0 || b < a || text.indexOf(begin, a + 1) >= 0 || text.indexOf(end, b + 1) >= 0) {
    throw new Error('The note identity markers are missing or damaged. The file has not been overwritten.');
  }
  return {before: text.slice(0, a), managed: text.slice(a, b + end.length), after: text.slice(b + end.length)};
}
function mergeNote(base, edited, current, identity) {
  const b = splitNote(base, identity), e = splitNote(edited, identity), c = splitNote(current, identity);
  if (e.managed !== b.managed) throw new Error('Bibliographic details are managed by Zotero. Edit your personal notes outside that block.');
  const merge = key => {
    if (e[key] === b[key]) return c[key];
    if (c[key] === b[key] || e[key] === c[key]) return e[key];
    const error = new Error('This note was also edited outside this tab. Compare the current file before saving; your draft is retained.');
    error.code = 'NOTE_CONFLICT';
    throw error;
  };
  return merge('before') + c.managed + merge('after');
}
if (typeof module !== 'undefined') module.exports = {splitNote, mergeNote};
