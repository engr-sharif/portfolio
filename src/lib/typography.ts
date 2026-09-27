/**
 * Printer's quotes for text typed on a keyboard: ' and " become ‘ ’ “ ”, and
 * the apostrophe in "Here's" becomes ’. Applied when content is read for the
 * site, so the Studio keeps saving exactly what was typed.
 */
export function smartQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{—–-])"/g, '$1“') // opening double after start, space, bracket or dash
    .replace(/"/g, '”')
    .replace(/(\w)'(\w)/g, '$1’$2')                // apostrophes inside words
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}
