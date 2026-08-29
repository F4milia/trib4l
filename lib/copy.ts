/**
 * The copy deck. CLAUDE.md: "New UI strings go in the copy deck, never
 * inline." Nothing in the repo had one before this file, so it starts with
 * what PR C1 introduces -- the org navigation -- and grows as Phase C moves
 * each surface's strings in.
 *
 * Descriptions are the mono second line §7.7 puts under each nav label. They
 * describe what the destination actually contains: no invented placeholders,
 * per CLAUDE.md's honest-copy rule.
 *
 * Deliberately still says "communities", not "Families". The rest of the UI
 * says community ("Share something with the community…", "All communities"),
 * and renaming the user-facing noun across 34 surfaces is a copy decision,
 * not a design migration one -- a half-renamed UI is worse than a consistent
 * old one. Descriptions here avoid the noun where they can.
 */
export const copy = {
  brand: {
    /** §3.4 sets the wordmark at text-2xl. Text, not an image -- no logo exists. */
    wordmark: "F4milia",
  },
  /**
   * global-error.tsx replaces the root layout entirely, so it renders outside
   * every other surface. Copy is honest about what is and is not known: the
   * App Router exposes no status code to it, so it must not claim one.
   */
  globalError: {
    eyebrow: "Error",
    title: "Something broke.",
    body: "The page could not be rendered. The error has been reported. Reloading may work; if it does not, the problem is on our side.",
    reload: "Reload the page",
  },
  /**
   * The auth surfaces (S1). Every string on the first screens anyone sees,
   * including the ones the server actions redirect with -- an error message is
   * UI copy wherever it is authored.
   *
   * The consent notice is carried over verbatim from the previous signup page
   * rather than rewritten: it describes an actual platform behaviour
   * (docs/data-retention-policy.md), so it is not placeholder legal text and
   * invariant 11's "[PENDING LEGAL REVIEW]" marker does not apply to it. It
   * must also not drift toward reading like terms -- tests/auth-screens.test.ts
   * guards that.
   */
  auth: {
    login: {
      eyebrow: "Sign in",
      title: "Welcome back.",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Log in",
      switchPrompt: "No account yet?",
      switchAction: "Create one",
    },
    signup: {
      eyebrow: "New account",
      title: "Make your account.",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Sign up",
      switchPrompt: "Already have an account?",
      switchAction: "Sign in instead",
      consent: {
        heading: "Before you continue",
        body: "F4milia's support staff can access content within your communities to help resolve issues you or an organizer report, and to keep the platform safe. This access is logged and limited to what's needed to help.",
        checkbox: "I understand platform staff may access my content for support purposes.",
      },
      errors: {
        consentRequired: "You must acknowledge the platform-access notice to sign up.",
        missingFields: "Email and password are required.",
      },
    },
    /**
     * Where signup lands now that confirmation is mandatory. Deliberately says
     * "the address you gave" rather than printing it back: this page is
     * reachable by URL, and the value came from an unauthenticated form.
     */
    checkEmail: {
      eyebrow: "One more step",
      title: "Check your email.",
      body: "We sent a link to the address you gave. Open it to confirm the address and finish making your account.",
      note: "The link works once and expires in an hour. Nothing arrived? Give it a minute, then look in the spam folder.",
      back: "Back to sign in",
    },
    confirm: {
      errors: {
        /**
         * One message for every failure -- expired, already used, malformed,
         * never issued. Telling them apart would make this route an oracle,
         * and none of the four changes what the person does next.
         */
        invalidLink: "That link is no longer valid. It may have expired or already been used — sign in to have a new one sent.",
      },
    },
  },
  orgNav: {
    /** §9: <aside> nav gets an aria-label. */
    landmark: "Main navigation",
    mobileMenu: "Menu",
    sections: {
      community: "Community",
      manage: "Manage",
    },
    items: {
      home: { label: "Home", description: "The shared feed" },
      mentorship: { label: "Mentorship", description: "Pairings and requests" },
      meetups: { label: "Meetups", description: "Gatherings and RSVPs" },
      videos: { label: "Videos", description: "Recorded sessions" },
      live: { label: "Live", description: "Streams in progress" },
      members: { label: "Members", description: "Who is here" },
      shop: { label: "Shop", description: "Products for sale" },

      invitations: { label: "Invitations", description: "Invite and remove" },
      products: { label: "Products", description: "Catalogue and pricing" },
      cohorts: { label: "Cohorts", description: "Smaller groups" },
      stages: { label: "Stages", description: "Progression and gating" },
      mentorshipSettings: { label: "Mentorship", description: "Pairing rules" },
      meetupsSettings: { label: "Meetups", description: "Scheduling rules" },
      videosSettings: { label: "Videos", description: "Uploads and moderation" },
      liveSettings: { label: "Live", description: "Stream access" },
      reports: { label: "Reports", description: "Reported posts" },
      memberReports: { label: "Member reports", description: "Reported members" },
      commerce: { label: "Commerce", description: "Payouts and Stripe" },

      allCommunities: { label: "All communities", description: "Everywhere you belong" },
    },
  },
} as const;
