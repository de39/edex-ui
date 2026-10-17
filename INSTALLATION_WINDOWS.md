# Installer cette version sur le PC Windows de la salle

## Faut-il recompiler le .exe ?

**Non.** Toutes les modifications (mode décor, fausse heure, panneau fichiers masqué, optimisations) touchent seulement des fichiers JavaScript, HTML et CSS. eDEX-UI les lit au démarrage : il n'y a rien à compiler.

On garde donc l'eDEX-UI déjà installé et on remplace seulement ses fichiers d'interface. Le `.exe`, Electron et le module natif du terminal (`node-pty`) restent ceux de l'installation actuelle.

Recompiler l'installeur ne servirait que si l'on changeait un jour les dépendances, par exemple la version d'Electron. Cela demande Visual Studio Build Tools, Python et Node 14 : c'est long et inutile ici.

## Avant de commencer

**Ce qu'il faut :**

- **eDEX-UI 2.2.8 installé.** Pour vérifier la version, ouvrir eDEX puis faire Ctrl+Shift+S : elle apparaît dans le titre « Settings (v2.2.8) ». Si c'est une autre version, installer d'abord la 2.2.8 (`eDEX-UI-Windows-x64.exe`) depuis https://github.com/GitSquared/edex-ui/releases/tag/v2.2.8
- **Node.js**, déjà présent puisque `game.js` tourne avec. Vérifier dans un terminal avec `node -v`.
- **Une connexion Internet** pendant l'installation, seulement à l'étape 3 (téléchargement de l'outil `asar`).

**Le temps nécessaire :** environ 15 minutes. Le retour arrière prend 1 minute.

## Étape 1 : télécharger cette version

1. Ouvrir https://github.com/de39/edex-ui/tree/claude/peaceful-bardeen-ruuwly
2. Cliquer sur **Code**, puis **Download ZIP**.
3. Extraire le ZIP, par exemple dans `C:\edex-decor\`. On obtient un dossier comme `C:\edex-decor\edex-ui-claude-peaceful-bardeen-ruuwly\`, qui contient un sous-dossier `src`.

Dans la suite, on appelle ce dossier `src` le **dossier source**, par exemple `C:\edex-decor\edex-ui-claude-peaceful-bardeen-ruuwly\src`.

## Étape 2 : trouver le dossier d'installation d'eDEX

1. Fermer eDEX-UI s'il est ouvert. Ctrl+Shift+Échap ouvre le Gestionnaire des tâches : vérifier qu'il ne reste aucun processus « eDEX-UI ».
2. Faire un clic droit sur le raccourci eDEX-UI (bureau ou menu Démarrer), puis **Ouvrir l'emplacement du fichier**. Si l'emplacement affiché est encore un raccourci, refaire la même manipulation jusqu'à trouver `eDEX-UI.exe`.
3. Ce dossier contient un sous-dossier **`resources`**, dans lequel se trouve `app.asar`. Les emplacements habituels sont :
   - `C:\Users\<vous>\AppData\Local\Programs\eDEX-UI\resources`
   - `C:\Program Files\eDEX-UI\resources`

Dans la suite, on appelle ce dossier `resources` le **dossier d'installation**.

## Étape 3 : extraire l'interface actuelle

`app.asar` est une archive qui contient toute l'interface. On l'extrait dans un dossier normal, pour pouvoir remplacer les fichiers.

1. Ouvrir **PowerShell**. Si eDEX est installé dans `C:\Program Files`, l'ouvrir **en administrateur** : clic droit sur PowerShell, puis « Exécuter en tant qu'administrateur ».
2. Se placer dans le dossier d'installation, en adaptant le chemin :

   ```powershell
   cd "$env:LOCALAPPDATA\Programs\eDEX-UI\resources"
   ```

3. Faire une sauvegarde de l'archive d'origine :

   ```powershell
   Copy-Item app.asar app.asar.bak
   ```

4. Extraire l'archive dans un dossier `app` :

   ```powershell
   npx @electron/asar extract app.asar app
   ```

   À la question « Need to install the following packages… Ok to proceed? », répondre `y`.

   On obtient un dossier `resources\app` qui contient `_boot.js`, `ui.html`, `classes`, `node_modules`…

5. **Vérification obligatoire** avant de continuer :

   ```powershell
   Test-Path app\node_modules\signale
   ```

   La réponse doit être `True`. Si c'est `False`, ou si la commande `extract` a affiché du texte rouge (par exemple `EPERM` ou `operation not permitted`), l'extraction a échoué. La cause habituelle est un PowerShell qui n'a pas été ouvert en administrateur alors qu'eDEX est dans `C:\Program Files`.

   Dans ce cas, **ne pas continuer** : supprimer le dossier `app` (`Remove-Item app -Recurse -Force`), rouvrir PowerShell en administrateur et refaire l'étape 3. Sinon, eDEX affichera au lancement l'erreur « Cannot find module 'signale' ».

## Étape 4 : copier les nouveaux fichiers par-dessus

Toujours dans PowerShell, dans le dossier d'installation, en adaptant le chemin du dossier source :

```powershell
Copy-Item -Path "C:\edex-decor\edex-ui-claude-peaceful-bardeen-ruuwly\src\*" -Destination app -Recurse -Force
```

Cette commande remplace les fichiers d'interface. Le dossier `app\node_modules`, qui contient le terminal et les librairies, n'est pas touché : il n'existe pas dans le dossier source.

Pour vérifier, `app\classes\decor.class.js` doit maintenant exister :

```powershell
Test-Path app\classes\decor.class.js
```

La réponse attendue est `True`.

## Étape 5 : désactiver l'ancienne archive

Electron charge le dossier `app` quand il le trouve, mais on retire quand même `app.asar` pour éviter toute ambiguïté. La copie de sauvegarde `app.asar.bak` est déjà faite.

```powershell
Remove-Item app.asar
```

Il ne faut **pas** toucher au dossier `app.asar.unpacked` s'il existe : on le garde tel quel.

## Étape 6 : activer le mode décor

1. Ouvrir le fichier de réglages :

   ```powershell
   notepad "$env:APPDATA\eDEX-UI\settings.json"
   ```

2. Ajouter ces lignes juste après l'accolade ouvrante `{`. La virgule en fin de ligne est obligatoire.

   ```json
       "decorMode": true,
       "nointro": true,
   ```

   Si `"nointro"` existe déjà plus bas dans le fichier, modifier cette ligne existante au lieu d'en ajouter une deuxième.

3. Facultatif : faire ouvrir le terminal directement dans le dossier du jeu, en remplaçant la valeur de `"cwd"`. Par exemple :

   ```json
       "cwd": "C:\\escape\\kasper",
   ```

   Il faut des doubles barres obliques inverses `\\` dans ce fichier.

4. Enregistrer et fermer le Bloc-notes.

En cas d'erreur de syntaxe dans ce fichier, eDEX ne démarre pas. Il faut alors le rouvrir et vérifier les virgules et les guillemets.

Les autres réglages possibles (année, vitesse de l'horloge, noms affichés, panneau fichiers…) sont décrits dans [`DECOR_MODE.md`](DECOR_MODE.md).

## Étape 7 : lancer et vérifier

Lancer eDEX-UI avec le raccourci habituel, puis vérifier ces points :

| Où regarder | Résultat attendu |
|---|---|
| En haut à gauche, sous l'horloge | Année **2077**, une heure fausse, TYPE **ksp-os** |
| Fabricant et modèle | **KASPER CUSTOM / BLACKICE 777** |
| Liste des processus | `ice_breaker`, `jade_scrambler`, `hashcat`… |
| Réseau | Interface **ksp0**, IP **203.0.113.77**, ONLINE |
| En bas à gauche | Le panneau fichiers n'apparaît plus et le clavier est centré |
| Dans le terminal | Lancer le jeu (`node game.js`) ; pendant l'upload, les graphiques CPU et réseau doivent monter |
| Gestionnaire des tâches, onglet Détails | Plus de `wmic.exe` ni de `powershell.exe` qui apparaissent en boucle |

Si l'écran reste noir ou si une erreur s'affiche, passer au retour arrière ci-dessous, puis me transmettre le message d'erreur.

### Erreur « Cannot find module 'signale' » au lancement

Le dossier `app` a été créé sans les librairies d'eDEX (`node_modules`) : l'extraction de l'étape 3 n'a pas abouti. Pour réparer, dans un PowerShell **ouvert en administrateur**, dans le dossier d'installation :

```powershell
Rename-Item app app_casse
Copy-Item app.asar.bak app.asar
npx @electron/asar extract app.asar app
Test-Path app\node_modules\signale
```

La dernière commande doit afficher `True`. Ensuite, reprendre l'étape 4 (copie des nouveaux fichiers) et l'étape 5 (`Remove-Item app.asar`), puis relancer eDEX. Quand tout fonctionne, le dossier `app_casse` peut être supprimé.

## Mettre à jour `game.js`

Remplacer l'ancien `game.js` par la version corrigée, au même endroit, pour que `node_modules\mqtt` reste à côté. **Garder une copie de l'ancien.** Rien d'autre n'est à changer.

## Retour arrière (revenir à l'eDEX d'origine)

Fermer eDEX-UI, puis, dans PowerShell, dans le dossier d'installation :

```powershell
Remove-Item app -Recurse -Force
Rename-Item app.asar.bak app.asar
```

eDEX redevient exactement comme avant. On peut laisser `"decorMode": true` dans `settings.json` : la version d'origine ignore ce réglage.

## Plus tard : installer une nouvelle version de ces modifications

Il suffit de refaire l'**étape 1**, pour télécharger le nouveau ZIP, puis l'**étape 4**, pour copier par-dessus le dossier `app`. Les autres étapes sont déjà faites.

## Ce qui n'a pas pu être testé

- Les modifications ont été testées en lançant le vrai eDEX-UI 2.2.8 (Electron 12), sous Linux, avec le mode décor, le jeu dans le terminal, la fausse horloge et le panneau fichiers masqué.
- Elles n'ont **pas** été testées sur un PC Windows 11.
- Faire un essai complet avant une vraie session de jeu, avec la sauvegarde `app.asar.bak` à portée de main.
