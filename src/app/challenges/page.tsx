import { SiteHeader } from "@/components/SiteHeader";
import { ChallengeBuyer } from "@/components/ChallengeBuyer";
import { getSessionUser } from "@/lib/auth";
import { parseProgram } from "@/lib/challenges";

type Props = {
  searchParams: Promise<{ program?: string; reactivate?: string }>;
};

export default async function ChallengesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const program = parseProgram(sp.program || "") || "instant";
  const highlightReactivation =
    sp.reactivate === "1" || Boolean(user?.reactivationRequired);

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader signedIn={Boolean(user)} />
      <div className="fxl-shell">
        <ChallengeBuyer
          initialProgram={program}
          highlightReactivation={highlightReactivation}
          signedIn={Boolean(user)}
        />
      </div>
    </main>
  );
}
