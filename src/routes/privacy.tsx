import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    seoHead({
      title: "Politique de confidentialité — Pawls",
      description:
        "La politique de confidentialité de Pawls décrit les données réellement traitées aujourd'hui : comptes, profils de chiens, interactions, signalements et audit.",
      path: "/privacy",
    }),
  component: PrivacyPage,
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

function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="privacy" />
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <article className="prose prose-amber mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          <h1>Politique de confidentialité</h1>
          <p className="text-sm text-gray-500">
            Dernière mise à jour : le 20 août 2026. Cette politique décrit les données réellement traitées par Pawls aujourd'hui, sans
            exagération.
          </p>

          <div className="mt-8 space-y-10">
            <Section n="1" title="Responsable et portée">
              <p>
                Pawls (« nous ») exploite la plateforme accessible à l'adresse{" "}
                <a href="https://pawls.club" className="text-[var(--pawls-terracotta-500)] underline">pawls.club</a>. Cette politique
                explique quelles données personnelles sont traitées lorsque vous utilisez Pawls, et comment elles le sont. Nous
                traitons vos données conformément au règlement général sur la protection des données (RGPD) et à la législation française.
              </p>
            </Section>

            <Section n="2" title="Données que nous traitons aujourd'hui">
              <p>Voici, de manière factuelle, les catégories de données actuellement traitées par le produit :</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>Informations de compte :</strong> lors de l'inscription, nous collectons votre adresse e-mail, votre nom et un
                  mot de passe (stocké de manière sécurisée). L'adresse e-mail fait l'objet d'une vérification.
                </li>
                <li>
                  <strong>Profil de votre chien :</strong> nom, race, âge, taille, caractère, niveau d'énergie et d'autres
                  caractéristiques que vous choisissez d'indiquer, ainsi que les photos que vous téléversez.
                </li>
                <li>
                  <strong>Activité dans l'application :</strong> vos interactions avec le service, notamment les profils que vous
                  consultez, vos choix de matching, vos matchs et vos messages échangés avec d'autres propriétaires.
                </li>
                <li>
                  <strong>Signalements et modération :</strong> si vous signalez un contenu ou un utilisateur, nous conservons le
                  signalement et les échanges associés, ainsi que les décisions de modération, dans un journal d'audit à écriture
                  uniquement.
                </li>
              </ul>
              <p className="mt-3">
                Nous ne collectons pas aujourd'hui de données de paiement : aucune réservation payante ni abonnement n'est actuellement
                proposé, et nous ne stockons pas d'informations bancaires.
              </p>
            </Section>

            <Section n="3" title="Analytics : état actuel">
              <p>
                <strong>Aucune mesure d'audience (analytics) n'est actuellement active sur Pawls.</strong> Nous n'utilisons pas encore
                d'outil d'analyse, et aucune donnée d'usage n'est envoyée à un prestataire d'analyse. Si nous activons un jour un outil
                d'analyse, celui-ci sera soumis à votre consentement préalable (conformément à la réglementation française et
                européenne) et uniquement à des fins d'amélioration du service. Vous pourrez alors refuser ou retirer votre consentement.
              </p>
            </Section>

            <Section n="4" title="Cookies et technologies similaires">
              <p>
                Pawls n'utilise pas de cookies publicitaires ni de traceurs tiers à des fins de profilage. Nous pouvons utiliser des
                cookies strictement nécessaires au bon fonctionnement du service (par exemple pour maintenir votre session de
                connexion). Aucun suivi publicitaire n'est pratiqué.
              </p>
            </Section>

            <Section n="5" title="Base légale du traitement">
              <p>
                Nous traitons vos données pour exécuter le contrat qui nous lie (fournir le service), pour satisfaire nos obligations
                légales (notamment en matière de données), pour notre intérêt légitime à sécuriser la plateforme et à prévenir les abus,
                et, le cas échéant, sur la base de votre consentement (par exemple pour d'éventuelles mesures d'analyse).
              </p>
            </Section>

            <Section n="6" title="Sécurité">
              <p>
                Les mots de passe sont hachés et ne sont jamais stockés en clair. Les accès à vos données sont protégés par des sessions
                authentifiées, et les actions sensibles sont consignées dans un journal d'audit. Nous mettons en œuvre des mesures
                techniques et organisationnelles raisonnables pour protéger vos données.
              </p>
            </Section>

            <Section n="7" title="Partage des données">
              <p>
                Nous ne revendons pas vos données. Vos informations de profil de chien sont visibles par les autres membres dans le cadre
                de Match, et les messages ne sont visibles que par les participants à la conversation. Nous pouvons partager des données
                avec nos prestataires techniques (par exemple l'hébergement de la base de données) strictement dans la mesure nécessaire
                à la fourniture du service, et avec les autorités compétentes lorsque la loi nous y oblige.
              </p>
            </Section>

            <Section n="8" title="Conservation des données">
              <p>
                Nous conservons vos données tant que votre compte est actif, et pendant une durée raisonnable après sa suppression
                pour satisfaire à nos obligations légales et préserver notre journal d'audit. Vous pouvez supprimer votre compte à tout
                moment depuis les paramètres.
              </p>
            </Section>

            <Section n="9" title="Vos droits">
              <p>
                Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et
                d'opposition au traitement de vos données, ainsi que du droit de retirer un consentement donné. Pour exercer ces droits,
                écrivez-nous à{" "}
                <a href="mailto:hello@pawls.club" className="text-[var(--pawls-terracotta-500)] underline">hello@pawls.club</a>.
                Vous pouvez également introduire une réclamation auprès de la CNIL.
              </p>
            </Section>
          </div>
        </article>
      </main>
      <AppFooter />
    </div>
  );
}
