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

// Simple SVG icons
function ShieldIcon() {
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
      <path d="M12 2l7 4v5c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V6l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
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

function CheckBadgeIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function HeartIcon() {
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
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" />
    </svg>
  );
}

export function TrustBadges() {
  const badges = [
    { icon: <LockIcon />, label: "Secure Payments", sublabel: "Stripe-powered" },
    { icon: <CheckBadgeIcon />, label: "Verified Breeders", sublabel: "Health-tested" },
    { icon: <HeartIcon />, label: "Rescue Partners", sublabel: "Trusted shelters" },
    { icon: <ShieldIcon />, label: "Data Protected", sublabel: "Your privacy first" },
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
