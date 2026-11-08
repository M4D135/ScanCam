# Validation de ScanLibre 1.2.0

État de qualification du **7 novembre 2026**. La version 1.2.0 réorganise l’interface ; le moteur de lecture est inchangé. Les essais automatisés, les contrôles d’interface et les vérifications matérielles restant à réaliser sont distingués ci-dessous.

Les contrôles d’interface ont porté sur le **fichier HTML compilé**, ouvert dans Chrome sous Linux via `localhost`. Les petits formats ont été exercés dans des cadres de navigateur aux dimensions indiquées : ils vérifient la présentation responsive, pas le comportement d’un téléphone physique ou de Safari.

## Résultats automatisés

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` | **40 tests réussis, 1 ignoré, aucun échec** | Le test facultatif sur photo locale n’a pas été exécuté pour cette qualification 1.2.0. |
| Faible contraste | **Gain démontré** | Code 128, EAN-13, Data Matrix et QR synthétiques échouent avec la lecture simple et réussissent avec le rattrapage de contraste. |
| Codes-barres fins en diagonale | **Gain démontré** | Code 128, Code 39 et EAN-13 inclinés à 45° échouent avec la lecture simple et réussissent en Précision. |
| Réglages caméra | **12 tests sur tracks simulés** | Capacités, pas et bornes, refus, demande ignorée, retour retardé, réinitialisation, arrêt et remplacement. |
| Bip | **2 tests audio simulés** | Niveau borné, zéro silencieux, absence de voix lorsque l’audio est bloqué et remplacement d’un bip précédent. |
| Réseau du moteur | **Aucune requête** | Les tests interdisent `fetch` durant l’initialisation et les lectures. |

## Contrôles de la nouvelle interface

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Présentation PC | **Contrôlée** | Largeur de 1 363 px, thèmes sombre et clair, lecteur/résultat et écrans Historique/Réglages. |
| Écrans mobiles | **Contrôlés** | Cadres de 320 × 640, 390 × 844 et 820 × 844 px ; Scanner, Résultat, Historique et Réglages s’affichent séparément. Le seuil de navigation mobile est de 900 px. |
| Changement de disposition | **Contrôlé** | Passage de 1 024 à 390 px, avec adaptation de la navigation et des panneaux. |
| Scanner à 320 × 640 px | **Tient dans la zone disponible** | Largeur du document : 320 px ; hauteur : 640 px. Le bas des commandes est à 529,6 px, avant la barre de navigation qui commence à 558 px. |
| Agrandissement à 200 % | **Sans débordement horizontal observé** | Vérifié sur PC à 1 363 px et dans Réglages à 320 px. |
| Import de codes synthétiques | **Contenu exact** | Code 128 peu contrasté : `INVENTAIRE-00042` ; QR à champs nommés : `S/N: DEMO-2026; P/N: GENERIC-42`. Résultats, lectures récentes et compteurs cohérents. |
| Texte long | **Conservé et copié intégralement** | QR synthétique de 854 caractères ; copie manuelle exacte et absence de débordement horizontal. |
| Import depuis Historique sur mobile | **Réussi** | Ctrl+O ouvre l’import ; après la fin du lot, l’écran Résultat est affiché. |
| Consultation de l’historique | **Réussie** | Recherche `INVENTAIRE`, puis Afficher, copie exacte et retour navigateur ; filtre et focus conservés. |
| Export CSV | **Fichier relu et exact** | Deux entrées, cinq colonnes, contenu contrôlé après téléchargement. |
| Confirmation de suppression | **Réussie** | Annuler conserve les deux entrées. Confirmer remet à zéro les compteurs, le résultat courant, les lectures récentes et l’état `data-has-result`, puis réaffiche l’état vide. |
| Historique volontaire | **Mémorisation vérifiée** | Deux entrées retrouvées après activation de la conservation et rechargement. |
| Préférences | **Mémorisation vérifiée** | Volume 100 %, densité Compacte et animations Réduites retrouvés au rechargement. En fin d’essai, densité Confortable, animations Expressives et échelle 100 % ont été sélectionnées. |
| Aperçu dans Réglages | **Déplacement du même élément vérifié** | `previewStage` passe dans l’emplacement de Réglages, puis revient dans Scanner, sans duplication de vidéo/canvas. |
| Caméra absente | **Erreur intégrée** | Démarrage tenté depuis Réglages : message d’indisponibilité dans l’interface ; aucune webcam physique disponible. |
| Raccords d’accessibilité | **Revue statique effectuée** | IDs uniques, libellés de commandes, cibles de focus, aide, nom du raccourci caméra et indicateur de résultat reliés. Cela ne constitue pas un essai avec lecteur d’écran. |

La lecture caméra notifie un nouveau résultat sans changer d’écran. Sur mobile, un import réussi ouvre Résultat à la fin du lot seulement si Scanner est toujours affiché. Ces comportements sont séparés dans l’application ; les essais d’import ci-dessus ne valident pas une lecture sur webcam physique.

## Limites de qualification

| Périmètre | État | Portée |
| --- | --- | --- |
| Webcam physique et commandes matérielles | **Non testées** | Aucune webcam physique disponible dans l’environnement. Les simulations ne valident pas un pilote ou un modèle réel. |
| Téléphone/tablette physique et Safari | **Non testés** | Les dimensions mobiles ont été exercées dans Chrome sous Linux ; pas de qualification tactile, de permissions ou de caméra sur iOS/Android. |
| Photo réelle dans l’interface 1.2.0 | **Non retestée** | Les imports de cette qualification utilisent des images synthétiques. Le test photo facultatif de la suite a été ignoré. |
| Niveau sonore audible sur le poste | **Non mesuré** | Le signal Web Audio est couvert par simulation ; le niveau réel dépend du système et des haut-parleurs. |
| Windows et ouverture directe `file://` | **Non testés** | QA sur navigateur Linux via `localhost`. La navigation directe vers un fichier est bloquée dans cet environnement de test. |
| Lecteur d’écran | **Non testé** | Les vérifications statiques et de focus ne remplacent pas une qualification avec une technologie d’assistance. |

Les images et identifiants réels ne sont présents ni dans les sources, ni dans les exemples, ni dans les packs. Les exemples versionnés sont fictifs. Aucun nouvel appel réseau ni dépendance externe n’a été ajouté pour cette refonte. Le gain de décodage observé sur des fixtures ne constitue pas une promesse de lecture de tous les codes ni une mesure de cadence sur webcam.

## Couverture automatisée

### Moteur et récupération

`tests/decoder.test.mjs` vérifie l’initialisation partagée du moteur embarqué, les Data Matrix tournés et inversés, le filtrage des formats, les codes 1D, les caractères Unicode et de contrôle, les images vides, le test photo facultatif et l’absence de réseau.

`tests/detection.test.mjs` compare la lecture simple et les profils supplémentaires sur des images synthétiques construites indépendamment du code de récupération. Il contrôle le faible contraste, les codes fins en diagonale, les coordonnées après rotation et recadrage, l’exclusion des codes extérieurs à la zone centrale, le filtrage des formats, l’annulation entre les passes, les limites d’image et la conservation des pixels d’entrée. Les trois profils s’arrêtent dès qu’une passe trouve des résultats.

Le profil Équilibré effectue au maximum deux passes ; Précision au maximum quatre. La lecture 1D conserve une confirmation sur au moins deux lignes. Les buffers de rotation et d’agrandissement sont limités à 4 mégapixels ; les entrées du pipeline à 20 mégapixels. L’application réduit au préalable ses imports à 4 096 pixels sur le plus grand côté et ses captures selon le profil.

Le budget de recherche est **souple** : il est contrôlé entre les appels synchrones du moteur. Un appel WASM déjà lancé ne peut pas être interrompu instantanément. Le pipeline rend la main entre les passes et n’émet pas de résultat lorsque la session a été annulée.

### Caméra

`tests/camera.test.mjs` utilise des doubles de `MediaStreamTrack` pour vérifier :

- Les réglages réellement annoncés, les fonctions fixes ou absentes et les valeurs non communiquées.
- Les résolutions préférées et la cadence maximale, sans demande de microphone.
- L’application sérialisée, les bornes et l’alignement sur les pas matériels.
- La dépendance des valeurs manuelles aux modes de mise au point, d’exposition et de balance des blancs.
- Les refus explicites, les demandes ignorées silencieusement et les valeurs retournées avec retard.
- La conservation des contraintes vidéo et la restauration des réglages initiaux.
- L’invalidation d’une ancienne caméra pendant ou après une modification.

La réussite d’`applyConstraints()` ne suffit pas : le contrôleur vérifie les valeurs de `getSettings()`. Il attend au maximum 240 ms supplémentaires lorsqu’elles arrivent avec retard. Aucun identifiant de caméra n’est enregistré dans les préférences.

### Données et son

`tests/core.test.mjs` vérifie les champs nommés dans les textes et objets JSON, une paire structurée complète, le rejet des conflits, les liens HTTP(S) sûrs et le CSV. Les caractères, séparateurs, guillemets et sauts de ligne sont conservés ; les formules de tableur sont neutralisées dans l’export. Une suite numérique isolée n’est pas interprétée automatiquement comme un numéro de série.

`tests/sound.test.mjs` vérifie le curseur borné entre 0 et 100, le silence à zéro, le plafond du gain, l’absence de voix lorsque l’audio est bloqué et le remplacement d’un bip en cours pour éviter d’additionner plusieurs signaux. Le bouton de test peut préécouter le niveau même si les confirmations automatiques sont désactivées.

## Reproduire

Avec Node.js 20 ou supérieur :

```sh
npm ci
npm test
npm run build
python scripts/package.py
```

Le build produit `dist/ScanLibre.html`. Le moteur `zxing-wasm 3.1.6` et l’outil de compilation `esbuild 0.28.2` sont verrouillés dans `package-lock.json`. Python sert uniquement à créer les archives de distribution.

Pour le test photo, garder l’image hors du projet. Exemple PowerShell avec des valeurs fictives :

```powershell
$env:SCANLIBRE_TEST_IMAGE = 'C:\TestsLocaux\etiquette.png'
$env:SCANLIBRE_TEST_EXPECTED = 'AB01234567,ZZ123AA#ABF'
npm test
Remove-Item Env:\SCANLIBRE_TEST_IMAGE
Remove-Item Env:\SCANLIBRE_TEST_EXPECTED
```

Sans `SCANLIBRE_TEST_IMAGE`, le test est ignoré. Sans `SCANLIBRE_TEST_EXPECTED`, il vérifie seulement la présence d’un Data Matrix.

## Essais à réaliser sur les appareils cibles

| Essai | Résultat attendu |
| --- | --- |
| Ouvrir le fichier téléchargé avec Edge ou Chrome | État Prêt · hors ligne ; import fonctionnel sans connexion. |
| Ouvrir la version hébergée sur un téléphone ou une tablette | Connexion au site privé si demandée, quatre écrans accessibles ; vérifier les autorisations dans le navigateur réel. |
| Activer une webcam | Aperçu, définition et cadence réelles affichés ; aucune demande de microphone. |
| Ouvrir Réglages pendant la lecture | Le même aperçu vidéo reste actif et visible ; seules les capacités annoncées sont proposées, une valeur inconnue est désactivée. |
| Passer la mise au point en manuel, régler la distance, réactiver l’automatique | Netteté ajustable si le matériel le permet ; aucune distance manuelle imposée après réactivation de l’autofocus. |
| Changer zoom, exposition, contraste ou netteté | Valeur réelle confirmée, ou message de refus avec valeurs actuelles conservées. |
| Réinitialiser | Retour aux valeurs observées au début de la session caméra. |
| Changer résolution, cadence ou caméra | Ancien flux libéré, nouveau flux propre ; valeur réellement obtenue affichée. |
| Essayer Image entière puis Zone centrale | Le cadre correspond à la zone analysée ; les codes hors cadre ne sont pas lus dans ce mode. |
| Comparer Équilibré et Précision | Précision peut trouver davantage de codes difficiles, avec une analyse plus lente. |
| Conserver un code devant l’objectif puis le retirer et le représenter | Pas de bip continu pour le même code ; nouvelle lecture après sa représentation. |
| Régler le volume à 0, 30 et 100 %, puis Tester le son | Silence à zéro et niveau croissant ; préférence retrouvée après rechargement. |
| Arrêter, utiliser Échap ou passer sur un autre onglet | Webcam libérée ; reprise à la demande. Échap ferme d’abord une aide ou une confirmation ouverte. |
| Passer dans Historique ou dans Résultat sur mobile | Caméra libérée, y compris si une demande d’autorisation était encore en cours ; reprise explicite depuis Scanner. |
| Lire un code avec la caméra sur mobile | Notification ouvrant Résultat, sans changement d’écran automatique pendant la lecture. |
| Importer un lot sur mobile, puis consulter un autre écran | Les images continuent d’être traitées ; ouverture automatique de Résultat en fin de lot seulement si Scanner est toujours affiché. |
| Copier les résultats et exporter | Contenu exact ; champs identifiés lorsque disponibles ; cinq colonnes CSV. |
| Activer puis désactiver la conservation de l’historique | Résultats restaurés uniquement lorsque la conservation est activée et que le stockage est autorisé. |
| Thème, affichage 100 à 200 %, densité et animations | Commandes lisibles, sans contenu hors des panneaux ; le mode Suivre l’appareil respecte la préférence système de réduction des mouvements. |

## Limites

La netteté, l’éclairage, les reflets, la taille des modules et la distance minimale de mise au point restent déterminants. Le logiciel ne crée pas de détails absents de l’image et ne peut pas exposer un réglage que le navigateur ou la webcam ne fournit pas.

Les limites applicatives sont de 500 codes distincts dans l’historique, 50 images par lot, 30 Mo et 60 mégapixels par fichier avant réduction. Les scans restent du texte ; aucune page ne s’ouvre automatiquement. L’utilisation d’un autre logiciel passe par le presse-papiers, sans injection clavier globale.

Le fichier embarque son moteur et n’utilise aucune ressource distante. La politique `connect-src 'none'` interdit les connexions applicatives ; cela ne décrit pas le trafic propre du navigateur ou une page ouverte volontairement par l’utilisateur.

Références : [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [capacités caméra](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities), [application des contraintes](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints), [ZXing ReaderOptions](https://sec-ant.github.io/zxing-wasm/docs/interfaces/full.ReaderOptions.html).
