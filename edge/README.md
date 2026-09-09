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

Le palier gratuit suffit à une carrière entière : le jeu appelle le modèle
quelques dizaines de fois par match. Si la limite de débit est atteinte, le jeu
retombe tout seul sur ses textes pré-écrits, sans erreur visible et sans
interrompre le match.

Cette fonction n'a pas été testée en conditions réelles : elle demande deux
comptes que je n'ai pas. Le contrat qu'elle expose est en revanche celui du
proxy local, déjà éprouvé, et le repli automatique la rend sûre à essayer.
