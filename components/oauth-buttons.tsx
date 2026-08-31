import { signInWithProvider } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { configuredProviders } from "@/lib/auth/providers";
import { copy } from "@/lib/copy";

const t = copy.auth.oauth;

/**
 * Renders one button per provider the project has actually configured, and
 * NOTHING -- not a divider, not an empty row -- when none are. A button for an
 * unconfigured provider is a button that sends people to an error, and an
 * orphan "or" rule above nothing is the invented-placeholder failure CLAUDE.md
 * rules out for empty states.
 *
 * A form per provider rather than a client-side handler: this is a server
 * component, the action runs on the server, and the exchange never touches the
 * client bundle.
 *
 * Ghost rather than terracotta on purpose. §2.1: terracotta marks the one
 * thing that is live on a screen, and on a sign-in screen that is the sign-in
 * button. Three filled buttons would be three primary actions.
 */
export function OAuthButtons() {
  const providers = configuredProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mt-5 space-y-3">
      <p
        aria-hidden="true"
        className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-deep-slate/70 before:h-px before:flex-1 before:bg-deep-slate/20 after:h-px after:flex-1 after:bg-deep-slate/20"
      >
        {t.dividerLabel}
      </p>
      {providers.map((provider) => (
        <form key={provider} action={signInWithProvider}>
          <input type="hidden" name="provider" value={provider} />
          <Button type="submit" variant="ghost" className="w-full border-deep-slate/20">
            {t.continueWith} {t.providers[provider]}
          </Button>
        </form>
      ))}
    </div>
  );
}
