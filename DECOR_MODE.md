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

Autres réglages utiles pour la salle :

- `"nointro": true` : supprime l'animation de démarrage.
- `"cwd"` : pointer vers un petit dossier dédié au jeu (avec des fichiers « décor »), car le panneau fichiers affiche ce dossier.
- `"termWebGL": false` : seulement si le terminal s'affiche mal après une mise en veille du PC. Le terminal repasse alors sur le rendu canvas.

## Installer sur un eDEX-UI 2.2.8 déjà installé (Windows), sans recompiler

Les modifications ne touchent que des fichiers JavaScript/HTML : aucune dépendance native ne change.

1. Fermer eDEX-UI.
2. Ouvrir un terminal dans le dossier `resources` de l'installation, par exemple `C:\Program Files\eDEX-UI\resources` ou `%LOCALAPPDATA%\Programs\eDEX-UI\resources`.
3. Extraire l'archive : `npx @electron/asar extract app.asar app`
4. Copier par-dessus, depuis `src/` de ce dépôt, en gardant les mêmes chemins relatifs :
   - `_boot.js`, `_renderer.js`, `_multithread.js`, `ui.html`
   - `classes\` : `decor.class.js` (nouveau), `conninfo`, `cpuinfo`, `filesystem`, `hardwareInspector`, `locationGlobe`, `netstat`, `ramwatcher`, `sysinfo`, `terminal`, `toplist`, `updateChecker` (fichiers `.class.js`)
   - `assets\vendor\encom-globe.js`
5. Renommer `app.asar` en `app.asar.bak`. Electron charge alors le dossier `app`.
6. Ajouter `"decorMode": true` dans `settings.json`, puis lancer eDEX-UI.

Retour arrière : supprimer le dossier `app`, puis renommer `app.asar.bak` en `app.asar`.

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
