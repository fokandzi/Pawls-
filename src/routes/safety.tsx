import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/safety")({
  head: () =>
    seoHead({
      title: "Sécurité sur Pawls",
      description:
        "Découvrez les mécanismes de sécurité réellement en place sur Pawls : signalement, blocage, déblocage, dématchage, file de modération, suspension et journal d'audit.",
      path: "/safety",
    }),
  component: SafetyPage,
});

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function SafetyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="safety" />
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <article className="prose prose-amber mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          <h1>La sécurité sur Pawls</h1>
          <p className="text-sm text-gray-500">
            Cette page décrit, de manière factuelle, les mécanismes de sécurité actuellement déployés dans l'application Pawls.
          </p>

          <p className="mt-6 leading-relaxed text-gray-700">
            Pawls met en relation des propriétaires de chiens et, plus tard, des prestataires de services. Nous mettons en place des
            outils de sécurité concrets et fonctionnels pour que chacun puisse signaler un problème, se protéger et participer à un
            espace respectueux. Voici ce qui existe aujourd'hui, sans exagération.
          </p>

          <div className="mt-8 space-y-10">
            <Section n="1" title="Signaler (Signaler dans l'application)">
              <p>
                Lorsque vous êtes confronté à un comportement inapproprié, vous pouvez le signaler directement depuis l'application.
                Le signalement se fait depuis le menu de l'utilisateur concerné : ouvrez le menu <strong>⋯</strong>, puis choisissez{" "}
                <strong>Signaler</strong>.
              </p>
              <p>
                Un signalement envoie une notification aux modérateurs Pawls. Chaque signalement est enregistré et soumis à un examen
                humain avant toute décision. Les signalements ne se traduisent jamais par une action automatique non vérifiée : une
                personne modère chaque cas.
              </p>
            </Section>

            <Section n="2" title="Bloquer et débloquer">
              <p>
                Vous pouvez bloquer un autre utilisateur afin de ne plus être en contact avec lui. Une fois un utilisateur bloqué, il ne
                peut plus vous voir comme un contact actif ni échanger avec vous.
              </p>
              <p>
                Vous pouvez à tout moment <strong>débloquer</strong> un utilisateur que vous avez bloqué, depuis vos réglages et
                paramètres de confidentialité.
              </p>
            </Section>

            <Section n="3" title="Dématchage (unmatch)">
              <p>
                Pour un match existant, vous pouvez <strong>dématché</strong> (unmatch) l'autre personne. Le dématchage rompt la mise en
                relation des deux côtés : la conversation associée n'est plus accessible à aucun des deux participants.
              </p>
              <p>
                Pour des raisons techniques d'historique, la ligne du match peut rester affichée comme « non matché » dans votre liste —
                mais la relation est bien rompue et l'échange n'est plus accessible de part et d'autre.
              </p>
            </Section>

            <Section n="4" title="File de modération et examen par un administrateur">
              <p>
                Les signalements aboutissent dans une <strong>file de modération</strong> réservée aux administrateurs Pawls. Chaque
                signalement y est examiné individuellement. Les administrateurs peuvent prendre les mesures prévues : un avertissement,
                une suspension temporaire ou un blocage, selon la gravité et le contexte.
              </p>
              <p>
                Les mesures ne sont jamais automatiques : elles suivent un examen humain sur la base du signalement et du contexte
                disponible.
              </p>
            </Section>

            <Section n="5" title="Suspension">
              <p>
                En cas de manquement confirmé aux règles, un compte peut être <strong>suspendu</strong>. Un compte suspendu ne peut plus
                utiliser les fonctionnalités de Pawls, notamment l'accès à Match et aux conversations, pendant la durée de la suspension
                ou jusqu'à résolution.
              </p>
            </Section>

            <Section n="6" title="Journal d'audit (traçabilité)">
              <p>
                Les actions importantes liées à la sécurité (signalements, blocages, déblocages, dématchages, suspensions, décisions de
                modération) sont consignées dans un <strong>journal d'audit</strong> à écriture uniquement. Ce journal ne peut pas être
                modifié ou effacé par les utilisateurs, ce qui garantit la traçabilité des décisions.
              </p>
            </Section>

            <Section n="7" title="Ce qui n'est pas encore rôdé et comment rester prudent">
              <p>
                Nous travaillons en continu à la sécurité du produit. Quelques conseils essentiels restent de votre responsabilité :
                rencontrez les autres propriétaires dans des lieux publics et fréquentés pour les premières rencontres, ne partagez pas
                vos informations bancaires ou personnelles sensibles via la messagerie, et signalez tout comportement qui vous met mal à
                l'aise.
              </p>
              <p>
                En cas de doute, vous pouvez également nous écrire à{" "}
                <a href="mailto:hello@pawls.club" className="text-[var(--pawls-terracotta-500)] underline">
                  hello@pawls.club
                </a>
                .
              </p>
            </Section>
          </div>
        </article>
      </main>
      <AppFooter />
    </div>
  );
}
