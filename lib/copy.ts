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
    /**
     * The reveal toggle's accessible name. It flips with the state: a control
     * still called "Show password" while the password is showing reads as a
     * lie to anyone navigating by name alone.
     */
    passwordToggle: {
      show: "Show password",
      hide: "Hide password",
    },
    login: {
      eyebrow: "Sign in",
      title: "Welcome back.",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Log in",
      switchPrompt: "No account yet?",
      switchAction: "Create one",
      errors: {
        emailRequired: "Enter your email address.",
        passwordRequired: "Enter your password.",
        /**
         * One message, above the form, for every credential failure. GoTrue
         * returns the same `invalid_credentials` whether the password was
         * wrong or the address has no account -- so this must not hint at
         * either. Phrased as the PAIR not matching, which is the only thing
         * that is actually known.
         */
        invalidCredentials: "That email and password do not match an account.",
      },
      magicLinkPrompt: "Rather not type a password?",
      magicLinkAction: "Email me a sign-in link",
      forgotAction: "Forgotten your password?",
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
        emailRequired: "Enter an email address.",
        passwordRequired: "Choose a password.",
        invalidEmail: "Enter a valid email address.",
        /** The number here is asserted against minimum_password_length in
         *  supabase/config.toml, so the two cannot drift apart. */
        weakPassword: "Use at least 6 characters.",
        failed: "That did not work. Check the details and try again.",
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
      body: "If that address can be used, a confirmation link is on its way. Open it to confirm the address and finish making your account.",
      note: "The link works once and expires in an hour. Nothing arrived? Give it a minute, then look in the spam folder.",
      back: "Back to sign in",
    },
    magicLink: {
      eyebrow: "Sign-in link",
      title: "Email me a link.",
      emailLabel: "Email",
      body: "We send a one-time link to your address. Opening it signs you in.",
      submit: "Send the link",
      back: "Back to sign in",
      errors: {
        missingEmail: "An email address is required.",
      },
    },
    /**
     * Deliberately conditional -- "if that address has an account". The form
     * behind it does not create accounts, so a definite "we sent you a link"
     * would be a claim this page cannot make, and a definite "no such account"
     * would answer a question a stranger should not get to ask.
     */
    linkSent: {
      eyebrow: "Sent",
      title: "Check your email.",
      body: "If that address has an account, a sign-in link is on its way.",
      note: "The link works once and expires in an hour. It signs in an existing account only.",
      back: "Back to sign in",
      switchPrompt: "New here?",
      switchAction: "Make an account",
    },
    /**
     * Provider names are brand names, but they are still strings on a screen,
     * so they live here rather than in lib/auth/providers.ts -- that file
     * carries ids and environment variable names, which are not copy.
     */
    oauth: {
      dividerLabel: "or",
      continueWith: "Continue with",
      providers: {
        google: "Google",
        apple: "Apple",
      },
      errors: {
        failed: "That sign-in did not complete. Try again, or use your email address.",
        cancelled: "Sign-in was cancelled. Nothing changed.",
      },
    },
    forgotPassword: {
      eyebrow: "Password",
      title: "Reset it.",
      body: "We send a one-time link to your address. Opening it lets you choose a new password.",
      emailLabel: "Email",
      submit: "Send the link",
      back: "Back to sign in",
      errors: {
        missingEmail: "An email address is required.",
      },
    },
    /** Same conditional phrasing, and the same reason, as linkSent. */
    resetSent: {
      eyebrow: "Sent",
      title: "Check your email.",
      body: "If that address has an account, a link to choose a new password is on its way.",
      note: "The link works once and expires in an hour. Your current password keeps working until you set a new one.",
      back: "Back to sign in",
    },
    resetPassword: {
      eyebrow: "Password",
      title: "Choose a new one.",
      body: "This link signed you in. Set a new password to finish.",
      passwordLabel: "New password",
      confirmLabel: "New password again",
      submit: "Save the new password",
      errors: {
        /**
         * Reached when the recovery link was never opened, has expired, or was
         * already used -- the page is a plain URL, so it is reachable with no
         * recovery session at all.
         */
        noSession: "That reset link is no longer valid. Ask for a new one.",
        passwordRequired: "Choose a new password.",
        confirmationRequired: "Enter the new password again.",
        mismatch: "This does not match the password above.",
        weakPassword: "Use at least 6 characters.",
        failed: "That did not work. Try again.",
      },
    },
    changeEmail: {
      eyebrow: "Account",
      title: "Change your address.",
      currentLabel: "Current address",
      newLabel: "New address",
      body: "Both addresses have to confirm before anything changes. Until they both do, the current one keeps working.",
      submit: "Send the confirmations",
      back: "Back",
      /** §9: a save confirmation is announced through role="status". */
      sent: "Sent. Open the link in both inboxes — the old address and the new one. Nothing changes until both are confirmed.",
      errors: {
        missingEmail: "A new email address is required.",
        unchanged: "That is already the address on this account.",
      },
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
  /**
   * Transactional email (E1). Every string here is fixed. None of it is
   * interpolated from a Family, a member, a Table entry or a message --
   * CLAUDE.md invariant 3: "Emails and pushes name the event, never the
   * content. Assume the inbox may be shared."
   *
   * That extends to Family and member NAMES, which the S1 prompt rules out in
   * so many words ("Verification emails carry no Family names or content").
   * An invitation therefore says that you have been invited; which Family, and
   * by whom, is behind the link where only the holder of the token sees it.
   */
  email: {
    invite: {
      eyebrow: "Invitation",
      subject: "You have been invited to a Family",
      heading: "Someone saved you a seat",
      body: [
        "A Family on F4milia has invited you to join them.",
        "The invitation names the Family once you open it. It expires in fourteen days.",
      ],
      action: "Open the invitation",
      footnote: "If you were not expecting this, ignore it and nothing happens.",
    },
    familyNight: {
      eyebrow: "Family Night",
      subject: "Your Family Night digest is ready",
      heading: "This week is written up",
      body: ["Your Family's week has been gathered into a digest. It is waiting for you."],
      action: "Read the digest",
      footnote: "You can turn this off for this Family in your notification settings.",
    },
    vow: {
      eyebrow: "Vow",
      subject: {
        assigned: "A Vow is yours this rotation",
        due_soon: "Your Vow is due soon",
        completed: "A Vow was completed",
      },
      heading: {
        assigned: "The Vow comes to you",
        due_soon: "Your Vow closes shortly",
        completed: "The Vow is kept",
      },
      body: {
        assigned: ["The rotation has reached you. Details are on your Vow."],
        due_soon: ["The window on your current Vow is closing."],
        completed: ["A Vow in your Family has been completed."],
      },
      action: "Open the Vow",
      footnote: "You can turn this off for this Family in your notification settings.",
    },
    passwordReset: {
      eyebrow: "Account",
      subject: "Reset your F4milia password",
      heading: "Set a new password",
      body: [
        "Use the button below to choose a new password. The link works once and expires in one hour.",
        "If you did not ask for this, your password has not changed and no action is needed.",
      ],
      action: "Choose a new password",
      footnote: "This message is about your account, not about any Family.",
    },
  },
  /**
   * The help page (H1). Every answer below is a statement about behaviour that
   * exists in this repo today, checked against the code or against
   * docs/data-retention-policy.md before being written down -- CLAUDE.md's
   * "honest empty states, no invented placeholders" applies at least as
   * strongly to a page that tells people how the product works.
   *
   * Deliberately absent: anything about Towers, Bricks, Vows, the Table or the
   * Ledger. None of those exist in the schema yet, and a help page that
   * explains features nobody can use is worse than one that stays quiet about
   * them.
   */
  help: {
    eyebrow: "Support",
    title: "Help",
    intro: "Answers to what comes up most, and a way to reach the F4milia team directly.",

    faqHeading: "Common questions",
    faq: [
      {
        q: "How do I join a Family?",
        a: "By invitation only. An organizer sends an invitation to your email address; once you sign in with that same address, the invitation appears on your home page and you accept it there. Invitations expire fourteen days after they are sent.",
      },
      {
        q: "I was invited, but I cannot see the invitation.",
        a: "An invitation is matched to the exact address it was sent to, so sign in with that address rather than another one. If it was sent more than fourteen days ago it has expired and an organizer needs to send a new one.",
      },
      {
        q: "Can I turn off emails from one Family but not another?",
        a: "Yes. Notification settings are kept per Family rather than as one switch, so muting one leaves the others exactly as they were. Muting one kind of notification also leaves the other kinds alone.",
      },
      {
        q: "Who can read what I send through this form?",
        a: "You and F4milia's platform team. The organizers of your Family cannot read support requests, on purpose — you may be writing to us about them.",
      },
      {
        q: "Will you email me what people write in my Family?",
        a: "No. Our emails name what happened and never quote it, because an inbox is often shared or read over someone's shoulder. To read anything, you sign in.",
      },
      {
        q: "What happens to my things if I delete my account?",
        a: "Your name and picture are removed and your profile is marked deleted. Things you contributed to a Family stay, attributed to a deleted member rather than to you, and records that have to outlive an account — your membership history, and anything financial — are kept.",
      },
    ],

    formHeading: "Send us a message",
    formIntro: "We read every message. Replies come by email to the address on your account.",
    familyLabel: "Which Family is this about?",
    familyNone: "Not about a specific Family",
    subjectLabel: "Subject",
    bodyLabel: "What is going on?",
    submit: "Send message",

    sent: "Message sent. We will reply by email to the address on your account.",
    yoursHeading: "Your messages",
    yoursEmpty: "You have not sent us anything yet.",
    statusOpen: "Open",
    statusHandled: "Handled",

    errors: {
      subjectRequired: "Please give the message a subject.",
      bodyRequired: "Please tell us what is going on.",
      notYourFamily: "That is not a Family you belong to.",
      failed: "The message could not be sent. Please try again.",
    },
  },
} as const;
