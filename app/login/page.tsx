import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { Button, Card, ErrorText, Input, Label, PageHeading } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <PageHeading>Log in</PageHeading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <form action={signIn} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input type="email" name="email" id="email" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input type="password" name="password" id="password" required />
          </div>
          <Button type="submit" className="w-full">
            Log in
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-ink-soft">
        No account?{" "}
        <Link href="/signup" className="text-primary underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
