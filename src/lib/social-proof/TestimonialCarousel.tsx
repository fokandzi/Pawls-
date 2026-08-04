import { useCallback, useEffect, useRef, useState } from "react";

interface Testimonial {
  quote: string;
  name: string;
  dogName: string;
  dogBreed: string;
  avatar: string; // emoji
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Pawls completely changed how I find playmates for my dog. We've made so many friends in our neighborhood — it's the app I wish I had years ago!",
    name: "Sarah Mitchell",
    dogName: "Luna",
    dogBreed: "Golden Retriever",
    avatar: "",
  },
  {
    quote:
      "We adopted our sweet Max through the Rescue pillar. The unified feed made it so easy to find the perfect dog for our family. Forever grateful!",
    name: "James & Emily Carter",
    dogName: "Max",
    dogBreed: "Labrador Mix",
    avatar: "",
  },
  {
    quote:
      "Booking a walker used to mean texting three different people. Now it's one tap. The service providers on Pawls are vetted and amazing.",
    name: "David Okonkwo",
    dogName: "Ziggy",
    dogBreed: "Border Collie",
    avatar: "",
  },
  {
    quote:
      "As a first-time dog owner, the Breed pillar gave me the confidence to find an ethical breeder. The health testing transparency is incredible.",
    name: "Maria Rodriguez",
    dogName: "Coco",
    dogBreed: "Cavalier King Charles",
    avatar: "",
  },
  {
    quote:
      "The community events are the highlight of our week. My dog Bailey has her own social life now — and honestly, so do I!",
    name: "Tom Henderson",
    dogName: "Bailey",
    dogBreed: "Australian Shepherd",
    avatar: "",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-[var(--pawls-gold-400)]"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
            clipRule="evenodd"
          />
        </svg>
      ))}
    </div>
  );
}

export function TestimonialCarousel() {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
  }, []);

  useEffect(() => {
    if (!isPaused) {
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, startTimer]);

  const goTo = (index: number) => {
    setActive(index);
    // Reset timer on manual interaction
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isPaused) {
      startTimer();
    }
  };

  const t = TESTIMONIALS[active];

  return (
    <div
      className="mx-auto max-w-2xl"
      role="region"
      aria-roledescription="carousel"
      aria-label="Customer testimonials"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* Slide */}
      <div
        className="relative rounded-2xl bg-white px-8 pb-10 pt-8 shadow-lg ring-1 ring-[var(--pawls-cream-100)] sm:px-12 sm:pb-12 sm:pt-10"
        role="group"
        aria-roledescription="slide"
        aria-label={`Testimonial ${active + 1} of ${TESTIMONIALS.length}`}
      >
        {/* Quote mark */}
        <div
          className="mb-4 text-5xl leading-none text-[var(--pawls-terracotta-500)]/20 select-none sm:text-6xl"
          aria-hidden="true"
        >
          &#8220;
        </div>

        <blockquote>
          <p className="text-base leading-relaxed text-gray-700 sm:text-lg">
            {t.quote}
          </p>
        </blockquote>

        <div className="mt-6 flex items-center gap-4">
          {/* Avatar */}
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--pawls-cream-100)] text-2xl"
            aria-hidden="true"
          >
            {t.avatar}
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-gray-900">{t.name}</span>
            <span className="text-sm text-gray-500">
              {t.dogName} &middot; {t.dogBreed}
            </span>
            <Stars />
          </div>
        </div>
      </div>

      {/* Dot navigation */}
      <div
        className="mt-6 flex items-center justify-center gap-2"
        role="tablist"
        aria-label="Testimonial navigation"
      >
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === active}
            aria-label={`Go to testimonial ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === active
                ? "w-8 bg-[var(--pawls-terracotta-500)]"
                : "w-2.5 bg-[var(--pawls-cream-200)] hover:bg-amber-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
