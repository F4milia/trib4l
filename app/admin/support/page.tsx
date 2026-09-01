import { requirePlatformAdmin } from "@/lib/session";
import { withAdminAudit } from "@/lib/audit";
import { markSupportRequestHandled } from "@/app/actions/support";
import { Button, Card, PageHeader, StatusPip } from "@/components/ui";

/**
 * The minimal staff inbox H1's acceptance criterion requires -- "a submitted
 * form reaches the staff view and writes an audit row" -- and which
 * docs/v1-repo-audit.md found missing and re-cut into this session: "No staff
 * view exists -- app/admin holds one provisioning page... Cheapest correct slot:
 * re-cut H1's own scope to include the minimal staff inbox it needs."
 *
 * requirePlatformAdmin() resolves the role server-side from the database, via
 * an rpc that requires aal2. So this page is unreachable without a completed
 * second factor -- invariant 7's "2FA is ENFORCED for platform_staff" holding
 * at the surface, not only at sign-in. It also means nobody can demo this by
 * hand until S2 ships the MFA enrollment UI, which the audit predicted.
 *
 * The read goes through withAdminAudit(), and this is its first caller. Its own
 * docstring states the rule: "Every platform_admin code path that reads across
 * orgs must go through this -- RLS grants the bypass itself, but Postgres has no
 * hook to log a SELECT as it happens, so the log write has to be a required
 * step in the calling code instead." Reading every Family's support requests is
 * exactly such a path: the trigger on support_requests logs writes, and nothing
 * would otherwise record that a staff member read them.
 */
export default async function StaffSupportPage() {
  const { supabase } = await requirePlatformAdmin();

  const requests = await withAdminAudit(
    supabase,
    "support_requests.staff_list",
    { type: "support_requests" },
    async () => {
      const { data } = await supabase
        .from("support_requests")
        .select("id, subject, body, status, created_at, org_id, organizations(name), profiles(display_name)")
        .order("status")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  );

  const open = requests.filter((r) => r.status === "open");
  const handled = requests.filter((r) => r.status === "handled");

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <div>
        <PageHeader title="Support" eyebrow="Platform staff" />
        <p className="mt-2 text-sm text-deep-slate/70">
          Messages sent through the help page. Reading this list is recorded in the audit log.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
          Open · {open.length}
        </h2>
        {open.length === 0 ? (
          // Honest empty state. An empty queue is good news, and says so
          // without inventing a placeholder row.
          <p className="text-sm text-deep-slate/70">Nothing waiting.</p>
        ) : (
          <div className="space-y-3">
            {open.map((request) => (
              <Card key={request.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <p className="font-serif text-lg font-black uppercase leading-tight tracking-tight text-deep-slate">
                      {request.subject}
                    </p>
                    {/* Ledger voice: metadata in monospace. The Family reads
                        "no Family" rather than being left blank -- a request
                        from someone who belongs to nowhere is the case this
                        whole session exists for, and it should be legible as
                        that rather than as missing data. */}
                    <p className="font-mono text-[10px] uppercase tracking-widest text-deep-slate/50">
                      {new Date(request.created_at).toISOString().slice(0, 16).replace("T", " ")}
                      {" · "}
                      {request.profiles?.display_name ?? "deleted member"}
                      {" · "}
                      {request.org_id ? (request.organizations?.name ?? "unknown Family") : "no Family"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-deep-slate/80">{request.body}</p>
                  </div>
                  <form action={markSupportRequestHandled} className="shrink-0">
                    <input type="hidden" name="request_id" value={request.id} />
                    <Button type="submit" variant="ghost">
                      Mark handled
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
          Handled · {handled.length}
        </h2>
        {handled.length === 0 ? (
          <p className="text-sm text-deep-slate/70">Nothing handled yet.</p>
        ) : (
          <ul className="grid gap-px bg-deep-slate/20">
            {handled.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-4 bg-parchment p-4">
                <p className="min-w-0 truncate text-sm text-deep-slate">{request.subject}</p>
                <StatusPip label="Handled" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
