import { useEffect, useState } from "react";

// Seed numbers — plausible starting counts
const SEEDS = {
  matches: 12487,
  rescued: 3241,
  bookings: 28950,
  paws: 15632,
};

// How often each counter ticks (ms)
const TICK_INTERVAL = 3000;

// Max increment per tick
const MAX_INC = {
  matches: 3,
  rescued: 1,
  bookings: 5,
  paws: 4,
};

interface Stat {
  label: string;
  value: number;
  emoji: string;
  suffix: string;
}

function useAnimatedCounter(target: number, duration: number = 600) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setDisplayed(0);
      return;
    }
    const start = displayed;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    let raf: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayed(Math.round(start + diff * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return displayed;
}

function AnimatedStat({ label, value, emoji, suffix }: Stat) {
  const displayed = useAnimatedCounter(value);

  return (
    <div className="flex flex-col items-center px-4 py-3 sm:px-6">
      <span className="mb-1 text-2xl sm:text-3xl">{emoji}</span>
      <span className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl md:text-4xl">
        {displayed.toLocaleString()}
        {suffix}
      </span>
      <span className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500 sm:text-sm">
        {label}
      </span>
    </div>
  );
}

export function LiveCounterStatsBar() {
  const [stats, setStats] = useState({
    matches: SEEDS.matches,
    rescued: SEEDS.rescued,
    bookings: SEEDS.bookings,
    paws: SEEDS.paws,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        matches: prev.matches + Math.floor(Math.random() * MAX_INC.matches) + 1,
        rescued: prev.rescued + Math.floor(Math.random() * MAX_INC.rescued) + 1,
        bookings: prev.bookings + Math.floor(Math.random() * MAX_INC.bookings) + 1,
        paws: prev.paws + Math.floor(Math.random() * MAX_INC.paws) + 1,
      }));
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-y-4 rounded-2xl bg-white px-6 py-6 shadow-lg shadow-amber-900/5 ring-1 ring-[var(--pawls-cream-200)]/50 sm:gap-x-8 sm:px-10"
      role="status"
      aria-label="Live platform statistics"
      aria-live="polite"
    >
      <AnimatedStat
        label="Matches Made"
        value={stats.matches}
        emoji=""
        suffix="+"
      />
      <div className="hidden h-12 w-px bg-[var(--pawls-cream-200)] sm:block" aria-hidden="true" />
      <AnimatedStat
        label="Dogs Rescued"
        value={stats.rescued}
        emoji=""
        suffix="+"
      />
      <div className="hidden h-12 w-px bg-[var(--pawls-cream-200)] sm:block" aria-hidden="true" />
      <AnimatedStat
        label="Bookings Completed"
        value={stats.bookings}
        emoji=""
        suffix="+"
      />
      <div className="hidden h-12 w-px bg-[var(--pawls-cream-200)] sm:block" aria-hidden="true" />
      <AnimatedStat
        label="Happy Paws"
        value={stats.paws}
        emoji=""
        suffix="+"
      />
    </div>
  );
}
