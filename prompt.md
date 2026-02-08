# OBJECTIF

## LE GET

GET dans cache-db-service
j'ai une seul methode get qui a pour paramettre idChannel, idUser et typeAchievement (que des string)

et ça retourne un tableau de ça (et ça serai le type userAchievement):

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "goal": 1,
  "reward": 2,
  "label": "string",
  "typeAchievement": {
    "id": "uuid",
    "label": "string",
    "data": "string"
  },
  "achieved": {
    "achievementId": "uuid",
    "userId": "uuid",
    "count": 1,
    "finished": false,
    "labelActive": true,
    "acquiredDate": "2024-01-01T00:00:00.000Z"
  }
}
```

1 - premierement tu dois check si ça existe pas en cache

/!\ ça doit etre stock dans la façon la plus opti dans le cache (seul la partie achieved peut varié mais le reste ne doit pas bougé et est utilisé par plusieurs user).

2-a - ça existe dans le cache tu map les donnée (celon comment elles ont été stock) pour retourné la valeur

2-b - ça n'existe pas et tu dois les get depuis un api
https://github.com/projet-ccm2/DB-gateway/blob/feat/database-setup-clean/doc/achievements.md

GET /achievements/user/:userId/channel/:channelId
pour recup l'avancement sur un succès

GET /achievements/channel/:channelId
pour récupérer tout les achievement d'une chaine (au cas ou le user na aucun avancement)

tu map les données pour les stock dans le cache et retourne les données map pour la fonction get.

tu filtre celon le typeAchievement.label (donc le parametre typeAchievement)
ça doit etre la seul fonction get dans cache-db-service

## L'UPDATE

c'est une fonction qui aura pour parametre le type userAchievement.

son objectif ? update l'info dans le cache c'est tout (avec le mapping qui a à faire pour avoir le minimum de chose dans le cache).

## l'update expired

il y a deja eu quelque chose d'implémenté pour update dans la db (donc un put sur l'api) si le ttl du cache est fini

adapte pour la nouvelle forme de l'objet
et maintenant l'endpoint utilisé c'est
PUT /achieved
https://github.com/projet-ccm2/DB-gateway/blob/feat/database-setup-clean/doc/achieved.md

## quel que modif a faire

pour ce qui est typage fait que userAchievement soit une classe avec des methode (static ou non) de mapping (genre from ça ou to ça...)
supprime tout ce qui est inutile (genre les anciennement methode de get)
met des commentaire pour expliqué les fonctions (une ligne ça sera supprimer a la suite)

objectif toujours. la simplicité, code propre et clair
