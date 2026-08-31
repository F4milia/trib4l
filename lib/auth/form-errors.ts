/**
 * What an auth form hands back to the screen.
 *
 * WHY SIGN-IN HAS NO FIELD-LEVEL CREDENTIAL ERROR, AND MUST NOT
 * Probed against a real GoTrue on 2026-08-30. Every one of these returns the
 * byte-identical `invalid_credentials` / "Invalid login credentials":
 *
 *   - a real address with the wrong password
 *   - an address with no account at all
 *   - a malformed address
 *   - an empty password
 *
 * So the server cannot know which field was wrong, and the only way to find
 * out would be to ask "does this address have an account?" first -- which is
 * precisely the account-enumeration oracle that /magic-link and
 * /forgot-password are both built to avoid. A credential failure is therefore
 * a FORM-level error, deliberately, and this file offers no way to attribute
 * one to a field.
 *
 * Everything the app determines for itself -- an empty field, a mismatched
 * confirmation, a missing acknowledgement -- is field-level, because there the
 * attribution is ours and costs nothing.
 */
export type AuthField = "email" | "password" | "passwordConfirmation" | "consent";

/**
 * What gets typed back into the form after a failed submission -- and, by its
 * shape, what does not.
 *
 * React 19 RESETS an uncontrolled `<form action>` once the action resolves.
 * Measured in a browser on 2026-08-30: without this, a person who submitted
 * with an empty password lost the email they had just typed, was told "enter
 * your email address" on the next attempt, and could never get both fields
 * populated at once. Unit tests cannot see it -- jsdom does not perform the
 * form-action reset -- which is why it survived a green suite.
 *
 * Because the reset restores each field to its DEFAULT value, echoing the
 * value back as `defaultValue` is what makes it survive.
 *
 * THERE IS DELIBERATELY NO PASSWORD FIELD HERE. A password echoed back would
 * be rendered into the markup and live in the client component tree; clearing
 * it on a failed attempt is both safer and what people expect. The type is the
 * guarantee, and a test asserts no submitted password ever appears anywhere in
 * a returned state.
 */
export type AuthFormValues = {
  email?: string;
  consent?: boolean;
};

export type AuthFormState = {
  /** Shown above the form. Used when no single field is at fault, or when
   *  attributing the failure would leak something. */
  formError?: string;
  /** Shown under the field it names. */
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** Re-applied as defaultValue so React's post-action reset restores them. */
  values?: AuthFormValues;
};

export const NO_ERRORS: AuthFormState = {};

export function fieldError(
  field: AuthField,
  message: string,
  values?: AuthFormValues,
): AuthFormState {
  return { fieldErrors: { [field]: message }, values };
}

export function formError(message: string, values?: AuthFormValues): AuthFormState {
  return { formError: message, values };
}

/**
 * The GoTrue error codes we are willing to attribute to a field on SIGN-UP,
 * where -- unlike sign-in -- the response really is specific.
 *
 * A closed set, and closed in the safe direction: an unmapped code falls
 * through to a form-level message rather than being guessed at. Matched on
 * `code`, never on `message` -- CLAUDE.md's 2026-08-28 entry is the same
 * lesson, and GoTrue's prose is not a stable interface.
 *
 * `user_already_exists` is deliberately absent. It is real, and GoTrue does
 * return it for an address that already has a confirmed account -- which is
 * why signUp must not surface it at all. See the action.
 */
export const SIGNUP_FIELD_BY_CODE: Readonly<Record<string, AuthField>> = {
  /** "Password should be at least N characters." */
  weak_password: "password",
  /** "Unable to validate email address: invalid format" */
  validation_failed: "email",
};

export function signupFieldForCode(code: string | undefined): AuthField | null {
  return (code && SIGNUP_FIELD_BY_CODE[code]) || null;
}
