# Dialogues générés pour la version en ligne

Le jeu publié sur GitHub Pages tourne sur ses textes pré-écrits : c'est
volontaire, il est entièrement jouable ainsi, et ça ne coûte rien. Cette
fonction ajoute des dialogues et une narration générés, **sans PC allumé** —
c'est ce qui manque quand on joue ailleurs que chez soi.

Elle utilise **Mistral** par défaut. Deux raisons : le palier gratuit suffit
largement, et ce sont des modèles français natifs — le jeu est entièrement en
français, et c'est là que la différence s'entend. Tout fournisseur compatible
OpenAI reste utilisable en changeant `LLM_BASE` et les modèles.

La clé reste dans un secret Cloudflare. Elle n'apparaît jamais dans le
navigateur, contrairement à ce qui arriverait si le jeu appelait l'API
directement — et le dépôt étant public, une clé dans le bundle serait lisible
par n'importe qui.

## Mise en place, une seule fois

1. Crée un compte sur <https://console.mistral.ai> et une clé d'API. Le palier
   gratuit (« Experiment ») ne demande aucune carte ; il est limité en débit
   (de l'ordre d'une requête par seconde), ce qui suffit très largement à un
   joueur seul. Mistral ne publie plus les limites exactes : elles sont dans la
   console, section *Limits*.
2. Crée un compte Cloudflare (gratuit) : <https://dash.cloudflare.com>.
3. Depuis ce dossier :

```bash
cd edge && npx wrangler login
```

```bash
cd edge && npx wrangler secret put LLM_API_KEY
```

```bash
cd edge && npx wrangler deploy
```

`wrangler deploy` affiche l'adresse de la fonction, du type
`https://carriere-llm.<ton-compte>.workers.dev`.

4. Donne cette adresse au jeu, en la déclarant comme variable du dépôt :

```bash
gh variable set LLM_BASE_URL --body "https://carriere-llm.<ton-compte>.workers.dev/api"
```

5. Relance la publication pour que le jeu la prenne en compte :

```bash
gh workflow run "Publier le jeu sur GitHub Pages"
```

## Vérifier

```bash
curl https://carriere-llm.<ton-compte>.workers.dev/api/key/status
```

Doit répondre `{"present":true,...}`. Dans le jeu, l'écran Réglages affiche
alors le fournisseur, et les scènes cessent d'être marquées « repli ».

## Sortie contrainte par schéma

Mistral contraint le décodage au schéma JSON de chaque tâche
(`response_format: json_schema`, `strict: true`) : le modèle ne *peut* pas
sortir du format attendu. C'est ce qui supprime les réponses hors schéma et le
raisonnement en anglais que certains modèles ajoutent autour de leur réponse.

Si le fournisseur refuse ce mode (400 ou 422), la fonction retente
automatiquement en `json_object` avec le schéma dans la consigne. Aucun réglage
à faire ; `LLM_JSON_SCHEMA = "0"` force ce second mode d'emblée.

## Coût et limites

Ce n'est pas illimité, mais l'écart est tel que ça ne se sent pas. Le palier
gratuit de Mistral autorise **1 requête par seconde, 500 000 tokens par minute
et 1 milliard de tokens par mois** (chiffres à vérifier dans la console, section
*Limits* : Mistral ne les publie plus).

Le jeu consomme, estimé à partir des `maxTokens` réels de chaque tâche et de la
taille des prompts : environ **1 400 tokens par appel**, trois appels par
situation, une douzaine de situations par match — soit **~60 000 tokens par
match**, ~2,4 millions par saison. Le plafond mensuel représente donc de l'ordre
de **20 carrières complètes par mois**.

La vraie contrainte est le débit, pas le volume. Les appels d'un match sont
séquentiels (décrire → tu réponds → classer → narrer), donc une requête par
seconde passe. Quand la limite est malgré tout atteinte, le fournisseur répond
429 : la fonction renvoie le délai à respecter, le client attend puis réessaie
une fois, et à défaut le jeu retombe sur ses textes pré-écrits — sans erreur
visible et sans interrompre le match.

Cette fonction n'a pas été testée en conditions réelles : elle demande deux
comptes que je n'ai pas. Le contrat qu'elle expose est en revanche celui du
proxy local, déjà éprouvé, et le repli automatique la rend sûre à essayer.
