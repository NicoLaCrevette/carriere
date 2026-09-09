# CARRIÈRE

**Jouer en ligne : <https://nicolacrevette.github.io/carriere/>** — rien à
installer, ça marche depuis n'importe quel navigateur. La version en ligne
utilise les textes pré-écrits ; pour des dialogues générés gratuitement, joue
en local avec Ollama (voir plus bas) ou déploie la fonction de `edge/`.
Les sauvegardes vivent dans le navigateur : passe de l'un à l'autre avec
l'export et l'import JSON de l'écran Réglages.

Simulateur de carrière de footballeur, solo, jouable au clavier **et à la
voix**. Tu incarnes un seul joueur de ses 16-21 ans jusqu'à sa retraite. Les
matchs se jouent minute par minute sur les actions importantes, les réponses
sont libres (aucun choix multiple), les PNJ parlent à voix haute.

Le moteur de simulation est déterministe et testé ; le LLM ne fait que narrer,
dialoguer et interpréter. Un joueur qui parle bien gagne de la réputation,
jamais un but.

## Installation

Prérequis : Node.js 22 et npm 10.

```bash
npm install
```

Lancer le jeu (interface) :

```bash
npm run dev
```

Puis ouvre http://localhost:5173.

Lancer le proxy (recommandé) : il sert les **voix neuronales** des PNJ et les
dialogues générés — par Ollama en local et sans frais, ou par l'API Anthropic
si tu fournis une clé. Sans lui, le jeu reste jouable avec ses dialogues
pré-écrits et les voix du navigateur, nettement moins bonnes :

```bash
npm run server
```

## Gratuit par défaut

Le jeu ne coûte rien et ne dépend d'aucun service en ligne :

- le moteur, les sauvegardes, les données et tous les écrans sont locaux ;
- les PNJ parlent avec les voix du navigateur, et la reconnaissance vocale est
  celle de Chrome ou Edge ;
- sans modèle de langue, les dialogues, situations, narrations et titres de
  presse viennent de banques de textes écrites à la main, et tes réponses
  libres sont interprétées par un classificateur de mots-clés.

Aucune adresse externe n'apparaît dans le code du navigateur.

## Dialogues générés, gratuitement, avec Ollama

Si [Ollama](https://ollama.com) tourne sur ta machine, le proxy le détecte et
s'en sert automatiquement. Rien à configurer.

```bash
ollama pull qwen3:8b
npm run server
```

Le proxy choisit le plus gros modèle installé, le garde chargé en mémoire et
préchauffe au démarrage. L'écran Réglages affiche « Ollama local · gratuit »
et permet de changer de modèle : un modèle plus gros écrit un meilleur
français, un plus petit répond plus vite.

Mesuré sur `qwen3:8b`, modèle chargé : environ deux secondes pour décrire une
situation, classer une réponse libre ou narrer une action. Les délais du jeu
sont automatiquement triplés quand le fournisseur est local, et toute réponse
trop lente retombe sur les textes écrits sans jamais bloquer le match.

Toutes les tâches passent par une sortie JSON contrainte par schéma, ce qui
neutralise le raisonnement en anglais que certains modèles émettent.

## Clé API Anthropic (facultative, payante)

La clé ne quitte jamais ta machine et n'est jamais dans le bundle du
navigateur : elle est lue par le proxy local uniquement.

1. Lance le proxy (`npm run server`).
2. Copie `.env.example` en `.env` et renseigne `ANTHROPIC_API_KEY` avant de
   lancer le proxy, **ou** saisis la clé dans l'écran Réglages du jeu : le
   proxy la prend en compte immédiatement et l'enregistre dans `.env`.

L'écran Réglages indique l'état (proxy injoignable / sans clé / IA prête), permet
de désactiver l'IA et affiche le journal des appels (tâche, source, durée).

Modèles par défaut : `claude-sonnet-5` pour les dialogues courants,
`claude-opus-5` pour les grands moments (signature, finale, sélection).
Réglés dans `src/llm/tasks.ts`. Chaque tâche a un schéma Zod, un délai et un
repli pré-écrit : sans IA, les situations, narrations, questions et analyses de
communication viennent de banques de textes et d'un classificateur par
mots-clés.

## Voix

- **Entrée** : reconnaissance vocale du navigateur (`fr-FR`). Fonctionne dans
  Chrome et Edge. Barre espace maintenue = parler (push-to-talk), ou mode mains
  libres avec détection de fin de phrase. Le clavier reste toujours disponible.
- **Sortie** : **voix neuronales, gratuites, dès que le proxy tourne**
  (`npm run server`). Treize voix francophones réellement différentes —
  française, belge, québécoise, suisse — attribuées par rôle : le coach, ton
  agent et ta mère ne peuvent pas être confondus. Chaque PNJ garde la sienne
  toute la carrière. Aucune clé, aucun compte : le proxy passe par le service
  de lecture à voix haute d'Edge.
  Sans proxy, repli sur les voix du navigateur. Attention, elles sont pauvres :
  Windows n'installe que Hortense, Julie et Paul, et **on ne différencie pas
  des personnages en transposant la même voix** — au-delà d'environ ±12 %, la
  synthèse devient inintelligible. Les écarts de rôle restent donc dans cette
  bande, et un test le verrouille.
  Une clé ElevenLabs reste possible, payante, pour des voix incarnées.
  L'écran Réglages permet d'écouter un exemple de chaque rôle.
- **Tout vocal par défaut** : les PNJ parlent, le micro s'ouvre tout seul quand
  ils ont fini, et ta phrase part après 1,2 seconde de silence. Tu n'as jamais
  à écrire ni à cliquer. Le champ texte reste là pour corriger si tu veux.
  Trois modes dans Réglages : tout vocal, mixte (ils parlent, tu écris),
  silencieux.

## Jeux de données

- `src/data/leagues/real/ligue1-2026-27.json` : Ligue 1 2026-27 avec les vrais
  clubs, entraîneurs et effectifs, constitués par recherche web début
  septembre 2026. **À vérifier** : les mouvements de dernière minute peuvent
  manquer. Le fichier est lisible et modifiable à la main ; chaque club a aussi
  son fichier dans `src/data/leagues/real/clubs/`.
- `src/data/leagues/fictional/ligue1.json` : 18 clubs fictifs crédibles, sans
  droits.
- Import de ton propre jeu de données depuis Réglages (format validé par
  `src/data/schema.ts`).

Valider un fichier :

```bash
npx tsx src/scripts/validateDataset.ts src/data/leagues/real/ligue1-2026-27.json
```

## Comment se joue une journée

- **Accueil** : la semaine est l'unité de jeu. Elle s'ouvre sur un point de
  situation — le rang de ton club, l'adversaire et dans combien de jours, ce
  qu'il faut surveiller (condition, rythme, moral, série noire, blessure) — puis
  tu choisis un plan d'entraînement (une séance dominante et une intensité, ou
  tu laisses le staff décider), tu lances la semaine, et le jeu s'arrête tout
  seul dès qu'il se passe quelque chose : un match à jouer, ou quelqu'un qui
  veut te parler.
- **Ce que l'entraînement rapporte** : le bilan de semaine montre l'XP gagnée
  attribut par attribut, avec la barre de progression vers le point suivant
  (« Finition 60 · 11 % vers 61 »). Un point entier demande plusieurs semaines
  de la même séance : sans cette barre, la plupart des semaines semblaient ne
  rien rapporter. L'écran Profil met les débuts et aujourd'hui côte à côte, avec
  la courbe de la note globale et les attributs les plus progressés.
- **Jour de match** : « Jouer le match (minute par minute) » ouvre le direct.
  Le match défile ; sur chaque situation clé, tu écris ou dis ce que tu fais,
  avec un timer (« Laisser faire » = action par défaut). L'intention est
  classée, le moteur tire le résultat avec des probabilités plafonnées, puis la
  narration (commentateur, coach, capitaine, public) commente. **Chaque action
  dit pourquoi elle a marché ou non** : la probabilité, le tirage qui a décidé,
  et ce qui a pesé — distance, densité, pression, fraîcheur, adversaire direct,
  marquage, plafond du §6. Le bilan d'après-match reprend la même lecture pour
  toutes les décisions. « Simuler la fin
  du match » termine le match automatiquement. Le direct est sauvegardé à
  chaque situation : recharger reprend au même point, avec le même tirage.
- **Après le match** : bilan (note, cinq regards, décisions), titres de presse
  du lendemain, puis interview flash, conférence de presse ou passage au
  vestiaire selon la performance. Tu réponds librement ; l'analyse de
  communication (calme, humble, arrogant, promesse publique, coéquipier visé…)
  est affichée après coup avec son impact chiffré sur la réputation, et tout
  est consigné dans Médias (journal des citations, promesses tenues ou rompues).
- **Au fil des jours** : appel de l'agent, convocation dans le bureau du coach,
  proposées sur l'accueil quand les règles du moteur le décident.
- **Choix du club** : à la création, chaque club annonce ce qu'il te réserve —
  « Remplaçant · 5ᵉ sur 7 à ton poste », avec les notes de tes concurrents et
  ce qu'il te manque pour valoir le titulaire. Ce n'est pas décoratif : mesuré
  en simulation, un jeune attaquant signant dans un club où il est 7ᵉ choix ne
  dispute pas une seule titularisation en quatre saisons, tandis que le même
  joueur dans un club à sa mesure est titulaire dès la deuxième et marque 26
  buts en quatrième.
- **Quand tu ne joues plus** : le jeu compte les matchs consécutifs sans entrer,
  te le dit dans l'alerte de semaine, et le coach finit par te convoquer pour
  te dire que tu n'es pas dans ses plans. L'agent, lui, nomme l'offre : club,
  indemnité ou prêt, salaire, durée, rôle promis, position de ton club.
- **Carrière** : mercato (clubs qui te suivent, offres à accepter, négocier ou
  refuser, prolongations, demande de transfert publique, prêts), sponsors
  (propositions, négociation, obligations), revenus cumulés, traits acquis par
  des règles (sang-froid des grands soirs, chouchou du public, tête brûlée,
  fragile, mercenaire…), saison par saison, journal de carrière filtrable et
  histoires en cours, bilan de fin de saison, export du palmarès en JSON,
  retraite (dès 33 ans, imposée à 39).
- **Sélection** : trêves internationales, progression espoirs → pré-liste →
  convoqué → titulaire → cadre, matchs internationaux joués comme un match de
  club, changement de sélection tant que le premier match A n'est pas joué.
- **Événements** : au plus un par jour et deux par semaine (famille, agent,
  réseaux sociaux, vestiaire, presse, sponsor, coup du sort…). Chacun devient
  une scène : c'est ta réponse qui en choisit l'issue. Un événement laissé
  sans réponse se referme sans conséquence — le moteur sanctionne ce que tu
  dis, jamais ton silence. Storylines à échéance, et changement d'entraîneur
  après une série noire (au plus un par saison environ).
- **Sons** : bips de situation, clameur de but, sifflets, synthétisés dans le
  navigateur (désactivables dans Réglages).

## Simulation en console

Une saison complète sans interface, pour vérifier l'équilibrage :

```bash
npm run sim -- --seed=1 --dataset=real --position=BU --age=18 --level=prometteur --difficulty=exigeant
```

Options : `--seasons=N` (plusieurs saisons), `--club=<id>`, `--quiet`,
`--debug=N` (affiche les N premières décisions du joueur avec la probabilité
calculée, ses modificateurs et le plafond appliqué), `--offers=ambitieux`
(répond automatiquement aux offres de mercato : meilleur rôle ou meilleur
salaire dans un club de prestige comparable ; par défaut elles expirent).
Le bloc « Profondeur » en fin de sortie résume offres, transferts, contrat,
sponsors, revenus, traits, sélection, événements et erreurs journalisées.

## Tests

```bash
npm test
```

La suite inclut le garde-fou d'équilibrage : 100 saisons simulées doivent
respecter les cibles de distribution (médiane de note 6.3, un jeune attaquant
entre 4 et 9 buts, plafonds de probabilité jamais dépassés). Variable
`CARRIERE_SEASONS` pour réduire pendant le développement.

## Portraits

Chaque joueur a un portrait rond dessiné en SVG, sans image ni requête réseau.
Le tien se choisit à la création (peau, cheveux, coiffure, barbe, accessoire) ;
celui des coéquipiers et des PNJ est déduit de leur identifiant, donc stable
toute la carrière.

Ce qui vient du réel, c'est le **maillot** : les couleurs du club sont une
donnée du jeu de données. Les visages, eux, sont générés — la photo d'un joueur
réel ne nous appartient pas — et rien n'y est déduit de la nationalité.

## Structure

```
src/engine/      moteur déterministe (zéro dépendance UI), config/balance.ts = tous les réglages
src/data/        jeux de données et schéma d'import
src/llm/         appels LLM (schémas Zod, prompts, repli sans clé)
src/voice/       reconnaissance et synthèse vocales
src/store/       Zustand
src/db/          Dexie (IndexedDB, slots de sauvegarde)
src/ui/          écrans et composants React
server/proxy.ts  proxy local pour la clé Anthropic et ElevenLabs
docs/            cahier des charges et contrats de chaque couche
```

## Déterminisme

Chaque tirage vient de `hash(graine de carrière, portée, index)`. Recharger
une sauvegarde et redonner la même réponse produit exactement le même
résultat : il n'existe aucun chemin, par le dialogue ou par le rechargement,
vers un but.

Chaque carrière tire **sa propre graine** à la création, affichée et modifiable
au récapitulatif. Deux carrières de même fiche (même nom, même club, même jeu
de données) mais de graines différentes ne se ressemblent pas ; deux carrières
de même graine et même fiche sont rigoureusement identiques. Noter sa graine
permet de rejouer exactement la même carrière.
