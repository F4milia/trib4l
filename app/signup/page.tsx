import { signUp } from "@/app/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Sign up</h1>
      {error ? <p role="alert">{error}</p> : null}
      <form action={signUp}>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" required minLength={6} />
        </label>

        <section>
          <h2>Before you continue</h2>
          <p>
            F4milia&apos;s support staff can access content within your communities
            to help resolve issues you or an organizer report, and to keep the
            platform safe. This access is logged and limited to what&apos;s
            needed to help.
          </p>
          <label>
            <input type="checkbox" name="consent" required />I understand platform
            staff may access my content for support purposes.
          </label>
        </section>

        <button type="submit">Sign up</button>
      </form>
      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
