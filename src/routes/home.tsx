import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader, AppFooter } from "../lib/app-header";
import { AppIcon } from "../lib/app-icon";

export const Route = createFileRoute("/home")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      {/* Dashboard content */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <img
          src="/logo-full.png"
          alt="Pawls"
          className="mb-8 h-16 sm:h-24"
        />

        <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Welcome to Pawls
        </h2>

        <p className="mb-8 max-w-md text-base leading-relaxed text-gray-600">
          The all-in-one platform for dog people. Choose a tool above to get started.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
          { to: "/match", icon: "match" as const, label: "Match", desc: "Find playmates" },
          { to: "/breed", icon: "breed" as const, label: "Breed", desc: "Ethical breeders" },
          { to: "/book", icon: "book" as const, label: "Book", desc: "Services nearby" },
          { to: "/rescue", icon: "rescue" as const, label: "Rescue", desc: "Adopt a dog" },
          ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
              className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5 transition-all hover:border-[var(--pawls-cream-200)] hover:bg-[var(--pawls-cream-50)] hover:shadow-md sm:p-6"
            >
              <AppIcon name={item.icon} size={40} />
              <span className="text-sm font-semibold text-gray-800">{item.label}</span>
              <span className="text-xs text-gray-500">{item.desc}</span>
            </Link>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
