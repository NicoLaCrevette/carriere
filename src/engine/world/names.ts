/**
 * Noms de personnes et identités de clubs fictifs.
 *
 * Les prénoms et noms viennent des pools de `data/nationalities.ts` (repli
 * international). Les clubs français fictifs sont tirés d'une table de villes
 * réelles avec des noms de clubs inventés (aucun nom de club réel) ; pour les
 * autres pays, une identité générique est composée à partir d'une liste de
 * villes et de préfixes peu usités.
 */
import type { CountryCode } from '../types';
import type { Rng } from '../rng/mulberry32';
import { countryName, namePool, normalizeCountryCode } from '../../data/nationalities';

/** Prénom + nom crédibles selon la nationalité (pools par pays, repli international). */
export function generateName(rng: Rng, nationality: CountryCode): { firstName: string; lastName: string } {
  const pool = namePool(nationality);
  return { firstName: rng.pick(pool.first), lastName: rng.pick(pool.last) };
}

export interface ClubIdentity {
  name: string;
  shortName: string;
  code: string;
  city: string;
  stadium: string;
}

/** Clubs français fictifs : ville réelle, club et stade inventés. */
const FRENCH_CLUBS: readonly ClubIdentity[] = [
  { name: 'Paris Athletic Club', shortName: 'Paris AC', code: 'PAC', city: 'Paris', stadium: 'Stade de la Capitale' },
  { name: 'Marseille Phocéa FC', shortName: 'Phocéa', code: 'MPF', city: 'Marseille', stadium: 'Stade du Vieux-Port' },
  { name: 'Union Sportive Lyonnaise', shortName: 'US Lyon', code: 'USL', city: 'Lyon', stadium: 'Stade des Brotteaux' },
  { name: 'Racing Lille Métropole', shortName: 'Racing Lille', code: 'RLM', city: 'Lille', stadium: 'Stade de la Citadelle' },
  { name: 'Étoile Sportive de Bordeaux', shortName: 'ES Bordeaux', code: 'ESB', city: 'Bordeaux', stadium: 'Stade de la Garonne' },
  { name: 'Sporting Club Nantais', shortName: 'SC Nantes', code: 'SCN', city: 'Nantes', stadium: "Stade de l'Erdre" },
  { name: 'Union Toulousaine', shortName: 'UT', code: 'UTL', city: 'Toulouse', stadium: 'Stade Occitan' },
  { name: 'Nice Riviera FC', shortName: 'Riviera', code: 'NRF', city: 'Nice', stadium: 'Stade de la Baie des Anges' },
  { name: 'Alliance Strasbourg', shortName: 'Alliance', code: 'ALS', city: 'Strasbourg', stadium: 'Stade du Rhin' },
  { name: 'Rennes Armorique FC', shortName: 'Armorique', code: 'RAF', city: 'Rennes', stadium: 'Stade de la Vilaine' },
  { name: 'Athlétic Club Lensois', shortName: 'AC Lens', code: 'ACL', city: 'Lens', stadium: 'Stade des Terrils' },
  { name: 'Montpellier Languedoc FC', shortName: 'Languedoc', code: 'MLF', city: 'Montpellier', stadium: 'Stade du Lez' },
  { name: 'Saint-Étienne Forez Club', shortName: 'Forez', code: 'SEF', city: 'Saint-Étienne', stadium: 'Stade des Mineurs' },
  { name: 'Reims Champagne Football', shortName: 'Champagne', code: 'RCF', city: 'Reims', stadium: 'Stade des Sacres' },
  { name: 'Le Havre Océane', shortName: 'Océane', code: 'HOC', city: 'Le Havre', stadium: "Stade de l'Estuaire" },
  { name: 'Metz Lorraine Sports', shortName: 'Metz LS', code: 'MTZ', city: 'Metz', stadium: 'Stade de la Moselle' },
  { name: 'Nancy Stanislas FC', shortName: 'Stanislas', code: 'NSF', city: 'Nancy', stadium: 'Stade Lorrain' },
  { name: 'Brest Atlantique', shortName: 'Atlantique', code: 'BAT', city: 'Brest', stadium: 'Stade de la Rade' },
  { name: 'Lorient Morbihan FC', shortName: 'Morbihan', code: 'LMF', city: 'Lorient', stadium: 'Stade des Marins' },
  { name: 'Angers Anjou Club', shortName: 'Anjou', code: 'AAC', city: 'Angers', stadium: 'Stade de la Maine' },
  { name: 'Auxerre Bourgogne FC', shortName: 'Bourgogne', code: 'ABF', city: 'Auxerre', stadium: "Stade de l'Yonne" },
  { name: 'Caen Normandie Sport', shortName: 'Normandie', code: 'CNS', city: 'Caen', stadium: 'Stade des Ducs' },
  { name: 'Grenoble Isère FC', shortName: 'Isère', code: 'GIF', city: 'Grenoble', stadium: 'Stade du Dauphiné' },
  { name: 'Dijon Ducale', shortName: 'Ducale', code: 'DIJ', city: 'Dijon', stadium: "Stade de la Toison d'Or" },
  { name: 'Troyes Aube Football', shortName: 'Aube', code: 'TAF', city: 'Troyes', stadium: 'Stade de la Seine' },
  { name: 'Amiens Picardie Club', shortName: 'Picardie', code: 'APC', city: 'Amiens', stadium: 'Stade de la Somme' },
  { name: 'Toulon Var FC', shortName: 'Var', code: 'TVF', city: 'Toulon', stadium: 'Stade du Mourillon' },
  { name: 'Bastia Corsica', shortName: 'Corsica', code: 'BCO', city: 'Bastia', stadium: 'Stade du Cap Corse' },
  { name: 'Clermont Auvergne FC', shortName: 'Auvergne', code: 'CAF', city: 'Clermont-Ferrand', stadium: 'Stade des Volcans' },
  { name: 'Montbéliard Doubs FC', shortName: 'Doubs', code: 'MDF', city: 'Montbéliard', stadium: 'Stade des Lions' },
  { name: 'Rouen Seine-Maritime', shortName: 'Rouen SM', code: 'RSM', city: 'Rouen', stadium: 'Stade de la Cathédrale' },
  { name: 'Nîmes Arènes FC', shortName: 'Arènes', code: 'NAF', city: 'Nîmes', stadium: 'Stade des Arènes' },
  { name: 'Valenciennes Hainaut', shortName: 'Hainaut', code: 'VHA', city: 'Valenciennes', stadium: "Stade de l'Escaut" },
  { name: 'Ajaccio Impérial', shortName: 'Impérial', code: 'AJI', city: 'Ajaccio', stadium: 'Stade du Golfe' },
  { name: 'Annecy Lac FC', shortName: 'Annecy Lac', code: 'ANL', city: 'Annecy', stadium: 'Stade du Lac' },
  { name: 'Pau Béarn FC', shortName: 'Béarn', code: 'PBF', city: 'Pau', stadium: 'Stade des Pyrénées' },
  { name: 'Orléans Loire FC', shortName: 'Loire', code: 'OLF', city: 'Orléans', stadium: 'Stade du Loiret' },
  { name: 'Tours Touraine FC', shortName: 'Touraine', code: 'TTF', city: 'Tours', stadium: 'Stade de la Loire' },
  { name: 'Dunkerque Flandre', shortName: 'Flandre', code: 'DKF', city: 'Dunkerque', stadium: 'Stade du Littoral' },
  { name: 'Perpignan Catalan FC', shortName: 'Catalan', code: 'PCF', city: 'Perpignan', stadium: 'Stade du Roussillon' },
];

/** Villes et préfixes de clubs pour les autres pays (identité composée, jamais un nom réel connu). */
const GENERIC_CITIES: Readonly<Record<string, readonly string[]>> = {
  ESP: ['Madrid', 'Barcelone', 'Valence', 'Séville', 'Bilbao', 'Saragosse', 'Malaga', 'Murcie', 'Grenade', 'Valladolid', 'Vigo', 'Gijón', 'Cadix', 'Alicante', 'Cordoue', 'Salamanque', 'Burgos', 'Oviedo', 'Almería', 'Huelva'],
  ITA: ['Milan', 'Rome', 'Naples', 'Turin', 'Florence', 'Bologne', 'Gênes', 'Vérone', 'Palerme', 'Bari', 'Catane', 'Padoue', 'Trieste', 'Parme', 'Pise', 'Livourne', 'Pérouse', 'Brescia', 'Modène', 'Ancône'],
  DEU: ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig', 'Brême', 'Dresde', 'Hanovre', 'Nuremberg', 'Duisbourg', 'Bochum', 'Kiel', 'Rostock', 'Fribourg', 'Mannheim'],
  ENG: ['Londres', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Newcastle', 'Nottingham', 'Leicester', 'Coventry', 'Hull', 'Bradford', 'Stoke', 'Derby', 'Plymouth', 'Southampton', 'Portsmouth', 'Norwich', 'Ipswich'],
  PRT: ['Lisbonne', 'Porto', 'Braga', 'Coimbra', 'Setúbal', 'Aveiro', 'Faro', 'Funchal', 'Leiria', 'Viseu', 'Guimarães', 'Évora', 'Portimão', 'Vila Real', 'Barcelos'],
  NLD: ['Amsterdam', 'Rotterdam', 'La Haye', 'Utrecht', 'Eindhoven', 'Groningue', 'Tilburg', 'Almere', 'Breda', 'Nimègue', 'Arnhem', 'Haarlem', 'Enschede', 'Zwolle', 'Leyde'],
  BEL: ['Bruxelles', 'Anvers', 'Gand', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Louvain', 'Mons', 'Malines', 'Ostende', 'Courtrai', 'Hasselt', 'Tournai', 'Genk'],
};

const GENERIC_PREFIXES: readonly string[] = ['Union', 'Alliance', 'Étoile', 'Athletic', 'Sporting Union', 'Racing Union', 'Olympia', 'Phoenix'];
const GENERIC_STADIUMS: readonly string[] = ['Stade Municipal', 'Parc des Sports', 'Arena', 'Stade Olympique', 'Stade Central', 'Stade du Parc'];

/** Retire accents et caractères non alphabétiques pour construire un code court. */
function codeFrom(city: string): string {
  const plain = city.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (plain + 'XXX').slice(0, 3);
}

/**
 * Nom de club fictif + ville + stade pour un pays. `used` contient les noms,
 * villes et codes déjà pris : ils sont évités et le résultat y est ajouté.
 */
export function generateClubIdentity(rng: Rng, country: CountryCode, used: Set<string>): ClubIdentity {
  const code = normalizeCountryCode(country);
  const identity = code === 'FRA' ? pickFrench(rng, used) : composeGeneric(rng, code, used);
  used.add(identity.name);
  used.add(identity.city);
  used.add(identity.code);
  return identity;
}

function pickFrench(rng: Rng, used: Set<string>): ClubIdentity {
  const free = FRENCH_CLUBS.filter((c) => !used.has(c.name) && !used.has(c.city) && !used.has(c.code));
  if (free.length > 0) return { ...rng.pick(free) };
  return composeGeneric(rng, 'FRA', used);
}

function composeGeneric(rng: Rng, code: string, used: Set<string>): ClubIdentity {
  const cities = GENERIC_CITIES[code] ?? [];
  const freeCities = cities.filter((c) => !used.has(c));
  const city = freeCities.length > 0 ? rng.pick(freeCities) : `${countryName(code)} ${used.size + 1}`;
  const prefix = rng.pick(GENERIC_PREFIXES);
  const name = `${prefix} ${city}`;
  let clubCode = codeFrom(city);
  for (let i = 1; used.has(clubCode) && i < 10; i++) clubCode = `${clubCode.slice(0, 2)}${i}`;
  return { name, shortName: city, code: clubCode, city, stadium: `${rng.pick(GENERIC_STADIUMS)} de ${city}` };
}

/** Nombre d'identités françaises disponibles dans la table (pour les tests). */
export const FRENCH_CLUB_COUNT = FRENCH_CLUBS.length;
