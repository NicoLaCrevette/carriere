import type { AvatarConfig } from '../../engine/types';
import { ATTRIBUTE_GROUPS } from '../../engine/types';
import { useState } from 'react';
import { useCareerStore } from '../../store/careerStore';
import { formatDateFrShort } from '../../engine/calendar/dates';
import { ATTRIBUTE_LABELS, formatEuros, formatRating } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import AttributeRadar from '../components/AttributeRadar';
import ProgressionPanel from '../components/ProgressionPanel';
import PlayerAvatar from '../components/PlayerAvatar';
import AvatarPicker from '../components/AvatarPicker';
import Button from '../components/Button';
import { avatarParDefaut } from '../lib/avatar';
import AttributeRow from '../components/AttributeRow';
import NumberTabular from '../components/NumberTabular';

/** Profil joueur (§3, §10) : radar par groupe, attributs avec XP, état de forme, potentiel flou, palmarès, historique. */
export default function ProfileScreen() {
  const career = useCareerStore((s) => s.career);
  const mutate = useCareerStore((s) => s.mutate);
  const busy = useCareerStore((s) => s.busy);
  // Brouillon local : `mutate` pose un verrou et sauvegarde à chaque appel, donc
  // on ne l'appelle qu'une fois, à la fermeture, et non à chaque clic de couleur.
  const [brouillonPortrait, setBrouillonPortrait] = useState<AvatarConfig | null>(null);
  if (!career) return null;
  const player = career.player;
  const isGoalkeeper = player.identity.position === 'GB';
  const groups = (isGoalkeeper ? (['technique', 'physique', 'mental', 'gardien'] as const) : (['technique', 'physique', 'mental'] as const));

  const club = career.world.clubs[player.contract.clubId];

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar
            {...(player.identity.avatar ? { config: player.identity.avatar } : { id: player.id })}
            {...(club ? { couleurs: club.colors } : {})}
            taille={72}
            anneau
            alt={`Portrait de ${player.identity.firstName} ${player.identity.lastName}`}
          />
          <div>
            <h1 className="font-display uppercase tracking-wide text-2xl leading-none">
              {player.identity.firstName} {player.identity.lastName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {player.identity.position} · {club?.name ?? 'sans club'} · {player.identity.heightCm} cm
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (brouillonPortrait) {
                  const choisi = brouillonPortrait;
                  setBrouillonPortrait(null);
                  void mutate('Portrait', (c) => { c.player.identity.avatar = choisi; });
                } else {
                  setBrouillonPortrait(player.identity.avatar ?? avatarParDefaut());
                }
              }}
            >
              {brouillonPortrait ? 'Enregistrer' : 'Mon portrait'}
            </Button>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted">Note globale</div>
              <div className="font-display text-4xl text-accent tabular-nums leading-none">{player.overall}</div>
            </div>
          </div>
        </div>

        {brouillonPortrait && (
          <div className="mt-5 border-t border-white/[0.07] pt-5">
            <AvatarPicker
              value={brouillonPortrait}
              onChange={setBrouillonPortrait}
              {...(club ? { couleurs: club.colors } : {})}
            />
          </div>
        )}
      </Panel>

      <Panel>
        <ProgressionPanel player={player} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>État actuel</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
            <Stat label="Note globale" value={player.overall} accent />
            <Stat label="Forme" value={`${player.form >= 0 ? '+' : ''}${player.form.toFixed(1)}`} />
            <Stat label="Condition" value={`${Math.round(player.fitness)}`} />
            <Stat label="Rythme" value={`${Math.round(player.sharpness)}`} />
            <Stat label="Moral" value={`${Math.round(player.morale)}`} />
            <Stat label="Confiance" value={`${Math.round(player.confidence)}`} />
          </div>
          <SectionTitle>Potentiel</SectionTitle>
          <p className="text-sm text-muted italic">
            {player.potentialEstimate.statement || 'Le staff n\'a pas encore d\'avis tranché.'}
          </p>

          <SectionTitle>Contrat</SectionTitle>
          <ul className="text-sm space-y-1">
            <li>Salaire mensuel : <NumberTabular value={formatEuros(player.contract.wageMonthly)} /></li>
            <li>Fin de contrat : {formatDateFrShort(player.contract.endsOn)}</li>
            {player.contract.releaseClause && <li>Clause libératoire : {formatEuros(player.contract.releaseClause)}</li>}
            <li>Rôle promis : {player.contract.promisedRole.replace(/_/g, ' ')}</li>
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>Radar des attributs</SectionTitle>
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <p className="text-[11px] uppercase tracking-wide text-muted text-center mb-1">{g}</p>
              <AttributeRadar attributes={player.attributes} keys={ATTRIBUTE_GROUPS[g]} />
            </div>
          ))}
        </Panel>
      </div>

      <Panel>
        <SectionTitle>Attributs détaillés</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
          {groups.flatMap((g) => ATTRIBUTE_GROUPS[g]).map((key) => (
            <AttributeRow key={key} attrKey={key} value={player.attributes[key]} xp={player.attributeXp[key]} />
          ))}
        </div>
      </Panel>

      {player.traits.length > 0 && (
        <Panel>
          <SectionTitle>Traits</SectionTitle>
          <ul className="space-y-1 text-sm">
            {player.traits.map((t) => (
              <li key={t.id} className={t.polarity === 'positif' ? 'text-signal-green' : t.polarity === 'negatif' ? 'text-signal-red' : 'text-muted'}>
                <strong>{t.label}</strong> — {t.description} <span className="text-muted">({t.origin})</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Palmarès</SectionTitle>
          {player.trophies.length === 0 && player.awards.length === 0 ? (
            <p className="text-sm text-muted">Rien pour l'instant.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {player.trophies.map((t, i) => (
                <li key={`trophy-${i}`}>{t.kind.replace(/_/g, ' ')} — {t.seasonId}</li>
              ))}
              {player.awards.map((a, i) => (
                <li key={`award-${i}`}>{a.kind.replace(/_/g, ' ')} — {formatDateFrShort(a.date)}</li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Historique des saisons</SectionTitle>
          {player.history.length === 0 ? (
            <p className="text-sm text-muted">Première saison en cours.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-white/[0.08]">
                  <th className="py-1 pr-2">Saison</th>
                  <th className="py-1 pr-2 text-right">Rang</th>
                  <th className="py-1 pr-2 text-right">Buts</th>
                  <th className="py-1 pr-2 text-right">Passes</th>
                  <th className="py-1 pr-2 text-right">Note</th>
                </tr>
              </thead>
              <tbody>
                {player.history.map((h) => (
                  <tr key={h.seasonId} className="border-b border-white/[0.05]">
                    <td className="py-1 pr-2">{h.label}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{h.leagueRank}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{h.stats.total.goals}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{h.stats.total.assists}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatRating(h.averageRating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <NumberTabular value={value} className={accent ? 'text-accent text-xl' : 'text-white text-lg'} />
    </div>
  );
}
