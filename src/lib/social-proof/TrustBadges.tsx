interface BadgeProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
}

function Badge({ icon, label, sublabel }: BadgeProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-3 text-center sm:px-6">
      <div className="mb-1 text-2xl text-[var(--pawls-terracotta-500)] sm:text-3xl">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-800">
        {label}
      </span>
      {sublabel && (
        <span className="text-xs text-gray-400">{sublabel}</span>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

/**
 * Trust badges — only claims that are factually true today (Phase 1a).
 * Stripe payments, breeder verification, rescue partnerships and premium
 * features are NOT live yet, so nothing here references them.
 */
export function TrustBadges() {
  const badges = [
    { icon: <LockIcon />, label: "Free to use during beta", sublabel: "No hidden costs" },
    { icon: <LockIcon />, label: "Every demo listing is labelled", sublabel: "No fake accounts" },
  ];

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-4 sm:gap-8"
      role="list"
      aria-label="Trust badges"
    >
      {badges.map((badge) => (
        <div key={badge.label} role="listitem">
          <Badge {...badge} />
        </div>
      ))}
    </div>
  );
}
