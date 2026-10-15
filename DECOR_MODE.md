# Mode décor (escape game)

Le mode décor remplace toutes les mesures système et réseau de l'interface par une simulation en mémoire.
Avec ce mode :

- aucun `wmic`, PowerShell, `ps` ni processus de surveillance n'est lancé ;
- aucun ping, aucune requête Internet (IP publique, GeoIP, mise à jour) n'est faite ;
- les panneaux restent animés, avec un thème « repaire de KASPER » : processus `ice_breaker`, `jade_scrambler`, `proxy_chain`…, CPU « NEURAL CORE X7 », OS `ksp-os` ;
- les graphiques CPU et réseau **réagissent à l'activité du terminal** : quand le jeu affiche du texte ou lance l'upload, le CPU, la température et le débit montent.

Le terminal, lui, reste un vrai shell : le jeu (`node game.js`) y tourne normalement.

## Activer

Dans `%APPDATA%\eDEX-UI\settings.json`, ajouter :

```json
"decorMode": true
```

On peut aussi passer par l'éditeur de réglages (Ctrl+Shift+S), ligne `decorMode`, puis « Restart eDEX ».

Personnalisation facultative : un objet `"decor"` dans le même fichier. Toutes les clés sont optionnelles.

```json
"decor": {
    "osName": "ksp-os",
    "cpuManufacturer": "JADE-TEK ",
    "cpuBrand": "NEURAL CORE X7",
    "systemManufacturer": "KASPER CUSTOM",
    "systemModel": "BLACKICE 777",
    "externalIp": "203.0.113.77",
    "latitude": 22.3193,
    "longitude": 114.1694,
    "cores": 8,
    "memTotalGiB": 64,
    "diskUse": 77.7
}
```

### Fausse date et fausse heure

En mode décor, l'horloge, la date, l'uptime, l'écran de boot et les dates de la liste des processus affichent une heure fictive. Les joueurs ne peuvent donc pas s'en servir pour savoir combien de temps il leur reste.

- L'année est **2077** ; le jour et le mois restent ceux du jour réel.
- L'heure est décalée au hasard, de 2 h à 22 h, **à chaque lancement**. Les secondes défilent normalement.
- L'uptime affiché part de 77 jours. Il ne trahit donc pas depuis quand le PC est allumé.

Réglages possibles dans `"decor"` :

```json
"decor": {
    "fakeClock": true,
    "year": 2077,
    "clockOffsetMinutes": null,
    "clockSpeed": 1,
    "uptimeDays": 77
}
```

- `clockOffsetMinutes` : décalage fixe en minutes (par ex. `-180`). `null` donne un décalage aléatoire.
- `clockSpeed` : vitesse de l'horloge. Par ex. `1.5` fait défiler le temps plus vite, ce qui met de la pression.
- `fakeClock: false` : remet la vraie heure.

### Panneau fichiers

Il est **masqué par défaut** : le clavier se recentre. Pour le réafficher, mettre `"showFilesystem": true` (ou passer par la ligne `showFilesystem` de l'éditeur de réglages). Tant qu'il est masqué, les raccourcis qui en dépendent sont sans effet : recherche Ctrl+Shift+F, Ctrl+Shift+L et Ctrl+Shift+H.

Autres réglages utiles pour la salle :

- `"nointro": true` : supprime l'animation de démarrage.
- `"cwd"` : le dossier où s'ouvre le terminal, par exemple celui qui contient `game.js`.
- `"termWebGL": false` : seulement si le terminal s'affiche mal après une mise en veille du PC. Le terminal repasse alors sur le rendu canvas.

## Installer sur le PC Windows

Il n'y a pas besoin de recompiler. Le pas-à-pas complet (sauvegarde, remplacement des fichiers, réglages, vérifications, retour arrière) est dans [`INSTALLATION_WINDOWS.md`](INSTALLATION_WINDOWS.md).

## Ce qui change aussi hors mode décor

En mode normal (`decorMode` absent ou `false`), l'interface est aussi beaucoup plus légère sous Windows :

- 1 processus de surveillance au lieu de 7 maximum ;
- `cpu()` (2 `wmic` + 1 PowerShell par seconde) est remplacé par `cpuCurrentSpeed()` ;
- `processes()` est partagé entre les panneaux et interrogé toutes les 5 s ;
- la batterie est relue toutes les 60 s au lieu de 3 s, les infos matérielles une seule fois ;
- le globe tourne à 15 images/s, les graphiques aussi ;
- des fuites sur les longues sessions sont corrigées (terminal, globe) ;
- les modules ne restent plus figés après une erreur ;
- le panneau fichiers ne gèle plus dans les gros dossiers.
