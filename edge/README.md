# Dialogues générés pour la version en ligne

Le jeu publié sur GitHub Pages tourne sur ses textes pré-écrits : c'est
volontaire, il est entièrement jouable ainsi, et ça ne coûte rien. Cette
fonction ajoute des dialogues et une narration générés, sans PC allumé.

La clé du fournisseur reste dans un secret Cloudflare. Elle n'apparaît jamais
dans le navigateur, contrairement à ce qui arriverait si le jeu appelait
l'API directement.

## Mise en place, une seule fois

1. Crée une clé sur un fournisseur compatible OpenAI à palier gratuit. Groq
   convient bien : <https://console.groq.com> → API Keys.
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

## Coût et limites

Le palier gratuit de Groq suffit à une carrière entière : le jeu appelle le
modèle quelques dizaines de fois par match. Si la limite est atteinte, le jeu
retombe tout seul sur ses textes pré-écrits, sans erreur visible.

Cette fonction n'a pas été testée en conditions réelles : elle demande un
compte que je n'ai pas. Le contrat qu'elle expose est en revanche celui du
proxy local, déjà éprouvé.
