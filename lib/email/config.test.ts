import { describe, expect, it } from "vitest";
import { EmailConfigError, domainOf, readEmailConfig } from "./config";

const LIVE = {
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM_ADDRESS: "F4milia <hello@mail.f4milia.test>",
  EMAIL_SENDING_DOMAIN: "mail.f4milia.test",
  RESEND_API_KEY: "re_test_key",
};

describe("domainOf", () => {
  it("reads the domain from a bare address and from a display-name form", () => {
    expect(domainOf("hello@mail.f4milia.test")).toBe("mail.f4milia.test");
    expect(domainOf("F4milia <hello@mail.f4milia.test>")).toBe("mail.f4milia.test");
    expect(domainOf("F4milia <HELLO@Mail.F4milia.Test>")).toBe("mail.f4milia.test");
  });

  it("returns null rather than a guess for something that is not an address", () => {
    expect(domainOf("not-an-address")).toBeNull();
    expect(domainOf("@leading")).toBeNull();
    expect(domainOf("trailing@")).toBeNull();
  });
});

describe("readEmailConfig", () => {
  it("defaults to dry-run when nothing is configured", () => {
    // The important half of this assertion is what it is NOT: an unset
    // environment must not fall through to live. A preview deployment and
    // production are both NODE_ENV=production, so guessing from that would
    // send real mail to real members from a branch build.
    expect(readEmailConfig({}).mode).toBe("dry-run");
  });

  it("dry-run needs no key and no from address", () => {
    const config = readEmailConfig({ EMAIL_DELIVERY_MODE: "dry-run" });
    expect(config.mode).toBe("dry-run");
    expect(config.apiKey).toBeNull();
  });

  it("rejects a mode it does not recognise instead of falling back", () => {
    expect(() => readEmailConfig({ EMAIL_DELIVERY_MODE: "test" })).toThrow(EmailConfigError);
  });

  it("accepts a live config whose from address is on the verified domain", () => {
    const config = readEmailConfig(LIVE);
    expect(config.mode).toBe("live");
    expect(config.sendingDomain).toBe("mail.f4milia.test");
  });

  it("refuses live when the from address is outside the verified domain", () => {
    // SPF and DKIM align on the domain. A From address elsewhere produces mail
    // that fails both and lands in spam -- a failure that reads as "our email
    // is unreliable" rather than as a misconfiguration, which is why this
    // throws instead of warning.
    expect(() =>
      readEmailConfig({ ...LIVE, EMAIL_FROM_ADDRESS: "hello@f4milia.test" }),
    ).toThrow(/SPF\/DKIM would not align/);
  });

  it("refuses live without a verified domain named at all", () => {
    expect(() => readEmailConfig({ ...LIVE, EMAIL_SENDING_DOMAIN: "" })).toThrow(EmailConfigError);
  });

  it("refuses live without an API key", () => {
    expect(() => readEmailConfig({ ...LIVE, RESEND_API_KEY: "" })).toThrow(EmailConfigError);
  });

  it("refuses redirect without somewhere to redirect to", () => {
    expect(() =>
      readEmailConfig({ ...LIVE, EMAIL_DELIVERY_MODE: "redirect", EMAIL_TEST_INBOX: "" }),
    ).toThrow(EmailConfigError);
  });

  it("redirect does not require the from address to be on the verified domain", () => {
    // Staging sends from wherever staging sends from; the deliverability
    // guarantee only has to hold where real members receive mail.
    const config = readEmailConfig({
      ...LIVE,
      EMAIL_DELIVERY_MODE: "redirect",
      EMAIL_FROM_ADDRESS: "staging@example.test",
      EMAIL_TEST_INBOX: "staging-inbox@example.test",
    });
    expect(config.mode).toBe("redirect");
    expect(config.testInbox).toBe("staging-inbox@example.test");
  });
});
