/**
 * Format d'import d'un jeu de données (clubs, coachs, effectifs).
 *
 * Deux jeux livrés : `leagues/real/ligue1-2026-27.json` (noms réels, par défaut)
 * et `leagues/fictional/ligue1.json` (sans droits). L'utilisateur peut importer
 * le sien depuis l'écran Réglages : il passe par `parseDataset`.
 *
 * Le format est volontairement plus simple que les types internes : un joueur
 * est décrit par sa note globale et quelques attributs clés facultatifs ; le
 * chargeur (`engine/world/loadDataset.ts`) génère le reste de façon
 * déterministe à partir du poste.
 */
import { z } from 'zod';
import {
  ARCHETYPES,
  ATTRIBUTE_KEYS,
  BOARD_OBJECTIVES,
  FEET,
  MENTALITIES,
  PLAY_STYLES,
  POSITIONS,
} from '../engine/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format YYYY-MM-DD');
const pct = z.number().min(0).max(100);
const rating = z.number().int().min(1).max(99);
const country = z.string().regex(/^[A-Z]{3}$/, 'code pays ISO alpha-3 attendu');

export const AttributeOverridesSchema = z
  .record(z.enum(ATTRIBUTE_KEYS as unknown as [string, ...string[]]), rating)
  .default({});

export const DatasetPlayerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: z.string().optional(),
  birthDate: isoDate,
  nationality: country,
  secondNationality: country.optional(),
  position: z.enum(POSITIONS),
  secondaryPositions: z.array(z.enum(POSITIONS)).default([]),
  foot: z.enum(FEET).default('droit'),
  heightCm: z.number().int().min(150).max(215),
  weightKg: z.number().int().min(50).max(120),
  shirtNumber: z.number().int().min(1).max(99),
  /** Note globale 1-99, seule valeur obligatoire pour le niveau. */
  overall: rating,
  /** Absent : déduit de l'âge et de la note par le chargeur. */
  potential: rating.optional(),
  /** Renommée 0-100. Absent : déduite de la note et du prestige du club. */
  fame: pct.optional(),
  contractEndsOn: isoDate,
  /** Absent : déduit de la note et du club. */
  wageMonthly: z.number().nonnegative().optional(),
  marketValue: z.number().nonnegative().optional(),
  archetypes: z.array(z.enum(ARCHETYPES)).max(3).default([]),
  /** Attributs clés connus, le reste est généré autour de la note. */
  attributes: AttributeOverridesSchema,
  /** Vrai si le joueur est capitaine. */
  captain: z.boolean().default(false),
  /** Note libre : « à vérifier », « prêt jusqu'en juin ». */
  note: z.string().optional(),
});

export const DatasetCoachSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationality: country,
  birthDate: isoDate,
  contractEndsOn: isoDate,
  /** Compétence 0-100. */
  ability: pct,
  youthTrust: pct.default(50),
  patience: pct.default(50),
  formation: z.string().regex(/^\d(-\d){2,4}$/, 'formation attendue, ex. 4-3-3'),
  mentality: z.enum(MENTALITIES).default('equilibree'),
  style: z.enum(PLAY_STYLES).default('possession'),
  pressing: z.number().min(0).max(1).default(0.5),
  tempo: z.number().min(0).max(1).default(0.5),
  width: z.number().min(0).max(1).default(0.5),
  personality: z
    .object({
      warmth: pct.default(50),
      severity: pct.default(50),
      volatility: pct.default(50),
      mediaHunger: pct.default(50),
      loyalty: pct.default(50),
      keywords: z.array(z.string()).default([]),
    })
    .default({}),
  note: z.string().optional(),
});

export const DatasetClubSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'identifiant en minuscules, chiffres et _'),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(4),
  city: z.string().min(1),
  country: country,
  colors: z.object({ primary: z.string(), secondary: z.string() }),
  stadium: z.object({ name: z.string(), capacity: z.number().int().positive() }),
  leagueId: z.string(),
  prestige: pct,
  fanbase: pct,
  facilities: pct,
  transferBudget: z.number().nonnegative(),
  wageBudgetMonthly: z.number().nonnegative(),
  boardObjective: z.enum(BOARD_OBJECTIVES),
  rivalClubIds: z.array(z.string()).default([]),
  coach: DatasetCoachSchema,
  players: z.array(DatasetPlayerSchema).min(16).max(40),
  note: z.string().optional(),
});

export const DatasetLeagueFormatSchema = z.object({
  teams: z.number().int().min(4).max(24),
  rounds: z.number().int().min(1).max(4).default(2),
  pointsWin: z.number().int().default(3),
  pointsDraw: z.number().int().default(1),
  promoted: z.number().int().min(0).default(2),
  relegated: z.number().int().min(0).default(2),
  playoffSlots: z.number().int().min(0).default(1),
  continentalSlots: z.array(z.enum(['ldc', 'ldc_barrage', 'le', 'conf'])).default(['ldc', 'ldc', 'ldc', 'ldc_barrage', 'le', 'conf']),
});

export const DatasetLeagueSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  country: country,
  tier: z.number().int().min(1).default(1),
  prestige: pct,
  clubIds: z.array(z.string()).min(4),
  format: DatasetLeagueFormatSchema,
});

export const DatasetFileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    label: z.string(),
    realNames: z.boolean(),
    /** Ex. « 2026-27 ». */
    referenceSeason: z.string().regex(/^\d{4}-\d{2}$/),
    source: z.string(),
    /** Date à laquelle les effectifs sont réputés exacts. */
    asOf: isoDate,
    leagues: z.array(DatasetLeagueSchema).min(1),
    clubs: z.array(DatasetClubSchema).min(4),
  })
  .superRefine((file, ctx) => {
    const clubIds = new Set(file.clubs.map((c) => c.id));
    if (clubIds.size !== file.clubs.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'identifiants de clubs en double' });
    }
    for (const league of file.leagues) {
      if (league.clubIds.length !== league.format.teams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ligue ${league.id} : ${league.clubIds.length} clubs pour un format à ${league.format.teams}`,
        });
      }
      for (const id of league.clubIds) {
        if (!clubIds.has(id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ligue ${league.id} : club inconnu ${id}` });
        }
      }
    }
    for (const club of file.clubs) {
      if (!file.leagues.some((l) => l.id === club.leagueId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `club ${club.id} : ligue inconnue ${club.leagueId}` });
      }
      const numbers = new Set<number>();
      for (const p of club.players) {
        if (numbers.has(p.shirtNumber)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `club ${club.id} : numéro ${p.shirtNumber} en double` });
        }
        numbers.add(p.shirtNumber);
      }
      if (club.players.filter((p) => p.position === 'GB').length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `club ${club.id} : au moins 2 gardiens requis` });
      }
      if (club.players.filter((p) => p.captain).length > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `club ${club.id} : un seul capitaine` });
      }
    }
  });

export type DatasetPlayer = z.infer<typeof DatasetPlayerSchema>;
export type DatasetCoach = z.infer<typeof DatasetCoachSchema>;
export type DatasetClub = z.infer<typeof DatasetClubSchema>;
export type DatasetLeague = z.infer<typeof DatasetLeagueSchema>;
export type DatasetFile = z.infer<typeof DatasetFileSchema>;

/** Valide un JSON brut et renvoie un jeu de données typé. Lève une erreur lisible sinon. */
export function parseDataset(json: unknown): DatasetFile {
  const result = DatasetFileSchema.safeParse(json);
  if (!result.success) {
    const lines = result.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`);
    throw new Error(`Jeu de données invalide :\n${lines.join('\n')}`);
  }
  return result.data;
}
