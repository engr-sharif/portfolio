import getReadingTime from 'reading-time';
import { toString } from 'mdast-util-to-string';

/**
 * Remark plugin: compute reading time at build time and expose it on
 * frontmatter as `minutesRead` (e.g. "4 min read"). Keeps it out of the
 * content schema so editors never maintain it by hand.
 */
export function remarkReadingTime() {
  return function (tree, { data }) {
    const textOnTree = toString(tree);
    const reading = getReadingTime(textOnTree);
    data.astro.frontmatter.minutesRead = `${Math.max(1, Math.round(reading.minutes))} min read`;
  };
}
