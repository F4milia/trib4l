# QA — C2-PR4b · Threads and attachments

Preview URL: <filled by dev from the PR>
Fixtures used: `alice@f4milia.test`, `bob@f4milia.test` (both Caregiver Circle).

## Primary check

Two surfaces whose automated tests all mock the network. What a human adds is
the part the mocks cannot reach: **a real file into a real private bucket, and
back out again.**

Two browsers side by side, or one plus a private window.

**Threads (steps 1–5)**

1. As A, send a message. As B, click **Reply** under it.
   **Expect:** a "Replying to Alice" banner above the composer, and the
   composer's label changes to **Reply**.
2. Type a reply and send it.
   **Expect:** the banner disappears. In A's window the parent now shows
   **1 reply**, collapsed.
3. As A, click **1 reply**.
   **Expect:** the reply appears, indented, with a left rule.
4. Under the reply itself, look for a Reply button.
   **Expect:** there is none. One level only.
5. As B, click **Reply**, type something, then click **Cancel reply**.
   **Expect:** the banner goes, **the text you typed stays**.

**Attachments (steps 6–12)**

6. As A, click **Attach a file** and choose any file **over 5 MB**.
   **Expect:** *"That file is larger than the 5 MB limit."* — instantly, with
   no network delay.
7. Choose a **video** file (any size).
   **Expect:** *"That file type cannot be attached. Images, PDFs and text files
   only."*
8. Choose a **photo under 5 MB**.
   **Expect:** the filename appears with a **Remove attachment** control, and
   no error.
9. Type a message and send.
   **Expect:** the message appears in both windows. In A's, the attachment
   appears beneath it, showing the **original filename** — not a uuid-prefixed
   one — and its size in monospace.
10. In **B's** window, reload, then click the attachment.
    **Expect:** it downloads or opens in a new tab. This is the real proof: the
    bucket is private, so the file is only reachable through a signed URL that
    B's own session was allowed to mint.
11. Open DevTools → Network **before** reloading the room, then reload.
    **Expect:** **no** `sign` request for the attachment until you click it.
    Signing on render would be one request per attachment just to paint.
12. Sign in as `carol@f4milia.test` (Founder Collective) and open the same
    preview URL for Caregiver Circle's room.
    **Expect:** she cannot reach the room at all, so the attachment is
    unreachable with it.

## Regression (previous two sessions)

- [ ] `#121` threads: reactions still work on both a parent and a reply.
- [ ] `#120` mentions: typing `@` still opens the member list, and Enter picks
      rather than sends.
- [ ] `#108` Realtime Authorization: typing indicators still appear between
      participants.

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
