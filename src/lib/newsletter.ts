/**
 * The newsletter form, as a model rather than as markup.
 *
 * Two jobs, and the second is why this is a module instead of four attributes
 * typed straight into the component.
 *
 * The first is the switch. `newsletterForm` is the only thing that decides
 * whether there is a newsletter, and it decides it from one string in
 * `lib/site.ts`. Both surfaces that mention the newsletter — the signup block on
 * the home page and the paragraph on /privacy — read that same string, so the
 * control and the page describing it can never disagree about whether the
 * control exists.
 *
 * The second is Buttondown's half of the contract. The endpoint wants the
 * address as `email` and a hidden `embed` of `1`, and those names are not ours
 * to choose: get one wrong and the form still renders, still submits, and still
 * looks fine, and the subscriber is quietly dropped. Nothing in a static build
 * catches that. Holding them here as data means the component renders from the
 * same values `newsletter.test.mjs` asserts, so a typo is a failing test rather
 * than a silent leak. The component must not hard-code them a second time.
 *
 * `method` is here for the same reason and one more: a GET would put the
 * subscriber's address in a URL, in their history and in Buttondown's logs as a
 * query string.
 */
export interface NewsletterForm {
  /** Buttondown's embed endpoint for one account. */
  action: string;
  /** Always a POST. See the note above about GET and the address in a URL. */
  method: "post";
  /** What Buttondown calls the address field. */
  emailField: string;
  /** The hidden field Buttondown's embed endpoint expects, and its value. */
  embedField: string;
  embedValue: string;
}

/**
 * The form to render, or `null` when there is no newsletter to render one for.
 *
 * Takes the action rather than reading `NEWSLETTER_ACTION` itself so the
 * configured case is testable without a live account behind it.
 *
 * Empty string counts as off, not as configured. An empty `action` on a form is
 * not an error anywhere in HTML: it posts to the current page, so a
 * misconfiguration would ship a box that looks live, swallows an address and
 * reloads the home page.
 */
export function newsletterForm(action: string | null): NewsletterForm | null {
  if (!action) return null;

  return {
    action,
    method: "post",
    emailField: "email",
    embedField: "embed",
    embedValue: "1",
  };
}
