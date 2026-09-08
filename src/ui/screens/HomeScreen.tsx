import { useEffect } from 'react';
import { playerMatchOfDay } from '../../engine/calendar/advanceDay';
import { useCareerStore } from '../../store/careerStore';
import { useMatchStore } from '../../store/matchStore';
import { useSceneStore } from '../../store/sceneStore';
import { useUiStore } from '../../store/uiStore';
import { selectLastPlayerMatch } from '../../store/selectors';
import TopBar from '../components/TopBar';
import CareerSummaryPanel from '../components/CareerSummaryPanel';
import SeasonRecapPanel from '../components/SeasonRecapPanel';
import WeekPanel from '../components/WeekPanel';
import Panel from '../components/Panel';
import Button from '../components/Button';
import SectionTitle from '../components/SectionTitle';
import ScenePanel from '../scenes/ScenePanel';

/**
 * Accueil (§4, §13) : la semaine est l'unité de jeu. On choisit un plan
 * d'entraînement, on lance la semaine, et le jeu s'arrête tout seul quand il
 * se passe quelque chose : un match à jouer, ou quelqu'un qui veut te parler.
 */
export default function HomeScreen() {
  const career = useCareerStore((s) => s.career);
  const lastWeek = useCareerStore((s) => s.lastWeek);
  const busy = useCareerStore((s) => s.busy);
  const advanceWeek = useCareerStore((s) => s.advanceWeek);
  const beginDay = useCareerStore((s) => s.beginDay);
  const startMatch = useMatchStore((s) => s.start);
  const proposeForDay = useSceneStore((s) => s.proposeForDay);
  const sceneActive = useSceneStore((s) => s.active !== null);
  const scenesEnAttente = useSceneStore((s) => s.proposed.length);
  const navigate = useUiStore((s) => s.navigate);
  const plan = useUiStore((s) => s.weekPlan);
  const setPlan = useUiStore((s) => s.setWeekPlan);
  const currentDate = career?.currentDate;

  // Ce qu'on a à te dire aujourd'hui : recalculé à chaque date par des règles du moteur.
  useEffect(() => {
    if (currentDate) proposeForDay();
  }, [currentDate, proposeForDay]);

  if (!career) return null;

  if (career.retired) {
    return (
      <div className="flex flex-col">
        <TopBar career={career} />
        <div className="p-4 space-y-4">
          <CareerSummaryPanel career={career} />
          <Panel>
            <p className="text-sm text-muted">La carrière est terminée. Les écrans restent consultables ; exporte la sauvegarde depuis Réglages pour garder ce palmarès.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => navigate('career')}>Voir la carrière</Button>
              <Button variant="ghost" onClick={() => navigate('media')}>Relire les déclarations</Button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const matchToday = !!career.pendingDay || !!playerMatchOfDay(career, career.currentDate);
  const lastMatch = selectLastPlayerMatch(career);
  const lastRecord = career.pastSeasons[career.pastSeasons.length - 1];
  const seasonJustEnded = lastWeek?.stop === 'fin_de_saison' && !!lastRecord;
  const openOffers = career.offers.filter((o) => o.status === 'en_attente' || o.status === 'en_negociation');
  const sponsorProposals = career.sponsors.filter((d) => d.status === 'proposee');

  const handleWeek = async () => {
    const result = await advanceWeek(plan);
    // Un événement a interrompu la semaine : la scène correspondante doit apparaître tout de suite.
    if (result?.stop === 'evenement' || result?.stop === 'match') proposeForDay();
  };

  const handlePlayMatch = async () => {
    try {
      const pending = career.pendingDay ? career.pendingDay.matchId : await beginDay();
      if (!pending) return;
      navigate('match');
      await startMatch();
    } catch {
      // L'erreur est déjà affichée par le store.
    }
  };

  return (
    <div className="flex flex-col">
      <TopBar career={career} />

      {seasonJustEnded && lastRecord && (
        <div className="px-4 pt-4">
          <SeasonRecapPanel career={career} record={lastRecord} />
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Ce qui demande une réponse passe avant tout le reste. */}
        {(sceneActive || scenesEnAttente > 0) && <ScenePanel title="On veut te parler" />}

        <Panel>
          <WeekPanel
            career={career}
            plan={plan}
            onPlan={setPlan}
            onAdvance={() => void handleWeek()}
            onPlayMatch={() => void handlePlayMatch()}
            matchToday={matchToday}
            busy={busy}
            disabled={sceneActive}
            last={lastWeek}
          />
        </Panel>

        {(openOffers.length > 0 || sponsorProposals.length > 0) && (
          <Panel accent>
            <SectionTitle right={<Button variant="ghost" onClick={() => navigate('career')}>Voir dans Carrière</Button>}>À traiter</SectionTitle>
            <ul className="text-sm space-y-1">
              {openOffers.map((o) => (
                <li key={o.id}>
                  Offre de {career.world.clubs[o.clubId]?.name ?? o.clubId}
                  {o.clubId === career.player.contract.clubId ? ' (prolongation)' : ''} · expire le {o.expiresOn}
                </li>
              ))}
              {sponsorProposals.map((d) => (
                <li key={d.id}>Proposition de sponsoring : {d.brand}</li>
              ))}
            </ul>
          </Panel>
        )}

        {lastMatch && (
          <Panel>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">Tu peux revoir ton dernier match à tout moment.</p>
              <Button variant="ghost" onClick={() => navigate('match')}>Revoir le dernier match</Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
