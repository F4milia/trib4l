/**
 * The shared Hearth & Material shell every F4milia email renders into.
 *
 * Two constraints shape it, and they pull in the same direction.
 *
 * The design system (f4milia-design-system.md): zero border-radius everywhere,
 * Parchment ground, Deep Slate ink, Terracotta reserved for the one primary
 * action, mono micro-labels, hard offset shadow rather than a blur. Email
 * clients cannot load Tailwind and Outlook still renders through Word, so this
 * is table layout and inline styles -- but the tokens are the same hex values
 * the app uses, quoted from §2.1, not approximations.
 *
 * CLAUDE.md invariant 3: "NO Family content in any outbound message. Emails and
 * pushes name the event, never the content. Assume the inbox may be shared."
 * The shell therefore takes an eyebrow, a heading, a short body, and one
 * action -- all supplied by the template layer from fixed copy, none of it
 * ever passed through from a Table entry, a message, or a Family's name.
 */

// f4milia-design-system.md §2.1. Duplicated as literals rather than imported
// from the Tailwind theme because an email is a standalone HTML document with
// no stylesheet and no build step -- every value has to be inline.
export const EMAIL_TOKENS = {
  parchment: "#F7F4F0",
  deepSlate: "#1A1A1A",
  terracotta: "#BC472E",
  bakedClay: "#A04729",
} as const;

// The design system's own fallbacks (§3.1). No webfonts: an email cannot rely
// on one loading, and the serif/mono contrast the design depends on survives
// on platform defaults.
const SERIF = "Georgia, 'Times New Roman', serif";
const BODY = "Arial, Helvetica, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Monaco, Consolas, monospace";

export type EmailLayoutInput = {
  /** Mono micro-label above the heading. Fixed copy. */
  eyebrow: string;
  /** Uppercase serif display line. Fixed copy -- never a Family or member name. */
  heading: string;
  /** One or two short sentences. Fixed copy. */
  body: string[];
  action: { label: string; url: string };
  /** Small print under the rule. Fixed copy. */
  footnote: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmailHtml(input: EmailLayoutInput): string {
  const t = EMAIL_TOKENS;
  const paragraphs = input.body
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-family:${BODY};font-size:15px;line-height:24px;color:${t.deepSlate};">${escapeHtml(line)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.heading)}</title></head>
<body style="margin:0;padding:0;background-color:${t.parchment};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${t.parchment};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${t.parchment};border:1px solid ${t.deepSlate};">
<tr><td style="padding:28px 28px 0;">
<p style="margin:0 0 20px;font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;color:${t.bakedClay};">${escapeHtml(input.eyebrow)}</p>
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:28px;line-height:30px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase;color:${t.deepSlate};">${escapeHtml(input.heading)}</h1>
${paragraphs}
</td></tr>
<tr><td style="padding:8px 28px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background-color:${t.terracotta};">
<a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 22px;font-family:${MONO};font-size:12px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:${t.parchment};text-decoration:none;">${escapeHtml(input.action.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 28px 24px;border-top:1px solid ${t.deepSlate};">
<p style="margin:16px 0 0;font-family:${MONO};font-size:11px;line-height:18px;letter-spacing:0.04em;color:${t.deepSlate};">${escapeHtml(input.footnote)}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${t.deepSlate};">F4milia</p>
</td></tr></table>
</body></html>`;
}

/**
 * The plain-text alternative. Not an afterthought: a text part is what keeps
 * transactional mail out of spam filters that penalise HTML-only messages, and
 * it is what a screen reader in a text-preferring client actually reads.
 */
export function renderEmailText(input: EmailLayoutInput): string {
  return [
    input.eyebrow.toUpperCase(),
    "",
    input.heading,
    "",
    ...input.body,
    "",
    `${input.action.label}: ${input.action.url}`,
    "",
    "--",
    input.footnote,
    "F4milia",
  ].join("\n");
}
