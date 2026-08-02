/**
 * A pressable whose entire visible content is a glyph must carry an
 * accessibilityLabel.
 *
 * Written because this exact defect appeared SEVEN times during the primitive
 * migration — `✕`, `›`, `‹`, `•••`, `×` — and each one was found by hand, one
 * file at a time. A screen reader announces the character: "bullet bullet
 * bullet", "greater-than sign". The control is unusable and nothing else in the
 * pipeline objects, because it typechecks, it lints, and it looks correct.
 *
 * `IconButton` makes `accessibilityLabel` a required prop, which is the real fix
 * — this rule exists for the pressables that have not been converted yet, and to
 * stop new ones appearing faster than they are converted.
 *
 * Deliberately narrow. It fires only when the pressable's whole content is one
 * literal glyph, so it cannot argue with a button that has a text label, an
 * icon component, or children it cannot see into. Every one of the seven real
 * cases matches that shape; a broader rule would have needed suppressions, and
 * a rule with suppressions in it teaches people to reach for the suppression.
 */

/** Non-word, non-space, 1-3 chars: `✕`, `›`, `•••`, `×`. Not "OK" or "12". */
const GLYPH = /^[^\w\s]{1,3}$/u;

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight']);

/** JSX children minus whitespace-only text nodes. */
function meaningfulChildren(node) {
  return node.children.filter(
    (c) => !(c.type === 'JSXText' && c.value.trim() === ''),
  );
}

/** The literal string a <Text> renders, or null if it is not a bare literal. */
function literalTextOf(node) {
  if (node.type !== 'JSXElement') return null;
  const name = node.openingElement.name;
  if (name.type !== 'JSXIdentifier' || name.name !== 'Text') return null;
  const kids = meaningfulChildren(node);
  if (kids.length !== 1) return null;
  const only = kids[0];
  if (only.type === 'JSXText') return only.value.trim();
  // {'✕'} is the same thing written differently — people do both.
  if (
    only.type === 'JSXExpressionContainer' &&
    only.expression.type === 'Literal' &&
    typeof only.expression.value === 'string'
  ) {
    return only.expression.value.trim();
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require accessibilityLabel on a pressable whose only content is a glyph',
    },
    schema: [],
    messages: {
      missing:
        'This control renders only "{{glyph}}", so a screen reader announces the character itself. ' +
        'Add accessibilityLabel describing what it DOES (e.g. "Close", "More"), or use IconButton, which requires one.',
    },
  },

  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        if (opening.name.type !== 'JSXIdentifier') return;
        if (!PRESSABLES.has(opening.name.name)) return;

        // A spread could carry the label; do not guess about what it contains.
        const hasSpread = opening.attributes.some((a) => a.type === 'JSXSpreadAttribute');
        const hasLabel = opening.attributes.some(
          (a) => a.type === 'JSXAttribute' && a.name.name === 'accessibilityLabel',
        );
        if (hasLabel || hasSpread) return;

        const kids = meaningfulChildren(node);
        if (kids.length !== 1) return;

        const glyph = literalTextOf(kids[0]);
        if (glyph === null || !GLYPH.test(glyph)) return;

        context.report({ node: opening, messageId: 'missing', data: { glyph } });
      },
    };
  },
};
