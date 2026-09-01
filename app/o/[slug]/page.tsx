import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { copy } from "@/lib/copy";
import { Card, Eyebrow, Masonry, PageHeader, Stamp, StatusPip } from "@/components/ui";

/**
 * D1 -- the member home dashboard. The screen a member lands on daily.
 *
 * Six elements, from the run doc: today Table prompt status, their claimed
 * Bricks with due windows, the Family Tower progress as stacked masonry, the
 * current Vow holder, the streak, and recent Ledger highlights.
 *
 * READ-ONLY, per the prompt. Nothing here writes, and there is deliberately no
 * composer: the Table entry composer is not built yet, so a button here would
 * lead nowhere.
 *
 * LAYOUT. Section 4.6 names this surface explicitly -- "Org home" is the
 * `lg:grid-cols-[1.5fr_1fr]` subject-plus-reference-rail archetype, where the
 * aside is consulted rather than worked in. The main column carries what a
 * member acts on (their Table, their Bricks, the Tower they are building); the
 * rail carries what they check (the Vow, the streak, the Ledger). The ratio is
 * the design system answer for this page, not a preference.
 *
 * A MENTOR SEES THE SAME SCREEN, and it degrades on its own. Elements 1, 3, 5
 * and 6 are Family-level and mean something to a mentor; elements 2 and 4 are
 * personal and render their honest empty states, because a mentor holds no
 * Bricks and writes no Table entry. No role branch is needed for that, and
 * adding one would decide a question spec 10.1 leaves open.
 */

/**
 * Every read this page makes, and every derived value, in one place outside
 * the component.
 *
 * Not a stylistic split: `Date.now()` is what decides whether a Brick is
 * overdue, and react-hooks/purity refuses an impure call in a component body
 * -- correctly, since a component that reads the clock while rendering is not
 * a function of its inputs. Loading here keeps the component pure and gives
 * the overdue flag a single definition rather than one per call site.
 */
async function loadDashboard(slug: string) {
  const { supabase, user } = await requireUser();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, active_tower_id")
    .eq("slug", slug)
    .maybeSingle();
  // RLS hides a Family from a non-member, so null covers both "does not exist"
  // and "exists, you are not in it" -- indistinguishable on purpose.
  if (!org) notFound();
  const orgId = org.id;

  // The caller own membership, resolved by profile rather than by org alone: a
  // member can read every membership row in their Family, so filtering only by
  // org_id would match several and maybeSingle would answer with none.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  // ------------------------------------------------------------- element 4
  // family_table_day resolves today against the Family own IANA timezone
  // rather than the server clock, and answers for the CALLING member.
  const { data: tableDayRows } = await supabase.rpc("family_table_day", { p_org_id: orgId });
  const tableDay = Array.isArray(tableDayRows) ? tableDayRows[0] : tableDayRows;

  // The prompt this member answered, when they have written. Not "the prompt
  // for today" in general: spec 10.4 does not say where prompts come from and
  // no job assigns one per day, so naming one here would invent product.
  const { data: todaysEntry } = tableDay?.entry_id
    ? await supabase
        .from("table_entries")
        .select("response_text, table_prompts(body)")
        .eq("id", tableDay.entry_id)
        .maybeSingle()
    : { data: null };

  // ------------------------------------------------------------- element 3
  const { data: tower } = org.active_tower_id
    ? await supabase
        .from("towers")
        .select("id, title, description, status")
        .eq("id", org.active_tower_id)
        .maybeSingle()
    : { data: null };

  // Progress is DONE BRICKS over TOTAL BRICKS across the Tower Builds, not
  // completed Builds over total. Twenty-four masonry bricks want a fine
  // grained ratio: with two Builds, closing one would light half the wall in a
  // single step, which reads as a bar pretending to be brickwork.
  const { data: towerBuilds } = tower
    ? await supabase.from("builds").select("id").eq("tower_id", tower.id)
    : { data: [] };
  const buildIds = (towerBuilds ?? []).map((b) => b.id);
  const { data: towerBricks } = buildIds.length
    ? await supabase.from("bricks").select("status").in("build_id", buildIds)
    : { data: [] };
  const brickTotal = (towerBricks ?? []).length;
  const brickDone = (towerBricks ?? []).filter((b) => b.status === "done").length;
  const filledBricks = brickTotal ? Math.round((brickDone / brickTotal) * 24) : 0;

  // ------------------------------------------------------------- element 2
  // Nulls last: a Brick with no date is not more urgent than one due tomorrow.
  const { data: myBricks } = membership
    ? await supabase
        .from("bricks")
        .select("id, description, due_at, status")
        .eq("assignee", membership.id)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false })
    : { data: [] };

  // ------------------------------------------------------------- element 6
  const { data: vow } = await supabase
    .from("vows")
    .select("id, commitment, status, holder_id")
    .eq("org_id", orgId)
    .neq("status", "complete")
    .maybeSingle();

  const { data: holder } = vow
    ? await supabase
        .from("memberships")
        .select("profile_id, profiles(display_name)")
        .eq("id", vow.holder_id)
        .maybeSingle()
    : { data: null };

  // The per-Family name wins over the global one: the same person can present
  // differently in each Family, which is the whole point of org_profiles.
  const { data: holderOrgProfile } = holder
    ? await supabase
        .from("org_profiles")
        .select("display_name")
        .eq("org_id", orgId)
        .eq("profile_id", holder.profile_id)
        .maybeSingle()
    : { data: null };

  const holderName = holderOrgProfile?.display_name ?? holder?.profiles?.display_name ?? null;

  // --------------------------------------------------------- elements 5, 1
  const { data: streak } = await supabase.rpc("family_streak", { p_org_id: orgId });

  const { data: ledger } = await supabase
    .from("ledger_events")
    .select("id, event_type, payload, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  const now = Date.now();

  return {
    org,
    tableDay,
    todaysEntry,
    tower,
    brickTotal,
    brickDone,
    filledBricks,
    // Overdue is decided here, once, against a clock read outside the render.
    bricks: (myBricks ?? []).map((brick) => ({
      ...brick,
      overdue: brick.due_at ? new Date(brick.due_at).getTime() < now : false,
    })),
    vow,
    holderName,
    streak: streak ?? 0,
    ledger: ledger ?? [],
  };
}

const SECTION_HEADING =
  "mb-4 border-b-2 border-deep-slate pb-3 font-black uppercase tracking-tight";

export default async function OrgHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const {
    org,
    tableDay,
    todaysEntry,
    tower,
    brickTotal,
    brickDone,
    filledBricks,
    bricks,
    vow,
    holderName,
    streak,
    ledger,
  } = await loadDashboard(slug);

  const t = copy.dashboard;

  return (
    // Section 4.3 ramp A, the editorial/dashboard ramp, inside section 4.2
    // max-w-6xl. One ramp per surface, kept.
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader eyebrow={t.eyebrow} title={org.name} />

      {/* Section 4.6, the Org home ratio. Never 50/50 -- the imbalance is the
          style, and the aside here is genuinely secondary. */}
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <div className="space-y-8">
          {/* --------------------------------------------------- element 4 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.tableHeading}</h2>
            <Card>
              {/* Pip PLUS the text it qualifies. §7.6 is explicit that a pip
                  must never be the only carrier of a status for sighted users
                  either -- it renders a bordered square and nothing else, so a
                  pip on its own says nothing to anybody looking at it. Found
                  by rendering the page rather than by reading the component. */}
              <div className="flex flex-wrap items-center gap-3">
                <StatusPip label={tableDay?.written ? t.tableWritten : t.tableUnwritten} />
                <span className="font-black">
                  {tableDay?.written ? t.tableWritten : t.tableUnwritten}
                </span>
                {tableDay?.family_date ? (
                  <span className="font-mono text-xs uppercase tracking-widest text-deep-slate/70">
                    {tableDay.family_date}
                  </span>
                ) : null}
              </div>
              {todaysEntry?.table_prompts?.body ? (
                <p className="mt-5 max-w-xl text-sm text-baked-clay">{todaysEntry.table_prompts.body}</p>
              ) : (
                <p className="mt-5 max-w-xl text-sm text-deep-slate/70">{t.tableNoPrompt}</p>
              )}
              {todaysEntry?.response_text ? (
                <p className="mt-3 max-w-xl">{todaysEntry.response_text}</p>
              ) : null}
            </Card>
          </section>

          {/* --------------------------------------------------- element 3 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.towerHeading}</h2>
            {tower ? (
              <Card treatment="dark">
                <Eyebrow className="text-hearth-ochre">{tower.status}</Eyebrow>
                <p className="mt-3 text-2xl font-black tracking-tight">{tower.title}</p>
                {tower.description ? (
                  <p className="mt-3 max-w-xl text-sm text-parchment/80">{tower.description}</p>
                ) : null}
                {brickTotal ? (
                  <>
                    {/* Section 7.9. The container carries the label; the
                        bricks themselves are decorative. */}
                    <Masonry
                      className="mt-6"
                      filled={filledBricks}
                      label={`${t.towerProgress}: ${brickDone} of ${brickTotal}`}
                    />
                    <p className="mt-4 font-mono text-xs uppercase tracking-widest text-parchment/70">
                      {brickDone} / {brickTotal} {t.towerProgress}
                    </p>
                  </>
                ) : (
                  <p className="mt-6 text-sm text-parchment/70">{t.towerNoBricks}</p>
                )}
              </Card>
            ) : (
              <Card treatment="flat">
                <p className="text-sm text-deep-slate/70">{t.towerEmpty}</p>
              </Card>
            )}
          </section>

          {/* --------------------------------------------------- element 2 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.bricksHeading}</h2>
            {bricks.length ? (
              <ul className="divide-y divide-deep-slate/15 border-2 border-deep-slate">
                {bricks.map((brick) => {
                  const overdue = brick.overdue;
                  return (
                    // Section 4.6 list-row grid: date block, content, status.
                    <li
                      key={brick.id}
                      className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 bg-parchment px-4 py-4"
                    >
                      <span
                        className={
                          overdue
                            ? "font-mono text-xs font-black uppercase tracking-widest text-terracotta"
                            : "font-mono text-xs uppercase tracking-widest text-deep-slate/70"
                        }
                      >
                        {brick.due_at
                          ? new Date(brick.due_at).toLocaleDateString("en-GB", {
                              month: "short",
                              day: "numeric",
                            })
                          : t.bricksNoDue}
                      </span>
                      <span className="text-sm">{brick.description}</span>
                      {overdue ? (
                        <Stamp>{t.bricksOverdue}</Stamp>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-deep-slate/70">
                          {brick.status.replace("_", " ")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Card treatment="flat">
                <p className="text-sm text-deep-slate/70">{t.bricksEmpty}</p>
              </Card>
            )}
          </section>
        </div>

        {/* ----------------------- the reference rail: consulted, not worked in */}
        <aside className="space-y-8" aria-label={t.railLandmark}>
          {/* --------------------------------------------------- element 6 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.vowHeading}</h2>
            {vow ? (
              <Card>
                <p className="max-w-xl">{vow.commitment}</p>
                <p className="mt-4 font-mono text-xs uppercase tracking-widest text-deep-slate/70">
                  {t.vowHolder} {holderName ?? "—"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <StatusPip label={vow.status.replace("_", " ")} />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-deep-slate/70">
                    {vow.status.replace("_", " ")}
                  </span>
                </div>
              </Card>
            ) : (
              <Card treatment="flat">
                <p className="text-sm text-deep-slate/70">{t.vowEmpty}</p>
              </Card>
            )}
          </section>

          {/* --------------------------------------------------- element 5 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.streakHeading}</h2>
            <Card>
              {/* Zero is a real answer and renders as a number, not as an empty
                  state: a Family that has not started has a streak of nought,
                  which is a different thing from having no streak. */}
              <p className="font-mono text-5xl font-black tracking-tighter text-terracotta">
                {streak}
              </p>
              <p className="mt-2 font-mono text-xs uppercase tracking-widest text-deep-slate/70">
                {t.streakUnit}
              </p>
              <p className="mt-4 text-sm text-baked-clay">{t.streakNote}</p>
            </Card>
          </section>

          {/* --------------------------------------------------- element 1 */}
          <section>
            <h2 className={SECTION_HEADING}>{t.ledgerHeading}</h2>
            {ledger.length ? (
              <ol className="space-y-4">
                {ledger.map((event) => {
                  // The payload shape is not specified anywhere, so a summary
                  // renders when one is present and the event type shows when
                  // it is not. Never a fabricated sentence.
                  const summary =
                    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
                      ? (event.payload as Record<string, unknown>).summary
                      : null;
                  return (
                    <li key={event.id} className="border-b border-deep-slate/15 pb-4 last:border-b-0">
                      {/* Ledger metadata in monospace, per the design constraints. */}
                      <p className="font-mono text-[10px] uppercase tracking-widest text-baked-clay">
                        {event.event_type.replace("_", " ")}
                        {" · "}
                        {new Date(event.created_at).toLocaleDateString("en-GB", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      {typeof summary === "string" ? <p className="mt-2 text-sm">{summary}</p> : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Card treatment="flat">
                <p className="text-sm text-deep-slate/70">{t.ledgerEmpty}</p>
              </Card>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
