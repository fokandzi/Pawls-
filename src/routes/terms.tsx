import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/terms")({
  head: () =>
    seoHead({
      title: "Conditions d'utilisation — Pawls",
      description:
        "Les conditions d'utilisation de Pawls décrivent le service tel qu'il existe aujourd'hui : Match et Messagerie en bêta privée, réservation de services à venir.",
      path: "/terms",
    }),
  component: TermsPage,
});

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="terms" />
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <article className="prose prose-amber mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          <h1>Conditions d'utilisation</h1>
          <p className="text-sm text-gray-500">
            Dernière mise à jour : le 20 août 2026. Ces conditions décrivent le service tel qu'il existe aujourd'hui.
          </p>

          <div className="mt-8 space-y-10">
            <Clause n="1" title="Le service">
              <p>
                Pawls est une plateforme destinée aux amoureux des chiens. Elle propose, ou prépare, plusieurs fonctionnalités : trouver
                des compagnons de jeu pour votre chien (<strong>Match</strong>), échanger avec d'autres propriétaires (
                <strong>Messagerie</strong>), réserver des services pour chiens (<strong>Réservation</strong>), découvrir des lieux
                adaptés (<strong>Lieux</strong>), ainsi que l'élevage, l'adoption et les communautés.
              </p>
              <p>
                <strong>État actuel :</strong> <strong>Match</strong> et la <strong>Messagerie</strong> sont disponibles en bêta privée
                à Paris. La <strong>Réservation</strong> de services (<strong>Book</strong>) est en préparation : les prestataires
                fondateurs peuvent s'inscrire, mais la réservation en ligne n'est pas encore ouverte. Les rubriques{" "}
                <strong>Lieux</strong>, <strong>Élevage</strong>, <strong>Adoption</strong>, <strong>Communautés</strong> et{" "}
                <strong>Pawls Plus</strong> sont des fonctionnalités à venir et ne sont pas encore proposées.
              </p>
              <p>
                Pawls facilite les relations entre les membres ; les utilisateurs et les prestataires restent responsables de leurs
                propres interactions et de leurs choix.
              </p>
            </Clause>

            <Clause n="2" title="Vos obligations">
              <p>
                En utilisant Pawls, vous vous engagez à fournir des informations exactes, à protéger l'accès à votre compte, à respecter
                les autres membres et les animaux, et à utiliser le service de manière licite. Il est interdit de harceler, d'usurper une
                identité, de créer de faux profils, de spammer ou de publier du contenu dont vous ne détenez pas les droits. Le respect
                des <a href="/community-guidelines" className="text-[var(--pawls-terracotta-500)] underline">règles de la communauté</a>{" "}
                fait partie intégrante de ces conditions.
              </p>
            </Clause>

            <Clause n="3" title="Compte et inscription">
              <p>
                Pour utiliser Match et la Messagerie, vous devez créer un compte avec une adresse e-mail valide que vous devrez vérifier.
                Vous êtes responsable de la confidentialité de vos identifiants. Vous pouvez supprimer votre compte à tout moment depuis
                les paramètres.
              </p>
            </Clause>

            <Clause n="4" title="Sécurité et modération">
              <p>
                Pawls met en place des outils de sécurité (signalement, blocage, déblocage, dématchage, file de modération, suspension et
                journal d'audit), décrits sur la page{" "}
                <a href="/safety" className="text-[var(--pawls-terracotta-500)] underline">Sécurité</a>. En cas de manquement à ces
                conditions ou aux règles de la communauté, nous pouvons avertir, suspendre ou bloquer un compte, après examen humain du
                signalement.
              </p>
            </Clause>

            <Clause n="5" title="Paiements et Pawls Plus">
              <p>
                <strong>Pawls Plus n'est pas vendu</strong> et aucun abonnement payant n'est actuellement proposé. Le paiement en ligne des
                services de réservation n'est pas encore actif. Lorsque des paiements seront proposés (réservation de services ou
                abonnement), ils seront traités par notre prestataire de paiement et feront l'objet de conditions applicables à ce moment-là,
                affichées de manière transparente avant toute transaction. Nous ne prélevons actuellement aucun montant et n'affiche pas de
                tarif pour des fonctionnalités non disponibles.
              </p>
            </Clause>

            <Clause n="6" title="Limitation de responsabilité">
              <p>
                Dans la mesure permise par la loi, Pawls n'est pas responsable des pertes indirectes ni des actes, omissions, comportements
                ou services des membres, éleveurs, refuges ou prestataires. Pawls facilite les mises en relation mais n'organise pas les
                rencontres entre chiens ni ne garantit leur déroulement. Aucune disposition ne limite une responsabilité qui ne peut pas
                l'être légalement.
              </p>
            </Clause>

            <Clause n="7" title="Résiliation">
              <p>
                Vous pouvez cesser d'utiliser le service et supprimer votre compte à tout moment depuis les réglages. Nous pouvons
                suspendre ou clôturer l'accès en cas de violation, de fraude, de risque de sécurité ou pour des raisons légales.
              </p>
            </Clause>

            <Clause n="8" title="Droit applicable">
              <p>
                Ces conditions sont régies par le droit français, sans préjudice des protections impératives du consommateur de votre pays
                de résidence. Tout litige relève des tribunaux compétents français.
              </p>
            </Clause>

            <Clause n="9" title="Contact">
              <p>
                Pour toute question relative à ces conditions, contactez-nous à{" "}
                <a href="mailto:hello@pawls.club" className="text-[var(--pawls-terracotta-500)] underline">hello@pawls.club</a>.
              </p>
            </Clause>
          </div>
        </article>
      </main>
      <AppFooter />
    </div>
  );
}
