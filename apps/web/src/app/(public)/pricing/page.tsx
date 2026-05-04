import Link from "next/link";

import {
  startAnnualCheckout,
  startMonthlyCheckout,
} from "../../account/actions";

const includedItems = [
  "5,000-word free trial before you choose a paid plan.",
  "Provider costs included in the launch price.",
  "Unlimited personal dictation under fair-use terms.",
  "Built for dictating into apps where you can type, not meeting transcription.",
];

const planCards = [
  {
    action: startMonthlyCheckout,
    billingNote: "$7/month billed monthly",
    description:
      "Good for trying RubyWhisper after the trial without an annual commitment.",
    label: "Start monthly checkout",
    price: "$7",
    priceSuffix: "/month",
    title: "Monthly",
  },
  {
    action: startAnnualCheckout,
    billingNote: "$60/year",
    description:
      "The best launch price if RubyWhisper becomes part of your daily Mac workflow.",
    label: "Start annual checkout",
    price: "$5",
    priceSuffix: "/month",
    title: "Annual",
    valueNote: "Billed annually",
  },
];

export default function PricingPage() {
  return (
    <main className="surface-shell public-shell pricing-shell">
      <section
        className="surface-panel public-panel pricing-panel"
        aria-labelledby="pricing-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/">Home</Link>
            <Link href="/download">Download</Link>
            <Link href="/sign-up">Sign up</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>

        <div className="pricing-hero">
          <div>
            <p className="surface-kicker">Pricing</p>
            <h1 id="pricing-heading">One plan for Mac dictation.</h1>
          </div>
          <p className="surface-copy pricing-hero-copy">
            Start with a 5,000-word free trial. Upgrade when you are ready for
            unlimited personal dictation with included provider costs and
            fair-use terms.
          </p>
        </div>

        <section className="pricing-grid" aria-label="RubyWhisper plans">
          {planCards.map((plan) => (
            <article className="pricing-card rw-panel" key={plan.title}>
              <div>
                <p className="pricing-plan-label">{plan.title}</p>
                <div className="pricing-price-row">
                  <span className="pricing-price">{plan.price}</span>
                  <span className="pricing-price-suffix">
                    {plan.priceSuffix}
                  </span>
                </div>
                <p className="pricing-billing-note">
                  {plan.valueNote ? (
                    <>
                      {plan.billingNote} as {plan.price}
                      {plan.priceSuffix} {plan.valueNote.toLowerCase()}
                    </>
                  ) : (
                    plan.billingNote
                  )}
                </p>
              </div>
              <p className="pricing-description">{plan.description}</p>
              <form action={plan.action}>
                <button className="rw-button" type="submit">
                  {plan.label}
                </button>
              </form>
            </article>
          ))}
        </section>

        <section className="pricing-included" aria-labelledby="included-heading">
          <div>
            <p className="surface-kicker">Included</p>
            <h2 id="included-heading">Launch terms, plainly stated.</h2>
          </div>
          <ul>
            {includedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <p className="pricing-fallback-note">
          Checkout opens through Stripe. If checkout is unavailable or you are
          signed out, RubyWhisper will route you through the existing account
          fallback flow. The Mac beta download page will show a direct download
          only when release hosting is configured.
        </p>
      </section>
    </main>
  );
}
