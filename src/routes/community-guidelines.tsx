import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/community-guidelines")({
  head: () =>
    seoHead({
      title: "Règles de la communauté Pawls",
      description:
        "Les règles de la communauté Pawls : respect, bienveillance et sécurité pour les propriétaires de chiens. Comment fonctionne la modération.",
      path: "/community-guidelines",
    }),
  component: GuidelinesPage,
});

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function GuidelinesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="community-guidelines" />
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <article className="prose prose-amber mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          <h1>Règles de la communauté</h1>
          <p className="text-sm text-gray-500">
            Pawls repose sur la confiance, la bienveillance et le respect entre les propriétaires de chiens.
          </p>

          <p className="mt-6 leading-relaxed text-gray-700">
            Pawls rassemble des personnes qui aiment les chiens. Pour que chacun puisse utiliser le service sereinement, nous attendons
            de tous les membres qu'ils respectent quelques principes simples. Ces règles sont appliquées par nos modérateurs, qui
            examinent chaque signalement avant de prendre une décision. Elles sont rédigées pour refléter le produit tel qu'il existe
            aujourd'hui.
          </p>

          <div className="mt-8 space-y-10">
            <Rule title="Respect et bienveillance">
              <p>
                Traitez les autres membres avec le même respect que vous souhaitez recevoir. Pas de harcèlement, d'insultes, de
                moqueries, de menaces ou de propos discriminatoires. Le comportement que vous auriez en face de quelqu'un est celui que
                nous attendons en ligne.
              </p>
            </Rule>

            <Rule title="Soyez authentique">
              <p>
                Utilisez votre vraie identité et décrivez fidèlement votre chien (race, âge, caractère). N'usurpez pas l'identité de
                quelqu'un d'autre et ne créez pas de faux profils pour tromper les autres membres.
              </p>
            </Rule>

            <Rule title="Aucun spam ni sollicitation non sollicitée">
              <p>
                Ne publiez pas de contenu publicitaire non sollicité, de liens douteux ou de demandes répétées. Ne partagez pas vos
                coordonnées bancaires et ne sollicitez jamais de paiement en dehors du cadre prévu par Pawls.
              </p>
            </Rule>

            <Rule title="Protégez votre sécurité et celle des autres">
              <p>
                Ne divulguez pas des informations personnelles sensibles (adresse précise, numéros de carte, mots de passe). Pour les
                premières rencontres, privilégiez les lieux publics. Signalez tout comportement qui vous semble dangereux ou abusif —
                voir la page <a href="/safety" className="text-[var(--pawls-terracotta-500)] underline">Sécurité</a>.
              </p>
            </Rule>

            <Rule title="Respectez le bien-être animal">
              <p>
                Pawls est une plateforme pour les amoureux des chiens. Tout contenu ou comportement qui encourage la maltraitance,
                l'abandon ou le bien-être compromis des animaux est contraire à nos règles et pourra entraîner une action de modération.
              </p>
            </Rule>

            <Rule title="Le bien-être des chiens et de leurs propriétaires">
              <p>
                Les rencontres entre chiens doivent toujours se faire dans le respect du comportement de chaque animal. Ne forcez jamais
                une interaction si un chien montre des signes de stress ou de malaise.
              </p>
            </Rule>

            <Rule title="Comment la modération fonctionne">
              <p>
                Tout membre peut signaler un comportement via le menu <strong>⋯</strong> → <strong>Signaler</strong>. Les signalements
                sont examinés individuellement par un modérateur. Selon la gravité, une mesure parmi les suivantes peut être prise : un
                avertissement, une suspension temporaire ou un blocage. Les décisions sont tracées dans un journal d'audit, et le
                processus respecte le principe d'examen humain avant toute action. Nous ne prétendons pas appliquer des sanctions
                automatiques qui n'existent pas.
              </p>
            </Rule>

            <Rule title="Contact">
              <p>
                Une question sur ces règles ou sur une décision de modération ? Écrivez-nous à{" "}
                <a href="mailto:hello@pawls.club" className="text-[var(--pawls-terracotta-500)] underline">
                  hello@pawls.club
                </a>
                .
              </p>
            </Rule>
          </div>
        </article>
      </main>
      <AppFooter />
    </div>
  );
}
