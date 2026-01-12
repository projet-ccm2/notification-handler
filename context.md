Ok maintenant tu vas creer 2 services. 
un qui va appelé la bdd (c'est un service qui va faire des requetes vers une db gateway donc requetes http) 

et un second c'est une connexion a redis cloud pour avoir un system de cache globalisé entre toute les instance de conteneur (car il y a plusieurs possiblité d'instance de ce projet). 

le fonctionnement sera comme ça:
3 fonction dans service db
1) get des info d'achievement 
il prend en parametre channelId
regarde dans le cache dans la table achievements si il existe pas deja
si il existe il ressort la liste

sinon
GET /achievements/{channelId}
[
    {
    "id": "a_first1",
    "title": "First Steps",
    "description": "Complete the tutorial",
    "goal": 1,
    "reward": 100,
    "label": "beginner"
    },
    ...
]
tu met tout en cache si il n'existe pas

2)get des info d'avancement des achievements 
ensuite avec l'id user et channel
même chose que precedement avec le cache,...
sinon la requetes c'est ça :
GET /achievements/user/{userId}/channel/{channelId}
[
    {
    "achievementId": "a_first1",
    "userId": "u_abc123",
    "count": 1,
    "finished": true,
    "labelActive": true,
    "acquiredDate": "2024-01-15T10:30:00.000Z"
    }
]

3 update des info d'avancement des achievements 
en gros quand le ttl est fini (je ne sais pas encore combien de temps le ttl mais met le en var d'env) ça va update 1 par 1 element avec une requete comme celle la :

POST /users/{userId}/achievements/{achievementId}
{
  "count": 1,
  "finished": true,
  "labelActive": true,
  "acquiredDate": "2024-01-15T10:30:00.000Z"
}

si il manque des element met des commentaire en anglais pour le signalé avec un "//TODO: "
sinon aucun commentaire
oublie pas que les var d'env c'est le fichier environment.ts dans le dossier config pour centralisé le tout