import { deleteAccount } from "@/app/actions/account";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card, ErrorText, PageHeader } from "@/components/ui";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.deleteAccount;

/**
 * Account deletion (S2).
 *
 * A page of its own rather than a row on /settings, because the consequences
 * list is the substance here and it does not belong compressed into a link's
 * subtitle. Somebody arriving to delete their account should read five lines
 * before they click, and somebody arriving for anything else should not have a
 * delete button in their peripheral vision.
 *
 * Design system: §4.3 ramp B, single column, no grid -- there is one subject.
 * §4.7 rhythm. The consequences live inside ConfirmSubmit's dialog, so the page
 * itself stays quiet: no red panel, no warning iconography. The terracotta is on
 * the one control that does something.
 */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireUser();

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader eyebrow={t.eyebrow} title={t.title} />

      <p className="max-w-xl text-base text-deep-slate/70">{t.lead}</p>

      {error ? (
        <div className="mt-8">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      <Card className="mt-10">
        {/* The same list the dialog shows, on the page as well. A confirmation
            is the wrong place to READ five lines carefully -- it is where you
            check what you already understood. */}
        <ul className="space-y-3 text-sm">
          {t.consequences.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-terracotta" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8">
        <ConfirmSubmit
          action={deleteAccount}
          trigger={t.trigger}
          title={t.dialogTitle}
          consequences={t.consequences}
          confirmLabel={t.confirm}
        />
      </div>
    </main>
  );
}
