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
  /** ConfirmSubmit's shared control. Every destructive action reuses it. */
  confirm: {
    cancel: "Cancel",
  },
  /**
   * Memorial-lock.
   *
   * Says what is true and nothing more. It does not say "deceased", because the
   * person reading it is likely someone close to them and does not need to be
   * told; it does not apologise, because nothing went wrong; and it does not
   * invite them to try again, because they cannot. "Memorialised" is the word
   * the Family will have used when they asked for it.
   *
   * No legal wording: whether a family or an executor has any say after death
   * varies by country, and that is for counsel rather than for this deck.
   */
  memorial: {
    signInRefused:
      "This account has been memorialised. It cannot be signed in to, and everything on it stays as it is.",
  },
  /**
   * Account deletion (S2).
   *
   * The consequences list is the honest one, which means it is longer than a
   * marketing version would be. It says what goes, what STAYS, and that there is
   * no undo -- because docs/trib4l-docs/data-retention-policy.md deliberately
   * keeps content and severs the person from it, and someone who expects "delete"
   * to mean "erase everything I wrote" would be misled by a shorter list.
   *
   * It does not use the word "anonymize": that is our vocabulary for the policy,
   * not a description anyone can act on. "Your name is removed from them" is the
   * same fact in words that mean something to the person reading it.
   */
  deleteAccount: {
    eyebrow: "Account",
    title: "Delete your account.",
    lead: "This cannot be undone. Read what happens before you decide.",
    trigger: "Delete my account",
    dialogTitle: "Delete this account?",
    consequences: [
      "You are signed out of every device and cannot sign in again.",
      "Your name and picture are removed from everything you have written.",
      "What you wrote stays where it is, without your name on it — a conversation with the middle torn out is worse for the people still in it.",
      "Your Families keep their records of who did what, and when.",
      "There is no undo, and no way for us to put your name back.",
    ],
    confirm: "Delete my account",
    /** Shown on /login after the deletion completes. Deliberately does not
     *  invite them to sign in again, because they cannot. */
    signedOutNotice: "That account has been deleted. You cannot sign in with it again.",
    errors: {
      failed: "The account could not be deleted. Nothing has changed. Try again.",
      alreadyDeleted: "That account is already deleted.",
    },
  },
  /**
   * The sign-in code screen (S2).
   *
   * Says "the app on your phone", not "your TOTP factor". A person arriving here
   * has just typed a correct password and is being asked for more; the copy's job
   * is to make that feel expected rather than like a failure. It does not say
   * "verification required", which reads as an accusation.
   */
  assurance: {
    eyebrow: "One more step",
    title: "Enter your code.",
    body: "Open the app on your phone and type the six digits it shows.",
    codeLabel: "Six-digit code",
    submit: "Continue",
    signOut: "Sign out instead",
    /** Shown to staff who have no authenticator at all. Not a scolding: it says
     *  what is true and what to do, and does not pretend this is optional. */
    staffMustEnrol:
      "Two-factor is required for platform staff. Set up an authenticator to continue.",
    errors: {
      codeRequired: "Enter the six-digit code.",
      wrongCode: "That code was not accepted. Codes expire every 30 seconds — try the current one.",
      challengeFailed: "The code could not be checked. Try again.",
    },
  },
  /**
   * Two-factor authentication (S2).
   *
   * Says "authenticator app", not "TOTP" or "2FA" in body copy: the person is
   * looking for the thing on their phone, not the acronym. The heading keeps
   * "Two-factor" because that is what every other service calls the setting, and
   * a novel name for a standard feature is its own obstacle.
   *
   * The staff line is stated as a fact about the account, not as a warning, and
   * it is honest that this is not optional for them.
   */
  mfa: {
    eyebrow: "Security",
    title: "Two-factor sign-in.",
    lead: "A six-digit code from an authenticator app, on top of your password.",
    optionalNote: "Optional for members. Required for platform staff.",
    staffRequiredNote:
      "Your account is platform staff, so two-factor is required. Until it is set up, you can reach this page and nothing else.",
    none: "No authenticator is set up on this account.",
    /**
     * Shown when this account already has an authenticator but has not used it
     * in this session. Measured 2026-09-01: GoTrue REFUSES to enrol another
     * factor from an aal1 session, and refuses to remove one, so offering either
     * here would be offering an action that cannot succeed -- which is how this
     * was found: the page said "Setup could not be started. Try again." and
     * trying again would never have worked.
     */
    needsCodeFirst: "Enter a code from your authenticator to change these settings.",
    enterCode: "Enter a code",
    activeHeading: "Authenticators",
    added: "Added",
    remove: "Remove",
    removed: "That authenticator was removed.",
    start: "Set up an authenticator",
    scan: {
      heading: "Scan this",
      body: "Open your authenticator app and scan the square. If you cannot scan, enter the key below by hand.",
      secretLabel: "Setup key",
      codeLabel: "Six-digit code from the app",
      submit: "Turn on two-factor",
      cancel: "Start again",
    },
    done: "Two-factor is on. You will be asked for a code when you sign in.",
    errors: {
      enrollFailed: "Setup could not be started. Try again.",
      setupExpired: "That setup is no longer valid. Start again.",
      wrongCode: "That code was not accepted. Codes expire every 30 seconds — try the current one.",
      verifyFailed: "The code could not be checked. Try again.",
      removeFailed: "That request did not name an authenticator.",
      removeNeedsVerify:
        "Removing an authenticator needs a verified sign-in. Sign out, sign in with a code, then remove it.",
    },
  },
  /**
   * The account settings index (S2).
   *
   * It exists because /account/email and /settings/blocked already shipped
   * reachable ONLY by typing the URL -- grep finds no link to either from
   * anywhere in app/ or components/. S2 adds two more surfaces of the same kind,
   * and a session list or an account-deletion page nobody can find protects
   * nobody. Descriptions say what each destination actually does; no invented
   * placeholders for surfaces that do not exist yet.
   */
  settingsIndex: {
    eyebrow: "Account",
    title: "Your account.",
    lead: "Settings that follow you across every Family you belong to.",
    links: [
      { href: "/account/email", label: "Email address", description: "Change it, with confirmation from both inboxes" },
      { href: "/settings/security", label: "Two-factor sign-in", description: "A code from an authenticator app, on top of your password" },
      { href: "/settings/sessions", label: "Sessions", description: "Every device signed in, and how to end one" },
      { href: "/settings/blocked", label: "Blocked people", description: "Who you have blocked, everywhere" },
      { href: "/settings/account", label: "Delete your account", description: "What happens, and what stays, before you decide" },
    ],
  },
  /**
   * Session management (S2).
   *
   * The wording on sign-out-everywhere is deliberately narrower than the
   * feature's name, because the name over-promises. Measured 2026-09-01: after
   * revocation GoTrue answers 403 for the old token, so every page load and
   * every action is refused -- but PostgREST checks only a JWT's signature and
   * expiry, so something holding the RAW access token outside the SDK can still
   * read the Data API until it expires. "Other devices lose access the next time
   * they load a page" is true. "You are instantly signed out everywhere" is not,
   * and this deck does not say it.
   */
  sessions: {
    eyebrow: "Security",
    title: "Where you are signed in.",
    lead: "Every device holding a live sign-in for this account. If you do not recognise one, end it.",
    empty: "No other sessions. This device is the only one signed in.",
    /**
     * When the list could not be read at all.
     *
     * Separate from `empty` because conflating them makes the page lie. Found the
     * hard way: a stale PostgREST schema cache made the RPC fail, the page
     * rendered `empty`, and it told someone with live sessions elsewhere that
     * this device was the only one signed in -- on a security page, where that is
     * exactly the fact they came to check. CLAUDE.md's honest-empty-states rule
     * covers this precisely: an empty state must mean empty.
     */
    unavailable:
      "Your sessions could not be read just now. Reload the page. Signing out everywhere still works.",
    thisDevice: "This device",
    signOutOne: "Sign out",
    revokedOne: "That session was ended.",
    revokedAlready: "That session had already ended.",
    /** Column labels for the mono metadata rail. */
    labels: {
      lastActive: "Last active",
      started: "Started",
      unknownDevice: "Device not recorded",
      unknownIp: "IP not recorded",
      twoFactor: "2FA verified",
    },
    signOutAll: {
      trigger: "Sign out everywhere",
      title: "End every session?",
      consequences: [
        "Every device signed in to this account is signed out, including this one.",
        "Other devices lose access the next time they load a page.",
        "Nothing else changes: your account, your Families and your content are untouched.",
      ],
      confirm: "End every session",
    },
    errors: {
      missingId: "That request did not name a session.",
      revokeFailed: "That session could not be ended. Try again.",
      signOutAllFailed: "Sessions could not be ended. Try again.",
    },
  },
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
    /**
     * One string for every rate-limited auth endpoint (S2), and one for a
     * reason: it must be true on all of them and reveal nothing on any.
     *
     * It does not say which limit was hit, whether the address has an account,
     * or how long is left. "Five attempts per fifteen minutes for this address"
     * would tell a prober exactly how to pace themselves, and a countdown on
     * the address bucket would confirm the address exists. It says what
     * happened and what to do, which is all a legitimate person needs -- the
     * same reasoning as the deliberately indistinguishable magic-link and
     * password-reset copy.
     */
    rateLimit: {
      tooManyAttempts: "Too many attempts. Wait a few minutes and try again.",
    },
    /**
     * When Turnstile's check has not completed (S2). One string, all four
     * captcha-guarded forms.
     *
     * This exists because the failure is REACHABLE by an ordinary person, not
     * only by a bot. Measured in a real browser 2026-09-01: the token arrives
     * 2.7 SECONDS after /login loads, and a returning visitor whose password
     * manager fills both fields can submit inside that window. Without this
     * message they would get "that email and password do not match an account"
     * for a correct password -- a lie the app would be telling about their
     * credentials because of its own timing.
     *
     * Says nothing about captchas, Cloudflare, or tokens: none of those are
     * the person's problem, and "the check" is what they can act on. Naming the
     * vendor would also tell a prober which service to study.
     */
    captcha: {
      notCompleted: "The security check did not finish. Try again in a moment.",
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
  /**
   * D1 — the member home dashboard. Six elements, per the run doc: today's
   * Table prompt status, their claimed Bricks with due windows, the Family's
   * Tower progress, the current Vow holder, the streak, and recent Ledger
   * highlights.
   *
   * The empty states are the interesting half. Every one says what is actually
   * true and offers nothing invented — a Family between Towers is in a real
   * state (F3.5 calls it a quiet season), not a broken one.
   */
  dashboard: {
    eyebrow: "Home",
    /**
     * §9: a landmark needs an accessible name, and this page has two
     * complementary regions once the org shell sidebar is counted. Without
     * this the two are indistinguishable to a screen reader — and to a test,
     * which is how it was found.
     */
    railLandmark: "Family summary",
    tableHeading: "Today at the Table",
    tableWritten: "You have written today.",
    tableUnwritten: "You have not written today.",
    /**
     * Spec §10.4 does not say where prompts come from — platform-authored,
     * Family-authored, seasonal or rotating — and no job assigns one per day
     * yet. So this card reports the member's STATUS, which is what the run doc
     * asks for, and names a prompt only when their own entry carries one.
     * Inventing a selection rule here would be inventing product.
     */
    tableNoPrompt: "No prompt is set for today.",
    towerHeading: "The Tower",
    towerProgress: "Bricks laid",
    towerEmpty: "No Tower yet. A Family between Towers is a quiet season, not a gap.",
    towerNoBricks: "No Bricks yet. Progress shows once the Builds have work in them.",
    bricksHeading: "Your Bricks",
    bricksEmpty: "Nothing claimed. Open Bricks are on the Family board.",
    bricksNoDue: "No date",
    bricksOverdue: "Overdue",
    vowHeading: "The Vow",
    vowHolder: "Held by",
    vowEmpty: "No Vow is being held right now.",
    streakHeading: "Streak",
    streakUnit: "days at the Table",
    streakNote: "A missed day holds the streak. It never resets.",
    ledgerHeading: "The Ledger",
    ledgerEmpty: "Nothing recorded yet. The Ledger fills as the Family works.",
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
      home: { label: "Home", description: "Your Family at a glance" },
      // The inherited Trib4l posts feed, moved off `/o/[slug]` so D1's
      // dashboard can take the route a member lands on daily. `home`'s
      // description above stops being true when the dashboard lands and is
      // corrected in that PR, not this one.
      feed: { label: "Feed", description: "Posts and comments" },
      /**
       * FROM HERE, RETAINED BUT NO LONGER LINKED — Mentorship, Meetups,
       * Videos, Live, Shop, and the Manage entries for Products, Cohorts,
       * Stages, the four *Settings keys and Commerce.
       *
       * lib/org-nav.ts stopped offering them when the nav was trimmed to
       * F4milia's own concepts. Kept rather than deleted because the routes
       * still exist and still work — only the signposts are gone — so
       * re-linking any of them is a one-line change in org-nav.ts rather than
       * a copy round-trip. They remain honest descriptions of real
       * destinations, which is what tests/org-nav.test.ts's deck census
       * asserts; an unlinked entry breaks nothing there.
       */
      mentorship: { label: "Mentorship", description: "Pairings and requests" },
      meetups: { label: "Meetups", description: "Gatherings and RSVPs" },
      videos: { label: "Videos", description: "Recorded sessions" },
      live: { label: "Live", description: "Streams in progress" },
      members: { label: "Members", description: "Who is here" },
      messages: { label: "Messages", description: "The channel and your DMs" },
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
  /**
   * Conversations (C1).
   *
   * Deliberately plain. A chat surface invents more copy than any other kind
   * of screen -- placeholder banter, cheerful empty states, "say hi!" nudges --
   * and every one of those is a sentence the product puts in a Family's mouth.
   * These strings name what is there and stop.
   */
  conversations: {
    heading: "Messages",
    familyChannel: "Everyone",
    familyChannelDescription: "Every member of this Family is here.",
    directHeading: "Direct messages",
    /** Honest empty states: what is true, and what to do, with nothing invented. */
    noDirects: "No direct messages yet.",
    emptyRoom: "No messages in here yet.",
    emptyRoomChannel: "Nothing has been said in the Family channel yet.",
    loading: "Loading\u2026",
    composerLabel: "Message",
    composerPlaceholder: "Write a message",
    send: "Send",
    sending: "Sending\u2026",
    /** Shown under the composer once the cap is close, and again when passed. */
    remaining: (n: number) => `${n} characters left`,
    tooLong: "This message is too long to send.",
    /** One name, two names, then a count -- never a list that grows forever. */
    typing: (names: string[]) =>
      names.length === 1
        ? `${names[0]} is typing`
        : names.length === 2
          ? `${names[0]} and ${names[1]} are typing`
          : `${names.length} people are typing`,
    unreadLabel: (n: number) => `${n} unread`,
    /** The live region announcement. Names the sender, never the content. */
    announceNew: (name: string) => `New message from ${name}`,
    backToList: "All conversations",
    readBy: (n: number) => (n === 1 ? "Read by 1" : `Read by ${n}`),
    you: "You",
    unknownMember: "A former member",
    deleted: "This message was deleted.",

    /**
     * C2. Reactions and mentions.
     *
     * Same restraint as the strings above. A reaction bar is the other place a
     * chat product starts inventing tone -- "Nice one!", "React to show some
     * love" -- and every one of those is the product putting words in a
     * Family's mouth. These name the action and stop.
     */
    reactions: {
      /** The button that opens the picker. Not "React!" -- it is a verb, not a nudge. */
      add: "Add reaction",
      pickerLabel: "Choose a reaction",
      /**
       * The accessible label on each count. Screen readers hear the number and
       * whether it includes them, because the visual affordance for "you
       * reacted" is a border that a screen reader cannot see.
       */
      count: (emoji: string, n: number, includesYou: boolean) =>
        includesYou
          ? `${emoji}, ${n} including you. Activate to remove yours.`
          : `${emoji}, ${n}. Activate to add yours.`,
      /** A refusal, not a shrug: the member did something and it did not work. */
      failed: "That reaction did not save. Try again.",
    },

    /**
     * C2. Threading.
     *
     * A thread is a reply, not a "conversation within a conversation" -- the
     * strings stay at that scale deliberately. Anything grander invites the
     * feature to grow a sidebar, a title and an unread count of its own, none
     * of which anyone asked for.
     */
    thread: {
      reply: "Reply",
      /** On the button that expands replies. Counted, because "Replies" alone hides how many. */
      showReplies: (n: number) => (n === 1 ? "1 reply" : `${n} replies`),
      hideReplies: "Hide replies",
      /** Above the composer while a reply is in progress. */
      replyingTo: (name: string) => `Replying to ${name}`,
      cancelReply: "Cancel reply",
      /** The reply composer's own label, so it is not the same control as the room's. */
      composerLabel: "Reply",
      composerPlaceholder: "Write a reply",
    },

    /**
     * C2. Attachments.
     *
     * The refusals matter more than the labels here. An upload that fails is
     * the most common thing that happens to an upload, and "Something went
     * wrong" is the sentence that makes a member try the same file four times.
     * Each refusal below says which limit was hit and whether it is theirs to
     * fix -- the database already distinguishes the two ceilings, and throwing
     * that distinction away in the UI would waste it.
     */
    attachment: {
      add: "Attach a file",
      /** Named with the cap, so the limit is known before a file is chosen. */
      hint: "Images, PDFs and text files, up to 5 MB.",
      /** While it is going. Plain text, no shimmer -- the design system's rule. */
      uploading: "Attaching\u2026",
      remove: "Remove attachment",
      /** The per-file cap, hit before anything leaves the browser. */
      tooLarge: "That file is larger than the 5 MB limit.",
      /** A type the bucket refuses. Says what IS allowed rather than only what is not. */
      wrongType: "That file type cannot be attached. Images, PDFs and text files only.",
      /** Generic last resort. Everything above is more specific on purpose. */
      failed: "That file did not attach. The message was still sent.",
      /** On the download control. The name is the label; this is for screen readers. */
      download: (name: string) => `Download ${name}`,
      /** Monospace metadata, per the Ledger rule. */
      size: (bytes: number) =>
        bytes < 1024 * 1024
          ? `${Math.max(1, Math.round(bytes / 1024))} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`,
    },

    mentions: {
      /** Announced when the list opens, so it is not a silent change. */
      listLabel: "Members you can mention",
      /** Nothing invented: it says what is true and offers no alternative. */
      noMatches: "No members match.",
      /**
       * A mention notifies someone. Saying so once, at the point of choosing,
       * is the difference between a feature and a surprise.
       */
      hint: "Mentioning someone notifies them.",
    },
  },
} as const;
