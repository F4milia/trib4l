import Script from "next/script";
import { captchaConfigured } from "@/lib/auth/captcha";

/**
 * Cloudflare Turnstile, on the four forms GoTrue guards with a captcha:
 * signup, password sign-in, magic link, password reset.
 *
 * RENDERS NOTHING WITHOUT A SITE KEY, the same way components/oauth-buttons.tsx
 * offers only configured providers. Local development and CI have no key, and a
 * widget pointed at an absent site key is a broken form rather than a protected
 * one.
 *
 * IMPLICIT RENDERING, so there is no client component here. The script finds
 * every `.cf-turnstile` on the page, solves, and writes the result into a hidden
 * input named `cf-turnstile-response` inside the enclosing form -- which the
 * server action then reads. An explicit-render version would need a client
 * component, a ref and a callback to do the same thing.
 *
 * ON THE DESIGN CONSTRAINT, HONESTLY. Zero border-radius is our rule for our
 * own surfaces; the Turnstile widget is Cloudflare's markup in an iframe and
 * cannot be restyled, so if it renders, it renders with their chrome. That is
 * why `appearance="interaction-only"`: nothing is drawn at all unless Cloudflare
 * decides this visitor needs an interactive challenge, so the normal case is an
 * unchanged screen. The widget MODE (Managed / Non-interactive / Invisible) is a
 * dashboard setting on the site key, not a code setting -- see
 * docs/f4milia/s2-turnstile-setup.md. Note that S1's carry-forward note
 * conflated "non-interactive" with "renders no widget"; non-interactive still
 * draws a widget, and Invisible is the mode that draws none.
 *
 * `action` is passed through to Cloudflare so its dashboard can tell signup
 * traffic from sign-in traffic. It is a label, not a security control.
 */
export function Turnstile({ action }: { action: "signup" | "signin" | "magic-link" | "reset" }) {
  if (!captchaConfigured()) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        data-action={action}
        data-appearance="interaction-only"
        data-theme="light"
      />
    </>
  );
}
