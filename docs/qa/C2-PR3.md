# QA — C2-PR3 · Attachment storage, the two ceilings, and the blob delete

Preview URL: <filled by dev from the PR>
Fixtures used: `alice@f4milia.test`, `bob@f4milia.test` (Caregiver Circle),
`carol@f4milia.test` (Founder Collective only).

## Primary check

*"An attachment uploaded to Family A's channel is unreachable by URL from a
Family B session."* The automated proof is in
`tests/isolation/attachment-storage.test.ts`; what a human adds here is the
**URL in a real browser**, which is the form the criterion is actually worded
in and the one a signed URL or a cache could break independently of RLS.

There is no upload UI yet — C2 PR 4 builds it — so steps 1–3 use the Supabase
Studio storage browser at `http://localhost:54323` (or the preview project's).

1. In Studio → Storage, confirm a bucket named `family-attachments` exists and
   is marked **private**.
   **Expect:** private. A public bucket makes every step below meaningless.
2. Still in Studio, upload any small text file to
   `<caregiver-circle-org-id>/<family-channel-conversation-id>/qa-probe.txt`.
   **Expect:** upload succeeds.
3. In Studio, use "Get URL" to copy the object's public URL. Paste it into a
   **signed-out private browser window**.
   **Expect:** refused — not the file. A private bucket must not serve an
   unauthenticated request, whatever the path.
4. Sign in as `carol@f4milia.test` in that private window. Paste the URL again.
   **Expect:** still refused. Carol is authenticated but in another Family.
5. Sign in as `bob@f4milia.test` in a normal window and open the same URL.
   **Expect:** the file downloads. **This is the control** — without it,
   steps 3 and 4 are satisfied by a bucket that simply does not work.
6. In Studio, try to upload a file **larger than 5 MB** to the same folder.
   **Expect:** refused by the platform, with a size error. The cap is on the
   bucket row, so it holds even when the app forgets to check.
7. In Studio → Storage, delete `qa-probe.txt` when finished.

## Regression (previous two sessions)

- [ ] `#109` C2 schema: chat still works — A sends, B receives live, in both the
      Family channel and a DM.
- [ ] `#108` Realtime Authorization: typing indicators still appear between
      participants.
- [ ] `#107` PWA: the service worker still registers (DevTools → Application).

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
