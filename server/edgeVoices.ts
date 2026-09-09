/**
 * Voix neuronales de Microsoft Edge, servies par le proxy local.
 *
 * Pourquoi : la machine n'a que les trois vieilles voix SAPI de Windows
 * (Hortense, Julie, Paul). Elles sont synthétiques et se ressemblent, et la
 * seule façon de différencier des personnages avec elles — transposer la
 * hauteur — les rend inintelligibles. Ici on a treize voix francophones
 * réellement distinctes et naturelles, gratuites et sans compte.
 *
 * C'est le point d'accès « Read Aloud » d'Edge, celui qu'utilise le navigateur
 * pour lire une page à voix haute. Aucune clé, aucune inscription, mais ce
 * n'est pas une API publiquement contractualisée : si elle change, le jeu
 * retombe sur les voix du navigateur sans rien casser.
 *
 * L'audio est mis en cache : une même réplique avec la même voix n'est
 * synthétisée qu'une fois.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/** Format : mp3 mono 24 kHz, le meilleur rapport qualité/poids pour de la parole. */
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

export interface EdgeVoice {
  shortName: string;
  gender: 'homme' | 'femme';
  locale: string;
}

/** Entrées du cache conservées (une réplique ≈ 40 ko). */
const CACHE_MAX = 200;

const cache = new Map<string, Buffer>();

function remember(key: string, audio: Buffer): void {
  cache.set(key, audio);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

let voicesPromise: Promise<EdgeVoice[]> | null = null;

/** Voix francophones disponibles, demandées une seule fois. */
export async function listFrenchVoices(): Promise<EdgeVoice[]> {
  voicesPromise ??= (async () => {
    const tts = new MsEdgeTTS();
    const all = await tts.getVoices();
    return all
      .filter((v) => v.Locale.toLowerCase().startsWith('fr'))
      .map((v) => ({
        shortName: v.ShortName,
        gender: v.Gender === 'Female' ? ('femme' as const) : ('homme' as const),
        locale: v.Locale,
      }));
  })().catch((e) => {
    // Un échec ne doit pas être mémorisé : le réseau peut revenir.
    voicesPromise = null;
    throw e;
  });
  return voicesPromise;
}

/** Vrai si le service répond. Sert à la détection automatique du fournisseur. */
export async function edgeAvailable(): Promise<boolean> {
  try {
    return (await listFrenchVoices()).length > 0;
  } catch {
    return false;
  }
}

/**
 * Prosodie SSML. Les voix neuronales encaissent bien mieux la transposition
 * que les voix SAPI, mais on reste sobre : l'intelligibilité passe avant la
 * caractérisation, qui est déjà portée par le choix de la voix elle-même.
 */
function prosody(rate: number, pitch: number): { rate: string; pitch: string } {
  const pct = (v: number): string => {
    const d = Math.round((v - 1) * 100);
    return `${d >= 0 ? '+' : ''}${d}%`;
  };
  const borne = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
  return { rate: pct(borne(rate, 0.85, 1.15)), pitch: pct(borne(pitch, 0.92, 1.08)) };
}

/**
 * Une connexion par voix, gardée ouverte.
 *
 * Sans mutualisation, chaque réplique rouvrait un WebSocket : ~130 ms perdues
 * à chaque fois, ce qui se sent en match où la situation attend la fin de la
 * lecture. Une connexion morte est remplacée à la demande.
 */
const connexions = new Map<string, Promise<MsEdgeTTS>>();

function connexion(voice: string): Promise<MsEdgeTTS> {
  const existante = connexions.get(voice);
  if (existante) return existante;
  const ouverte = (async () => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, FORMAT);
    return tts;
  })();
  // Une ouverture ratée ne doit pas condamner la voix pour toute la session.
  ouverte.catch(() => connexions.delete(voice));
  connexions.set(voice, ouverte);
  return ouverte;
}

export interface SynthesizeInput {
  text: string;
  voice: string;
  rate?: number;
  pitch?: number;
}

/** Une passe de synthèse sur la connexion mutualisée. Renvoie un buffer vide si elle a lâché. */
async function parLaConnexion(voice: string, text: string, p: { rate: string; pitch: string }): Promise<Buffer> {
  try {
    const tts = await connexion(voice);
    const { audioStream } = await tts.toStream(text, { rate: p.rate, pitch: p.pitch });
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } catch {
    connexions.delete(voice);
    return Buffer.alloc(0);
  }
}

/** Synthétise une réplique en mp3. Lève si le service est injoignable. */
export async function synthesize({ text, voice, rate = 1, pitch = 1 }: SynthesizeInput): Promise<Buffer> {
  const p = prosody(rate, pitch);
  const key = `${voice}|${p.rate}|${p.pitch}|${text}`;
  const hit = cache.get(key);
  if (hit) {
    // Remis en fin de file : le cache garde ce qui ressert.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  let audio = await parLaConnexion(voice, text, p);
  if (audio.length === 0) {
    // Connexion périmée : on la jette et on retente une fois.
    connexions.delete(voice);
    audio = await parLaConnexion(voice, text, p);
  }
  if (audio.length === 0) throw new Error('Synthèse vide');
  remember(key, audio);
  return audio;
}
