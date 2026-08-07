import { sql } from "../db";

export const parisDogProfiles = [
  ["Camille Martin","Max","Golden Retriever",3,"large","high",["friendly","playful"],"Max loves swimming and making every dog his best friend.","Paris 11e",2.1],
  ["Julien Bernard","Luna","French Bulldog",5,"small","low",["calm","affectionate"],"Luna is a gentle café companion with a big personality.","Paris 5e",1.4],
  ["Sophie Dubois","Bella","Border Collie",2,"medium","high",["energetic","clever"],"Bella lives for frisbee, long walks, and learning new tricks.","Paris 18e",4.8],
  ["Antoine Moreau","Charlie","Cavalier King Charles Spaniel",4,"small","medium",["friendly","gentle"],"Charlie is happiest greeting everyone he meets in the park.","Paris 16e",3.2],
  ["Élodie Petit","Nala","Labrador Retriever",6,"large","medium",["friendly","patient"],"Nala is a patient old soul who loves relaxed walks and treats.","Montreuil",5.6],
  ["Thomas Leroy","Oscar","Dachshund",3,"small","medium",["playful","curious"],"Oscar has tiny legs, a huge nose, and endless curiosity.","Vincennes",6.1],
  ["Marie Lefèvre","Milo","Australian Shepherd",1,"medium","high",["energetic","playful"],"Milo is a joyful puppy looking for an adventure buddy.","Boulogne-Billancourt",7.4],
  ["Lucas Girard","Ruby","Husky",4,"large","high",["social","adventurous"],"Ruby is a chatty runner who loves exploring new trails.","Nanterre",10.2],
  ["Claire Marchand","Teddy","Poodle",7,"small","low",["calm","shy"],"Teddy warms up slowly, then becomes your sweetest walking friend.","Paris 11e",1.8],
  ["Hugo Fontaine","Simba","German Shepherd",5,"large","high",["loyal","confident"],"Simba enjoys structured games and calm, confident companions.","Issy-les-Moulineaux",5.0],
  ["Amélie Laurent","Maya","Beagle",2,"medium","medium",["friendly","curious"],"Maya follows her nose everywhere and never misses a picnic.","Paris 5e",2.7],
  ["Nicolas Roy","Rocky","Boxer",6,"large","high",["playful","affectionate"],"Rocky is a goofy boxer who thinks every walk is a party.","Saint-Germain-en-Laye",14.5],
  ["Louise Garcia","Pippa","Shih Tzu",8,"small","low",["calm","affectionate"],"Pippa prefers sunny benches, gentle strolls, and friendly hellos.","Paris 16e",2.4],
  ["Romain Henry","Finn","Whippet",3,"medium","high",["athletic","shy"],"Finn loves a fast sprint followed by a very long nap.","Paris 18e",4.1],
  ["Chloé Perrin","Ziggy","Cocker Spaniel",1,"medium","medium",["playful","friendly"],"Ziggy is a bouncy youngster who loves meeting new playmates.","Montreuil",7.8],
  ["Paul Mercier","Koda","Bernese Mountain Dog",4,"large","medium",["gentle","calm"],"Koda is a gentle giant with a soft spot for children and cuddles.","Boulogne-Billancourt",6.7],
  ["Inès Robert","Winnie","Maltese",5,"small","low",["affectionate","friendly"],"Winnie brings sunshine to every neighborhood walk.","Paris 11e",0.9],
  ["Arthur Simon","Jasper","Samoyed",2,"large","high",["social","playful"],"Jasper is a fluffy optimist who wants to play all day.","Nanterre",11.3],
] as const;

export async function ensureDogProfilesSeeded() {
  const [count] = await sql()`SELECT COUNT(*)::int AS count FROM dog_profiles`;
  if (Number(count?.count) > 0) {
    for (const [index, p] of parisDogProfiles.entries()) {
      const photoUrl = `https://placedog.net/500/500?id=${index + 1}`;
      await sql()`UPDATE dog_profiles SET photo_url = ${photoUrl} WHERE dog_name = ${p[1]} AND photo_url IS NULL`;
    }
    return 0;
  }
  for (const [index, p] of parisDogProfiles.entries()) {
    const photoUrl = `https://placedog.net/500/500?id=${index + 1}`;
    await sql()`INSERT INTO dog_profiles
      (owner_name,dog_name,breed,age,size,energy_level,temperament,temperament_tags,bio,location,distance_km,photo_url)
      VALUES (${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${p[6][0]},${p[6]},${p[7]},${p[8]},${p[9]},${photoUrl})`;
  }
  return parisDogProfiles.length;
}
