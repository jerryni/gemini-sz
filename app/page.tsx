import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/app");
  }

  return (
    <main className="landing-page">
      <section className="hero-card">
        <p className="eyebrow">Next.js + Workers + Gemini + D1</p>
        <h1>Build the first version on the web, not in the App Store.</h1>
        <p className="hero-copy">
          This starter is optimized for mobile chat, first-party account login, D1 persistence, and
          a Gemini-backed query flow running entirely through Cloudflare.
        </p>

        <div className="hero-actions">
          <LoginForm />
        </div>

        <div className="feature-grid">
          <article>
            <strong>Workers runtime</strong>
            <span>Gemini API stays server-side and deploys on Cloudflare.</span>
          </article>
          <article>
            <strong>D1 persistence</strong>
            <span>Manual accounts, sessions, conversations, and messages live in D1.</span>
          </article>
          <article>
            <strong>Mobile-first UI</strong>
            <span>Single-column chat layout that also expands cleanly on desktop.</span>
          </article>
        </div>
      </section>
    </main>
  );
}
