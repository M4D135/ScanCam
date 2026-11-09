# Validation de ScanLibre 1.2.2

État de qualification du **9 novembre 2026**. La version 1.2.2 corrige l’ancrage de la navigation mobile et supprime le raccourci Réglages caméra redondant sur ce format. Elle ne modifie pas le moteur de lecture. Les qualifications du moteur 1.2.1 et de l’interface 1.2.0 sont conservées plus bas avec leur version et leur date ; leurs résultats ne constituent pas de nouveaux essais de 1.2.2.

## Qualification 1.2.2 — 9 novembre 2026

Les contrôles portent sur le **HTML compilé**, ouvert dans Chrome sous Linux dans des cadres responsive. Le défilement reste celui du document, avec la restauration de position propre à chaque écran.

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` relancée en 1.2.2 | **49 tests réussis, 1 ignoré, aucun échec** | 50 tests au total. Le test facultatif sur photo locale reste ignoré ; la suite existante passe après ce correctif de présentation. |
| Barre mobile ancrée | **Contrôlée** | Barre fixée au bord inférieur, sans retrait horizontal ni inférieur et sans rayon extérieur. Hauteur de commandes de 65 px ; la zone de sécurité fournie par le navigateur s’ajoute à son padding intérieur. |
| Scanner en petit écran | **Sans débordement observé** | Cadres de 390 × 844 et 320 × 640 px. La barre rejoint exactement le bas de la zone disponible ; le raccourci Réglages caméra à côté de Zone est masqué et le choix de zone occupe l’espace libéré. |
| Navigation entre écrans | **Fonctionnelle** | Scanner, Résultat, Historique et Réglages sont accessibles depuis les quatre onglets de la barre. |
| Fin de Réglages après défilement | **Accessible** | À 320 × 640 px, défilement maximal de 1 664 px pour une hauteur de document de 2 304 px. Le bas du pied de page est à 575 px, au niveau du haut de la barre ; le bas de la barre reste à 640 px. Aucun contenu final n’est masqué. |
| Présentation paysage | **Sans débordement observé** | Cadre de 844 × 390 px : barre de x = 0 à x = 837, correspondant aux 837 px disponibles après la barre de défilement de 7 px. Le bord inférieur reste à 390 px. |
| Agrandissement de l’interface à 200 % | **Sans débordement horizontal observé** | Réglages dans un cadre de 390 × 844 px : largeur de document de 383 px, soit la largeur disponible après la barre de défilement de 7 px. La navigation garde une hauteur de 65 px et son bord inférieur à 844 px. Échelle remise à 100 % en fin de contrôle. |
| Thèmes clair et sombre | **Changement fonctionnel** | Bascule entre les deux thèmes contrôlée dans l’interface. |
| Marges de sécurité et notifications | **Revue CSS effectuée** | La hauteur réservée au défilement et la position des toasts utilisent la même variable que la barre. Les marges de sécurité gauche, droite et basse sont prises en compte dans son padding. Leur valeur matérielle n’a pas été exercée dans ces cadres. |

[Capture de la navigation mobile 1.2.2](screenshots/mobile-nav-1.2.2.png).

Le site principal est [scan.estrasse.fr](https://scan.estrasse.fr). Le [site de test privé](https://scanlibre-test-m4d135.garden-lake-2660.chatgpt.site) reste une alternative avec connexion au compte ChatGPT associé au projet. Les mesures ci-dessus concernent le build local, pas une mesure de disponibilité de ces hébergements.

**Limites :** aucun essai sur Safari ou sur un iPhone/Android physique pour ce correctif. La zone de sécurité matérielle, la barre d’accueil, les changements de hauteur liés aux commandes de Safari et le clavier virtuel restent à vérifier sur l’appareil. Le seuil mobile reste de 900 px ; au-delà, y compris sur un téléphone en paysage large, la disposition PC s’applique.

## Historique de qualification 1.2.1 — 9 novembre 2026

La version 1.2.1 corrigeait la lecture de Data Matrix pâles et un cas précis de terminaison non conforme. Les résultats ci-dessous ont été obtenus lors de sa qualification, avant la modification de navigation 1.2.2.

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` | **49 tests réussis, 1 ignoré, aucun échec** | Les tests synthétiques et les suites précédentes passent. Le test facultatif sur photo via variable d’environnement est ignoré ; le cas réel est exercé séparément dans le pipeline complet. |
| Petits Data Matrix pâles | **Récupération démontrée** | Scène synthétique de 960 × 720 px : gradient clair, grain déterministe, grand bord sombre et petit symbole à faible contraste. Lecture exacte normale, inclinée à 15°, inversée et inversée/inclinée ; la lecture simple échoue sur chaque variante. |
| Géométrie et données d’entrée | **Vérifiées** | Contours replacés dans les coordonnées de l’image entière après sélection de la zone centrale, centre conservé après rotation, pixels fournis inchangés. |
| Rejets du contraste local | **Vérifiés** | Fond avec grain et gradient sans symbole : aucun résultat. Les modes QR et codes-barres 1D ne retournent pas le Data Matrix. |
| Compatibilité de terminaison | **6 tests réussis** | Terminateur ASCII redondant avant PAD accepté après vérification ECC indépendante ; remplissage incorrect, ECC irrécupérable, contenu contradictoire, autres erreurs et symboles invalides refusés. Les codes conformes restent dans le décodeur standard. |
| Photo réelle signalée | **Lecture complète réussie en ligne de commande** | Photo entière de 1 080 × 1 440 px, sans recadrage ni transformation manuelle. Les modes Tous les formats et Data Matrix réussissent en Équilibré et Précision. Le contenu complet concorde avec la lecture indépendante de libdmtx ; la version précédente échouait sur cette image. |
| Import de cette photo dans le HTML compilé | **Réussi sur PC et dans la vue mobile** | Chrome Linux : photo entière importée en Tous les formats / Équilibré sur PC (444 ms observés), puis Data Matrix / Équilibré dans un cadre de 390 × 844 px. Contenu exact, ouverture de Résultat après import mobile. Copie puis collage dans la recherche : texte intégral conservé. |
| Budget Précision pour les codes 1D inclinés | **Préservé sur les cas testés** | Les fixtures Code 128, Code 39 et EAN-13 inclinées à 45° réussissent en Tous les formats / Précision avec le budget caméra par défaut de 700 ms : 138, 99 et 54 ms en ligne de commande. |
| Réseau | **Aucun chargement pendant les lectures** | Le moteur principal et les modules JavaScript de vérification sont embarqués. Les essais automatisés interdisent `fetch` pendant l’initialisation et le décodage. |

Le cas réel cumulait un faible contraste local et une terminaison Data Matrix rejetée par le moteur principal. La compatibilité est limitée à un octet ASCII d’unlatch `254` placé immédiatement avant PAD `129`, avec remplissage final valide. Les modules du symbole sont relus par une autre implémentation du parseur ECC200 et de Reed–Solomon. Après la seule normalisation de ce terminateur, le texte doit concorder intégralement avec le texte et les octets fournis par le premier moteur. Une erreur de checksum ou un autre défaut de format ne suffit jamais à produire un résultat accepté.

L’image réelle, son contenu décodé et ses identifiants ne sont pas ajoutés au dépôt, aux exemples ou aux packs. Les régressions reproductibles utilisent uniquement des données fictives. Les essais sur photo ne constituent pas une mesure de débit d’une webcam ni une qualification matérielle sur téléphone.

[Capture du contrôle navigateur avec un code fictif](screenshots/pale-example-1.2.1.png). L’exemple `examples/data-matrix-pale.png` est fourni pour reproduire une lecture à faible contraste, sans utiliser la photo réelle.

## Historique 1.2.0 — 7 novembre 2026

La version 1.2.0 réorganisait l’interface sans changer le moteur de lecture. Les résultats suivants décrivent les essais réalisés le **7 novembre 2026**, avant le correctif 1.2.1.

Les contrôles d’interface ont porté sur le **fichier HTML compilé**, ouvert dans Chrome sous Linux via `localhost`. Les petits formats ont été exercés dans des cadres de navigateur aux dimensions indiquées : ils vérifient la présentation responsive, pas le comportement d’un téléphone physique ou de Safari.

### Résultats automatisés de 1.2.0

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` | **40 tests réussis, 1 ignoré, aucun échec** | Le test facultatif sur photo locale n’a pas été exécuté pour cette qualification 1.2.0. |
| Faible contraste | **Gain démontré** | Code 128, EAN-13, Data Matrix et QR synthétiques échouent avec la lecture simple et réussissent avec le rattrapage de contraste. |
| Codes-barres fins en diagonale | **Gain démontré** | Code 128, Code 39 et EAN-13 inclinés à 45° échouent avec la lecture simple et réussissent en Précision. |
| Réglages caméra | **12 tests sur tracks simulés** | Capacités, pas et bornes, refus, demande ignorée, retour retardé, réinitialisation, arrêt et remplacement. |
| Bip | **2 tests audio simulés** | Niveau borné, zéro silencieux, absence de voix lorsque l’audio est bloqué et remplacement d’un bip précédent. |
| Réseau du moteur | **Aucune requête** | Les tests interdisent `fetch` durant l’initialisation et les lectures. |

### Contrôles de l’interface 1.2.0

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

### Limites de qualification de 1.2.0

| Périmètre | État | Portée |
| --- | --- | --- |
| Webcam physique et commandes matérielles | **Non testées** | Aucune webcam physique disponible dans l’environnement. Les simulations ne valident pas un pilote ou un modèle réel. |
| Téléphone/tablette physique et Safari | **Non testés** | Les dimensions mobiles ont été exercées dans Chrome sous Linux ; pas de qualification tactile, de permissions ou de caméra sur iOS/Android. |
| Photo réelle dans l’interface 1.2.0 | **Non retestée** | Les imports de cette qualification utilisent des images synthétiques. Le test photo facultatif de la suite a été ignoré. |
| Niveau sonore audible sur le poste | **Non mesuré** | Le signal Web Audio est couvert par simulation ; le niveau réel dépend du système et des haut-parleurs. |
| Windows et ouverture directe `file://` | **Non testés** | QA sur navigateur Linux via `localhost`. La navigation directe vers un fichier est bloquée dans cet environnement de test. |
| Lecteur d’écran | **Non testé** | Les vérifications statiques et de focus ne remplacent pas une qualification avec une technologie d’assistance. |

Les exemples versionnés sont fictifs. Aucun nouvel appel réseau ni dépendance externe n’avait été ajouté pour la refonte 1.2.0. Le gain de décodage observé sur des fixtures ne constitue pas une promesse de lecture de tous les codes ni une mesure de cadence sur webcam. Les limites matérielles ci-dessus restent applicables à 1.2.1 et 1.2.2 ; le contrôle de la photo signalée est décrit séparément dans la qualification 1.2.1.

## Couverture automatisée de 1.2.1

### Moteur et récupération

`tests/decoder.test.mjs` vérifie l’initialisation partagée du moteur embarqué, les Data Matrix tournés et inversés, le filtrage des formats, les codes 1D, les caractères Unicode et de contrôle, les images vides, le test photo facultatif et l’absence de réseau.

`tests/detection.test.mjs` compare la lecture simple et les profils supplémentaires sur des images synthétiques construites indépendamment du code de récupération. Il contrôle le faible contraste global, les Data Matrix pâles sur une scène à contraste global élevé, les deux polarités, les codes fins en diagonale, les coordonnées après rotation et recadrage, l’exclusion des codes extérieurs à la zone centrale, le filtrage des formats, l’annulation entre les passes, les limites d’image et la conservation des pixels d’entrée. Les trois profils s’arrêtent dès qu’une passe trouve des résultats.

`tests/datamatrix-compat.test.mjs` construit des symboles fictifs avec leurs blocs ECC et vérifie le cas précis de terminaison redondante. Les tests opposent ce cas aux remplissages invalides, aux erreurs de format différentes, aux ECC irrécupérables et aux candidats dont le texte ou les octets ne correspondent pas au symbole vérifié.

Pour les modes de codes 2D et Tous les formats, Équilibré effectue au maximum quatre passes : original, contraste local sombre, contraste global, puis contraste local clair. Précision ajoute, selon le format, une recherche en diagonale et un seuil alternatif ou agrandissement, pour un maximum de six passes. Rapide reste à une seule passe ; désactiver la lecture renforcée conserve également la lecture simple. Le budget peut arrêter la recherche avant d’atteindre ces plafonds.

La lecture 1D conserve son traitement de contraste global et une confirmation sur au moins deux lignes. Les images de travail du contraste local, de rotation et d’agrandissement sont limitées à 4 mégapixels ; les entrées du pipeline à 20 mégapixels. L’application réduit au préalable ses imports à 4 096 pixels sur le plus grand côté et ses captures selon le profil. Les coordonnées des images de travail réduites sont remappées vers l’image originale.

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

Avec Node.js 24 ou supérieur :

```sh
npm ci
npm test
npm run build
python scripts/package.py
```

Le build produit `dist/ScanLibre.html`. Le moteur `zxing-wasm 3.1.6`, les modules de vérification `@zxing/library 0.23.0` et l’outil de compilation `esbuild 0.28.2` sont verrouillés dans `package-lock.json`. Python sert uniquement à créer les archives de distribution.

Pour le test photo, garder l’image hors du projet. Exemple PowerShell avec des valeurs fictives :

```powershell
$env:SCANLIBRE_TEST_IMAGE = 'C:\TestsLocaux\etiquette.png'
$env:SCANLIBRE_TEST_EXPECTED = 'AB01234567,ZZ123AA#ABF'
npm test
Remove-Item Env:\SCANLIBRE_TEST_IMAGE
Remove-Item Env:\SCANLIBRE_TEST_EXPECTED
```

Sans `SCANLIBRE_TEST_IMAGE`, le test est ignoré. Sans `SCANLIBRE_TEST_EXPECTED`, il vérifie seulement la présence d’un Data Matrix. Ce test utilise le décodeur simple sur le fichier ; il ne remplace pas un essai du pipeline RGBA complet ou de l’import HTML pour les images nécessitant le contraste local.

## Essais à réaliser sur les appareils cibles

| Essai | Résultat attendu |
| --- | --- |
| Ouvrir le fichier téléchargé avec Edge ou Chrome | État Prêt · hors ligne ; import fonctionnel sans connexion. |
| Ouvrir [scan.estrasse.fr](https://scan.estrasse.fr) sur un téléphone ou une tablette | Quatre écrans accessibles ; vérifier les autorisations dans le navigateur réel. Le site de test privé reste disponible en alternative avec connexion si demandée. |
| Faire défiler Scanner et Réglages sur mobile | Barre ancrée au bord inférieur de la zone web, sans capsule flottante ; dernières commandes accessibles et aucun raccourci Réglages caméra redondant à côté de Zone. |
| Tourner l’appareil, ouvrir le clavier et afficher/masquer les commandes de Safari | Navigation accessible dans la zone visible, marges de sécurité adaptées à l’appareil et champs utilisables ; confirmer ce comportement sur le navigateur réel. |
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
