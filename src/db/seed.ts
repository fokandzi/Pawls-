import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createBookingTables, createMatchTables } from "./schema";

const providers = [
  {
    name: "Amsterdam Dog Walks",
    category: "walker",
    description:
      "Experienced dog walkers serving Amsterdam's Jordaan and canals. We treat every walk like an adventure — rain or shine, your pup gets the exercise and stimulation they need.",
    location: "Amsterdam",
    image_url: null,
    rating: 4.8,
    review_count: 124,
    services: [
      { name: "30-minute Walk", price_cents: 1500, duration_minutes: 30 },
      { name: "60-minute Walk", price_cents: 2500, duration_minutes: 60 },
      { name: "Puppy Visit (20 min)", price_cents: 1200, duration_minutes: 20 },
    ],
  },
  {
    name: "Rover Walks Utrecht",
    category: "walker",
    description:
      "Friendly neighborhood walking service in Utrecht's city centre. Group walks available for social pups, or solo strolls for dogs who prefer one-on-one attention.",
    location: "Utrecht",
    image_url: null,
    rating: 4.6,
    review_count: 89,
    services: [
      { name: "45-minute Walk", price_cents: 2000, duration_minutes: 45 },
      { name: "Group Walk (1hr)", price_cents: 1800, duration_minutes: 60 },
    ],
  },
  {
    name: "Paws & Polish Grooming",
    category: "groomer",
    description:
      "Premium dog grooming salon in Amsterdam Oost. From quick washes to full spa treatments, we keep your dog looking and feeling their best with gentle, fear-free handling.",
    location: "Amsterdam",
    image_url: null,
    rating: 4.9,
    review_count: 203,
    services: [
      { name: "Wash & Dry", price_cents: 3500, duration_minutes: 45 },
      { name: "Full Groom", price_cents: 6500, duration_minutes: 90 },
      { name: "Nail Trim", price_cents: 1500, duration_minutes: 15 },
    ],
  },
  {
    name: "Cosy Canine Sitting",
    category: "sitter",
    description:
      "Home-based dog sitting in Rotterdam. Your dog stays with us in a loving family environment — no kennels, no cages. Daily photo updates included so you never miss a moment.",
    location: "Rotterdam",
    image_url: null,
    rating: 4.7,
    review_count: 156,
    services: [
      { name: "Daycare (full day)", price_cents: 3000, duration_minutes: 480 },
      { name: "Overnight Stay", price_cents: 4500, duration_minutes: 1440 },
    ],
  },
  {
    name: "Positive Paws Training",
    category: "trainer",
    description:
      "Certified positive-reinforcement dog trainer in The Hague. Group classes, private sessions, and behaviour consultations for puppies and adult dogs of all breeds.",
    location: "Den Haag",
    image_url: null,
    rating: 5.0,
    review_count: 67,
    services: [
      {
        name: "Private Session (1hr)",
        price_cents: 7500,
        duration_minutes: 60,
      },
      {
        name: "Puppy Starter Course (6 wks)",
        price_cents: 25000,
        duration_minutes: 360,
      },
      {
        name: "Behaviour Consultation",
        price_cents: 9500,
        duration_minutes: 90,
      },
    ],
  },
  {
    name: "De Dierenkliniek",
    category: "vet",
    description:
      "Full-service veterinary clinic in Amsterdam Zuid. Preventative care, diagnostics, dental, and surgery. Walk-in hours available every weekday morning.",
    location: "Amsterdam",
    image_url: null,
    rating: 4.5,
    review_count: 312,
    services: [
      { name: "Standard Check-up", price_cents: 4500, duration_minutes: 30 },
      { name: "Vaccination", price_cents: 3500, duration_minutes: 15 },
      { name: "Dental Cleaning", price_cents: 15000, duration_minutes: 60 },
    ],
  },
];

// Additional Paris providers keep the marketplace useful on first launch.
for (let i = providers.length; i < 12; i++) {
  providers.push({
    name: ["Paris Paws Express", "Toutou Zen Paris", "Canine Care Batignolles", "Pattes Actives", "Mon Chien & Moi", "Vet des Gobelins"][i - 6],
    category: ["walker", "sitter", "groomer", "trainer", "walker", "vet"][i - 6],
    description: "Trusted local dog care in Paris with gentle handling and dependable service for every pup.",
    location: ["Paris 11e", "Paris 15e", "Paris 17e", "Paris 8e", "Paris 4e", "Paris 13e"][i - 6],
    image_url: `https://placedog.net/600/400?random=provider-${i}`,
    rating: 4.4 + (i % 5) / 10,
    review_count: 50 + i * 9,
    services: [{ name: "Personal care session", price_cents: 2500 + i * 300, duration_minutes: 60 }],
  });
}

/**
 * Seeds the database with 12 sample providers and their services.
 * Calls createBookingTables first to ensure schema exists.
 * Checks if data already exists — safe to call multiple times.
 */
export const seedProviders = createServerFn({ method: "POST" }).handler(
  async () => {
    // Ensure tables exist
    await createBookingTables();

    // Check if we've already seeded
    const [existing] = await sql()`
      SELECT COUNT(*)::int AS count FROM providers
    `;
    if (Number(existing.count) > 0) {
      return { success: true, count: 0, message: "Already seeded" };
    }

    for (const p of providers) {
      const [provider] = await sql()`
        INSERT INTO providers (name, category, description, location, image_url, rating, review_count)
        VALUES (${p.name}, ${p.category}, ${p.description}, ${p.location}, ${p.image_url}, ${p.rating}, ${p.review_count})
        RETURNING id
      `;

      if (provider) {
        for (const s of p.services) {
          await sql()`
            INSERT INTO services (provider_id, name, price_cents, duration_minutes)
            VALUES (${provider.id}, ${s.name}, ${s.price_cents}, ${s.duration_minutes})
          `;
        }
      }
    }

    return { success: true, count: providers.length };
  },
);

const dogProfiles = [
  {
    owner_name: "Sophie van den Berg",
    dog_name: "Boris",
    breed: "Labrador Retriever",
    age: 3,
    size: "large",
    energy_level: "high",
    temperament: "friendly",
    bio: "Boris loves swimming in the canals and playing fetch at Vondelpark. He's a social butterfly who gets along with every dog he meets!",
    location: "Amsterdam",
  },
  {
    owner_name: "Daan de Vries",
    dog_name: "Luna",
    breed: "Corgi",
    age: 2,
    size: "small",
    energy_level: "medium",
    temperament: "playful",
    bio: "Luna has short legs but a huge personality! She loves chasing pigeons and snuggling on the couch after a long walk.",
    location: "Utrecht",
  },
  {
    owner_name: "Emma Bakker",
    dog_name: "Max",
    breed: "German Shepherd",
    age: 4,
    size: "large",
    energy_level: "high",
    temperament: "playful",
    bio: "Max is a working-line shepherd who needs an active playmate. He excels at agility and loves a good game of tug-of-war.",
    location: "Rotterdam",
  },
  {
    owner_name: "Lars Jansen",
    dog_name: "Coco",
    breed: "French Bulldog",
    age: 5,
    size: "small",
    energy_level: "low",
    temperament: "calm",
    bio: "Coco is a laid-back Frenchie who enjoys short walks and long naps. Perfect coffee-shop companion — she just wants to be near you.",
    location: "Amsterdam",
  },
  {
    owner_name: "Mila Hendriks",
    dog_name: "Nora",
    breed: "Border Collie",
    age: 2,
    size: "medium",
    energy_level: "high",
    temperament: "friendly",
    bio: "Nora is whip-smart and needs mental stimulation. She'd love a friend who can keep up with her frisbee obsession at Westerpark!",
    location: "Amsterdam",
  },
  {
    owner_name: "Thomas Visser",
    dog_name: "Ollie",
    breed: "Golden Retriever",
    age: 1,
    size: "large",
    energy_level: "medium",
    temperament: "friendly",
    bio: "Ollie is a big goofball puppy with endless enthusiasm. He's still learning his manners but has a heart of gold. Loves mud puddles.",
    location: "Den Haag",
  },
  {
    owner_name: "Fleur van Dijk",
    dog_name: "Mila",
    breed: "Dachshund",
    age: 6,
    size: "small",
    energy_level: "medium",
    temperament: "shy",
    bio: "Mila is a sweet little sausage dog who takes a moment to warm up but is deeply loyal once she trusts you. Enjoys sunbathing.",
    location: "Utrecht",
  },
  {
    owner_name: "Jesse Smit",
    dog_name: "Rex",
    breed: "Husky",
    age: 3,
    size: "large",
    energy_level: "high",
    temperament: "playful",
    bio: "Rex is a talkative husky who will tell you all about his day. He needs a running buddy who can handle his dramatic personality!",
    location: "Rotterdam",
  },
  {
    owner_name: "Lisa Meijer",
    dog_name: "Pippa",
    breed: "Cavalier King Charles Spaniel",
    age: 4,
    size: "small",
    energy_level: "low",
    temperament: "calm",
    bio: "Pippa is a gentle lapdog who loves nothing more than being carried around and meeting new friends. The sweetest girl you'll ever meet.",
    location: "Amsterdam",
  },
  {
    owner_name: "Noah Willems",
    dog_name: "Kai",
    breed: "Australian Shepherd",
    age: 2,
    size: "medium",
    energy_level: "high",
    temperament: "playful",
    bio: "Kai is an athletic, smart Aussie who lives for frisbee and herding games. Looking for a high-energy playmate for weekend adventures!",
    location: "Den Haag",
  },
];

/**
 * Seeds the database with 10 sample dog profiles.
 * Calls createMatchTables first to ensure schema exists.
 * Checks if data already exists — safe to call multiple times.
 */
export const seedDogProfiles = createServerFn({ method: "POST" }).handler(
  async () => {
    await createMatchTables();

    const [existing] = await sql()`
      SELECT COUNT(*)::int AS count FROM dog_profiles
    `;
    if (Number(existing.count) > 0) {
      return { success: true, count: 0, message: "Already seeded" };
    }

    for (const p of dogProfiles) {
      await sql()`
        INSERT INTO dog_profiles (owner_name, dog_name, breed, age, size, energy_level, temperament, bio, location)
        VALUES (${p.owner_name}, ${p.dog_name}, ${p.breed}, ${p.age}, ${p.size}, ${p.energy_level}, ${p.temperament}, ${p.bio}, ${p.location})
      `;
    }

    return { success: true, count: dogProfiles.length };
  },
);
