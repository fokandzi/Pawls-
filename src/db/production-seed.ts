import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = neon(url);

const paris = ["Paris 5e", "Paris 6e", "Paris 9e", "Paris 11e", "Paris 15e", "Paris 16e", "Boulogne-Billancourt", "Montreuil", "Vincennes", "Saint-Denis", "Neuilly-sur-Seine", "Versailles"];

async function seedProviders() {
  await sql`CREATE TABLE IF NOT EXISTS providers (id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,location TEXT NOT NULL,image_url TEXT,rating NUMERIC(3,2) DEFAULT 4.5,review_count INTEGER DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY,provider_id INTEGER REFERENCES providers(id),name TEXT NOT NULL,price_cents INTEGER NOT NULL,duration_minutes INTEGER NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`;
  const [[count]] = await sql`SELECT COUNT(*)::int AS count FROM providers`;
  const names = ["Balades Belleville", "Pattes de Montmartre", "Le Spa des Toutous", "Moustaches & Compagnie", "Canis Major Training", "Clinique Vétérinaire Bastille", "Les Promenades du Canal", "Salon Toutou Chic", "Garde Douce Paris", "Éduca’Chien", "Veto République", "Au Poil Près"];
  const cats = ["walker", "walker", "groomer", "sitter", "trainer", "vet", "walker", "groomer", "sitter", "trainer", "vet", "groomer"];
  const services = [["Walk 30 min",1800,30],["Adventure walk 60 min",3000,60],["Wash & blow-dry",4200,60],["Daycare",3500,480],["Positive training",6500,60],["Wellness check-up",5500,30],["Pack walk 60 min",2400,60],["Full groom",7500,100],["Overnight stay",4800,1440],["Puppy class",28000,360],["Vaccination visit",4000,20],["Nail trim & tidy",2200,30]] as const;
  if (Number(count.count) < 10) for (let i = Number(count.count); i < names.length; i++) {
    const [p] = await sql`INSERT INTO providers (name,category,description,location,image_url,rating,review_count) VALUES (${names[i]},${cats[i]},${`Trusted Paris dog care from a local ${cats[i]} specialist. Gentle, reliable and fully focused on your dog's wellbeing.`},${paris[i]},${`https://placedog.net/600/400?random=provider-${i}`},${(4.3 + (i % 7) / 10).toFixed(1)},${42 + i * 13}) RETURNING id`;
    const s = services[i];
    await sql`INSERT INTO services (provider_id,name,price_cents,duration_minutes) VALUES (${p.id},${s[0]},${s[1]},${s[2]})`;
  }
}

async function seedBreeders() {
  await sql`CREATE TABLE IF NOT EXISTS breeders (id SERIAL PRIMARY KEY,name TEXT NOT NULL,location TEXT NOT NULL,description TEXT NOT NULL,breed_specialty TEXT NOT NULL,verification_status TEXT DEFAULT 'pending',membership_tier TEXT DEFAULT 'free',years_experience INTEGER DEFAULT 0,health_testing TEXT,image_url TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS litters (id SERIAL PRIMARY KEY,breeder_id INTEGER REFERENCES breeders(id),breed TEXT NOT NULL,birth_date DATE NOT NULL,available_count INTEGER NOT NULL DEFAULT 1,total_count INTEGER NOT NULL DEFAULT 1,price_cents INTEGER NOT NULL,health_tests TEXT,description TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`;
  const [[count]] = await sql`SELECT COUNT(*)::int AS count FROM breeders`;
  const breeds = ["French Bulldog","Golden Retriever","Border Collie","Pembroke Corgi","Labrador Retriever","Cavalier King Charles","Australian Shepherd","Whippet","Poodle","Bernese Mountain Dog","Beagle","Shiba Inu"];
  if (Number(count.count) < 10) for (let i = Number(count.count); i < 12; i++) {
    const [b] = await sql`INSERT INTO breeders (name,location,description,breed_specialty,verification_status,membership_tier,years_experience,health_testing,image_url) VALUES (${`Élevage ${breeds[i]} Paris`},${paris[i]},${`Small ethical home programme dedicated to healthy, well-socialised ${breeds[i]} puppies. Raised with care and lifelong family support.`},${breeds[i]},'verified',${i % 3 === 0 ? 'premium' : 'plus'},${8 + i},'DNA panel, hips and elbows, annual eye examination',${`https://placedog.net/500/350?random=breeder-${i}`} ) RETURNING id`;
    await sql`INSERT INTO litters (breeder_id,breed,birth_date,available_count,total_count,price_cents,health_tests,description) VALUES (${b.id},${breeds[i]},'2026-05-15',${2 + i % 4},${6 + i % 3},${150000 + i * 10000},'Parents DNA clear; hip, elbow and eye tested',${`Family-raised ${breeds[i]} puppies with early socialisation and vet checks.`})`;
  }
}

async function seedRescue() {
  await sql`CREATE TABLE IF NOT EXISTS shelters (id SERIAL PRIMARY KEY,name TEXT NOT NULL,location TEXT NOT NULL,description TEXT NOT NULL,phone TEXT,email TEXT,website TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS rescue_dogs (id SERIAL PRIMARY KEY,shelter_id INTEGER REFERENCES shelters(id),name TEXT NOT NULL,breed TEXT NOT NULL,age INTEGER NOT NULL,size TEXT NOT NULL,gender TEXT NOT NULL,description TEXT NOT NULL,good_with_dogs BOOLEAN DEFAULT true,good_with_kids BOOLEAN DEFAULT true,good_with_cats BOOLEAN DEFAULT false,photo_url TEXT,urgent BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT NOW())`;
  const [[count]] = await sql`SELECT COUNT(*)::int AS count FROM rescue_dogs`;
  const dogs = [["Nala","Labrador Retriever",2,"large"],["Milo","French Bulldog",4,"small"],["Romy","Border Collie mix",1,"medium"],["Oscar","Beagle",6,"medium"],["Tao","German Shepherd mix",3,"large"],["Poppy","Cocker Spaniel",5,"medium"],["Simba","Podenco mix",2,"medium"],["Iris","Poodle mix",8,"small"],["Marley","Staffordshire mix",4,"large"],["Léon","Corgi mix",7,"small"],["Uma","Golden Retriever mix",3,"large"],["Pepper","Jack Russell mix",1,"small"]] as const;
  if (Number(count.count) < 10) for (let i = Number(count.count); i < dogs.length; i++) {
    const [s] = await sql`INSERT INTO shelters (name,location,description,email) VALUES (${`Refuge ${paris[i]} Solidaire`},${paris[i]},'A volunteer-led Paris rescue helping dogs find patient, loving homes.','adoptions@pawls.example') RETURNING id`;
    const d = dogs[i];
    await sql`INSERT INTO rescue_dogs (shelter_id,name,breed,age,size,gender,description,good_with_dogs,good_with_kids,good_with_cats,photo_url,urgent) VALUES (${s.id},${d[0]},${d[1]},${d[2]},${d[3]},${i % 2 ? 'female' : 'male'},${`Meet ${d[0]}, a gentle rescue looking for a forever family in the Paris area.`},true,${i % 4 !== 0},${i % 3 === 0},${`https://placedog.net/600/500?random=rescue-${i}`},${i % 5 === 0})`;
  }
}

async function seedVenues() {
  await sql`CREATE TABLE IF NOT EXISTS venues (id SERIAL PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,lat NUMERIC(10,7) NOT NULL,lng NUMERIC(10,7) NOT NULL,description TEXT,dog_features TEXT[],rating NUMERIC(3,1) DEFAULT 4.5,image_url TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`;
  const [[count]] = await sql`SELECT COUNT(*)::int AS count FROM venues`;
  const venues = [["Parc de la Villette","park"],["Woof Café Bastille","cafe"],["Le Bouledogue Bar","bar"],["Maxi Zoo Nation","pet store"],["Parc de la Tête d'Or","park"],["Café des Chiens","cafe"],["Jardin des Plantes","park"],["Paws & Coffee","cafe"],["La Trattoria Canine","restaurant"],["Caniparc Vincennes","park"],["Dog & Co Market","pet store"],["Terrasse Montsouris","restaurant"]] as const;
  if (Number(count.count) < 10) for (let i = Number(count.count); i < venues.length; i++) { const v = venues[i]; await sql`INSERT INTO venues (name,type,address,city,lat,lng,description,dog_features,rating) VALUES (${v[0]},${v[1]},${`${12 + i} Avenue des Amis, ${paris[i]}`},'Paris',${48.82 + i * .006},${2.28 + i * .012},'A welcoming Paris destination where dogs are celebrated.','{water bowls,outdoor seating,dog treats}',${(4.4 + (i % 6) / 10).toFixed(1)})`; }
}

await seedProviders(); await seedBreeders(); await seedRescue(); await seedVenues();
const [[p]] = await sql`SELECT COUNT(*)::int AS n FROM providers`; const [[b]] = await sql`SELECT COUNT(*)::int AS n FROM breeders`; const [[d]] = await sql`SELECT COUNT(*)::int AS n FROM rescue_dogs`; const [[v]] = await sql`SELECT COUNT(*)::int AS n FROM venues`;
console.log({ providers: p.n, breeders: b.n, rescue_dogs: d.n, venues: v.n });
