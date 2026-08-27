import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { Button, Card, ErrorText, Input, Label, PageHeader } from "@/components/ui";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader title="Sign up" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <form action={signUp} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input type="email" name="email" id="email" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input type="password" name="password" id="password" required minLength={6} />
          </div>

          <div className=" bg-muted border border-terracotta/40 p-4 space-y-3">
            <h2 className="font-serif text-lg text-baked-clay">Before you continue</h2>
            <p className="text-sm text-deep-slate/70">
              F4milia&apos;s support staff can access content within your communities to help
              resolve issues you or an organizer report, and to keep the platform safe. This
              access is logged and limited to what&apos;s needed to help.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" required className="mt-1" />
              <span>I understand platform staff may access my content for support purposes.</span>
            </label>
          </div>

          <Button type="submit" className="w-full">
            Sign up
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-deep-slate/70">
        Already have an account?{" "}
        <Link href="/login" className="text-terracotta underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
