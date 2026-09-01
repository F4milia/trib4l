import { describe, expect, it, vi } from "vitest";
import { readEmailConfig } from "./config";
import { sendEmail, type OutboundMessage } from "./transport";

const MESSAGE: OutboundMessage = {
  to: "member@f4milia.test",
  subject: "You have been invited to a Family",
  html: "<p>Someone invited you.</p>",
  text: "Someone invited you.",
  kind: "family_invite",
};

const LIVE = readEmailConfig({
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM_ADDRESS: "F4milia <hello@mail.f4milia.test>",
  EMAIL_SENDING_DOMAIN: "mail.f4milia.test",
  RESEND_API_KEY: "re_test_key",
});

const REDIRECT = readEmailConfig({
  EMAIL_DELIVERY_MODE: "redirect",
  EMAIL_FROM_ADDRESS: "F4milia <staging@example.test>",
  EMAIL_TEST_INBOX: "staging-inbox@example.test",
  RESEND_API_KEY: "re_test_key",
});

const DRY_RUN = readEmailConfig({});

describe("sendEmail", () => {
  it("dry-run sends nothing and says so", async () => {
    const send = vi.fn();
    const outcome = await sendEmail(MESSAGE, { config: DRY_RUN, send });

    expect(send).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      delivered: false,
      mode: "dry-run",
      reason: "dry-run",
      to: "member@f4milia.test",
    });
  });

  it("live delivers to the real member", async () => {
    const send = vi.fn().mockResolvedValue("msg_1");
    const outcome = await sendEmail(MESSAGE, { config: LIVE, send });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].to).toBe("member@f4milia.test");
    expect(outcome).toMatchObject({ delivered: true, mode: "live", to: "member@f4milia.test" });
  });

  it("redirect delivers to the staging inbox and never to the member", async () => {
    // This is the pair E1's acceptance criterion asks for at once: "each
    // template renders and delivers in staging" AND "staging never sends real
    // mail". Redirect is what makes both true.
    const send = vi.fn().mockResolvedValue("msg_2");
    const outcome = await sendEmail(MESSAGE, { config: REDIRECT, send });

    expect(send.mock.calls[0][1].to).toBe("staging-inbox@example.test");
    expect(outcome).toMatchObject({ delivered: true, mode: "redirect", to: "staging-inbox@example.test" });
  });

  it("redirect records who the message was meant for, without touching the subject", async () => {
    // The staging inbox holds every member's mail at once, so a tester needs
    // to know which one they are reading. It goes in a header rather than a
    // subject prefix because the subject is itself under test and must render
    // exactly as a member would see it.
    const send = vi.fn().mockResolvedValue("msg_3");
    await sendEmail(MESSAGE, { config: REDIRECT, send });

    expect(send.mock.calls[0][1].intendedRecipient).toBe("member@f4milia.test");
    expect(send.mock.calls[0][1].subject).toBe(MESSAGE.subject);
  });

  it("live carries no intended-recipient header -- there is nothing to disambiguate", async () => {
    const send = vi.fn().mockResolvedValue("msg_4");
    await sendEmail(MESSAGE, { config: LIVE, send });

    expect(send.mock.calls[0][1].intendedRecipient).toBeNull();
  });
});
