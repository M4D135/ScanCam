# Validation de ScanCam 1.4.0

État de qualification du **10 novembre 2026**. La version 1.4.0 ajoute le déclenchement manuel, la commande de lampe lorsque le navigateur la propose et une interface organisée en écrans fixes. Les qualifications antérieures ci-dessous restent attachées à leur version et à leur date.

## Qualification 1.4.0 — 10 novembre 2026

Les contrôles ont été réalisés dans **Chrome sous Linux**, avec le HTML compilé et le banc de développement `tests/browser-camera-harness.mjs`. Ce banc fournit une **vidéo synthétique dessinée dans un canvas**, des codes fictifs et des pistes dont les capacités et les réglages sont simulés. Les changements de valeur observés concernent ces pistes simulées ; ils ne constituent pas une qualification de webcam, de flash ou de téléphone physique.

### Lecture, déclenchement et caméra

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Visée manuelle au repos | **Aucune lecture avant déclenchement** | L’aperçu reste actif sans enregistrer les codes présents. Un appui sur Scanner déclenche une recherche et enregistre un seul code. |
| Relecture d’un article | **Compteur actualisé à chaque nouvel appui** | Plusieurs déclenchements devant le même QR augmentent son compteur sans imposer de retirer le code. |
| Choix dans le cadre central | **Code centré retenu** | Avec deux codes dans la scène, le QR le plus proche du centre est retenu. Un Data Matrix placé hors du cadre n’est pas lu ; la tentative se termine à l’expiration du délai. |
| Data Matrix pâle | **Lecture réussie dans le banc vidéo** | Le code fictif peu contrasté de la scène de démonstration est reconnu. Cet essai ne mesure pas les performances d’une caméra physique sur une étiquette réelle. |
| Touche maintenue | **Une seule lecture** | Entrée maintenue pendant 1,4 seconde ne provoque pas de déclenchements répétés. |
| Association et test | **Fonctionnels** | La touche Q est associée, testée puis utilisée pour déclencher une lecture. Une association annulée conserve le raccourci Entrée précédemment configuré. |
| Manuel et Auto | **Transition fonctionnelle** | Les changements entre lecture continue et visée manuelle ont été exercés dans le banc vidéo. |
| Lampe simulée | **État confirmé par la piste simulée** | Allumage et extinction sont vérifiés dans les valeurs retournées par la piste. La commande est désactivée lorsque la capacité est absente ; un refus n’affiche pas un faux état allumé. |
| Commande de lampe ignorée | **Absence de confirmation signalée** | Après l’attente du retour de la piste simulée, l’interface indique que la caméra n’a pas confirmé le réglage. La valeur retournée reste `false` et le bouton conserve `aria-pressed="false"`. |
| Arrêt et navigation | **Pistes libérées** | Une déconnexion simulée arrête la capture. L’ouverture d’Historique ou de Résultat en disposition mobile laisse zéro piste active dans le banc. |
| Commandes caméra | **Valeurs appliquées dans la simulation** | Sur PC, le zoom passe de 1 à 1,5. En disposition mobile, la luminosité passe de 0 à 0,5. La pagination présente deux commandes par page sur PC et une sur mobile. |
| Navigation de Réglages | **Route et écran cohérents** | Revenir à l’accueil de Réglages depuis une catégorie rétablit aussi la route `#settings`, notamment après `#settings/trigger`. |

### Écrans fixes et historique

Les dimensions ci-dessous sont celles de **cadres responsive de Chrome Linux**, en pixels CSS. Les essais de molette ne remplacent pas un contrôle tactile sur téléphone.

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Réglages à 320 × 640 px | **Les sept catégories tiennent dans leur écran** | Pour Lecture, Déclenchement, Caméra, Commandes, Son, Copie et historique, et Interface, la zone de page mesure `clientHeight = scrollHeight = 473 px`. La hauteur du document reste de 640 px. |
| Scanner à 320 × 640 px | **Pas de défilement du document observé** | Une commande de molette équivalant à deux pages laisse `scrollTop` à 0. Le bouton de déclenchement manuel mesure 70 px de haut. |
| Scanner à 390 × 844 px | **Tient dans la zone disponible** | L’aperçu et les commandes restent dans l’écran. |
| Paysage à 844 × 390 px | **Écrans contrôlés sans dépassement observé** | Lecture, Déclenchement, Historique et Commandes tiennent dans la vue. La navigation commence à y = 325 px. Une ligne d’historique mesure 104 px ; le bas de la commande matérielle contrôlée est à y = 306 px. |
| Résultat à 320 × 640 px | **Vue Champs accessible** | Les deux valeurs reconnues sont affichées dans la zone disponible. |
| Pagination de l’historique | **Une ligne par page à 320 × 640 px** | La ligne mesure 144 px. Des sélections effectuées sur les pages 1 et 2 restent actives en page 3. |
| Suppression sur plusieurs pages | **Sous-ensemble exact** | En page 3, la confirmation indique deux scans non affichés. Annuler les conserve. La suppression confirmée retire exactement le QR et le Data Matrix pâle sélectionnés ; l’autre Data Matrix reste présent. La pagination revient à 1 / 1. |

[Capture de référence de ScanCam 1.4.0](screenshots/scancam-1.4.0.png) : trois instances du HTML de production dans des cadres mobiles de 360 × 780 px, présentant Scanner avec la caméra inactive, Réglages et Historique avec deux données fictives. Cette capture ne montre pas une caméra physique en fonctionnement.

### Tests automatisés et compilation

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` | **81 réussis, 1 ignoré, aucun échec** | 82 tests au total. |
| Compilation | **Réussie** | HTML autonome `dist/ScanCam.html`, SHA-256 `889b1c72f89d455be82a9dba9f8c698a86864b004f6b60d0fe0aff0c28ebf208`. |

Pour régénérer le banc de simulation après la compilation :

```sh
node tests/browser-camera-harness.mjs
```

Ouvrir `dist/camera-check.html` dans l’aperçu local. Le générateur ajoute une page de développement distincte ; il ne modifie ni `dist/ScanCam.html` ni le pack PROD.

### Limites de cette qualification

Aucun essai sur webcam physique, lampe réelle, Safari ou téléphone physique n’a été réalisé pour cette qualification. La réception des boutons Volume d’un téléphone n’est pas validée par les essais de touches clavier dans Chrome Linux. Les autorisations, les marges de sécurité, le clavier virtuel, les gestes tactiles et les changements de hauteur du navigateur mobile restent à vérifier sur les appareils cibles.

**Aucun nouveau contrôle du contenu exact d’un CSV téléchargé n’est revendiqué pour 1.4.0.** La tentative de récupération du téléchargement depuis l’iframe de l’aperçu a expiré. La qualification du contenu CSV réalisée en 1.3.0 reste décrite dans sa section ; les tests unitaires du CSV, inchangés, font partie de la suite relancée. Cette limite de récupération du fichier ne permet pas, à elle seule, de conclure à un défaut de l’export.

## Qualification 1.3.0 — 10 novembre 2026

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suppression individuelle | **Contrôlée dans le HTML compilé** | Corbeille par ligne ; Annuler et Échap conservent les données. Suppression d’une entrée non courante, du résultat courant, puis de la dernière entrée. Compteurs, lectures récentes, résultat et boutons restent cohérents ; filtre conservé et focus restauré. |
| Sélection multiple | **Contrôlée avec trois codes fictifs** | Cases par ligne et sélection globale des seules lignes affichées. Une recherche conserve les sélections masquées et indique leur nombre. Sélectionner puis désélectionner les résultats laisse intacte une sélection hors du filtre. |
| Copie et export du lot | **Contenu exact** | Copie de deux codes comparée au texte attendu. CSV téléchargé et relu : uniquement les deux entrées cochées, horodatages ISO avec millisecondes conservés. Sans sélection, le bouton reprend l’export de tout l’historique. |
| Suppression du lot | **Sous-ensemble exact** | Annulation préserve la sélection. Confirmation avec deux entrées, dont une masquée par le filtre : seuls ces deux codes sont supprimés ; le troisième et le résultat courant sont conservés. Suppression du dernier code sur mobile : compteurs à zéro, résultat vide et export/purge désactivés. |
| Conservation | **Vérifiée après rechargement** | Avec la conservation activée, seules les entrées restantes sont retrouvées après une suppression individuelle ou groupée. Les clés de stockage existantes sont conservées. |
| Date et heure | **Contrôlées** | Date et heure locale distinctes, secondes et millisecondes ; fuseau Europe/Paris affiché dans l’essai. L’attribut `datetime` et le CSV conservent l’ISO UTC exact. Il s’agit de la dernière lecture du code regroupé. |
| Petit écran | **Cadre de 320 × 844 px** | Largeur du document égale à 320 px, sans débordement. Barre mobile à y = 844 px. Cibles des cases à cocher de 44 × 44 px, actions de ligne de 44 px de haut. Les cinq cellules se réorganisent en carte. Effacer une sélection entièrement masquée rend le focus à la recherche. |
| Structure et syntaxe | **Contrôlées** | Aucun ID dupliqué ni cible de label/ARIA absente ; vérification syntaxique JavaScript réussie. |
| Tests automatisés | **57 réussis, 1 ignoré, aucun échec** | 58 tests au total, dont huit nouveaux cas de sélection et partition des entrées ; photo locale facultative non fournie. Identité format/contenu, relecture, filtre, entrées supprimées et ordre/métadonnées sont vérifiés. |
| Compilation | **Réussie** | HTML autonome `dist/ScanCam.html`, SHA-256 `b8034050a1b08855e1eaff7df89d8bf282fcdfd822dd441f252c5a82e85ca7ca`. |

[Capture de l’historique 1.3.0 avec une sélection multiple](screenshots/scancam-1.3.0.png).

Les contrôles d’interface ont été réalisés dans Chrome Linux, avec des images synthétiques. Aucun nouvel essai de webcam physique, de Safari ou de téléphone physique n’est annoncé. L’historique regroupe les relectures d’un même contenu et format ; retirer une ligne retire aussi son compteur de relectures.

## Historique de qualification 1.2.5 — 10 novembre 2026

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Nom et version | **Un seul emplacement sur PC** | La marque et `VERSION 1.2.5` restent en haut de la colonne. Suppression du doublon en bas de colonne et des deux pieds de page. Le titre mobile remplace la marque de la colonne masquée. |
| Réglages sur PC | **Bords supérieurs et inférieurs identiques** | Géométries mesurées dans Chrome Linux : caméra et pile de droite alignées, commandes matérielles ouvertes ou repliées, densité confortable et compacte. L’aperçu absorbe la hauteur disponible. |
| Grille intermédiaire | **Panneaux Son / Copie alignés** | À 1024 px et taille d’affichage 125 %, les deux cartes côte à côte ont les mêmes coordonnées haut/bas ; aucun débordement horizontal. |
| Grand écran | **Bandeau et panneaux alignés** | Cadre de 1920 px : les bords gauche/droit du titre et des actions suivent ceux de la carte Lecture. Les colonnes de Réglages ont le même bas. |
| Scanner et Historique sur PC | **Contrôlés** | Aperçu et Résultat ont les mêmes coordonnées haut/bas. Historique n’affiche ni marque ni version dans son contenu. |
| Mobile | **Contrôlé dans des cadres responsive** | Cadres de 320 et 390 px : Scanner occupe la hauteur disponible, sans débordement horizontal ; la navigation est fixe au bord inférieur. À 320 px, les cartes de Réglages partagent les mêmes marges. |
| Structure HTML | **Aucune référence cassée** | Aucun identifiant en double, aucune cible manquante pour les labels et attributs ARIA ; une seule occurrence du numéro de version dans le HTML source. |
| Tests automatisés | **49 réussis, 1 ignoré, aucun échec** | Suite existante relancée ; test facultatif sur photo locale ignoré. |
| Compilation | **Réussie** | HTML autonome `dist/ScanCam.html`, SHA-256 `f758a825e3788ae61a1c7c0072d0d6fb2305052adeb9be7924d720700663ce52`. |

[Capture de Réglages 1.2.5](screenshots/scancam-1.2.5.png), après défilement pour montrer les deux colonnes complètes et leur bord inférieur commun.

La correction concerne la présentation. Aucun nouvel essai sur webcam physique, Safari ou téléphone physique n’est annoncé. Les tests responsive ont été réalisés dans Chrome Linux sur le HTML compilé.

## Historique de qualification ScanCam 1.2.4 — 10 novembre 2026

| Périmètre | État | Portée |
| --- | --- | --- |
| Documentation et distribution | **Textes et chemins actualisés** | Nom ScanCam, fichier `dist/ScanCam.html`, archives `ScanCam-1.2.4-PROD.zip` / `ScanCam-1.2.4-DEV.zip` et dépôt `M4D135/ScanCam`. L’URL du site de test privé reste inchangée. |
| Continuité du stockage | **Compatibilité documentée** | Les clés `scanlibre.history.v1` et `scanlibre.preferences.v1` sont conservées pour retrouver les données à la même adresse, dans le même profil de navigateur. Le renommage n’impose pas une remise à zéro des données. |
| Compatibilité d’hébergement | **Points de raccordement identifiés** | Le workflow copie `dist/ScanCam.html` vers `index.html`. Le domaine, la branche `site`, `/srv/scan`, les unités `scan-update` et le marqueur du bloc Caddy existant gardent leur identité. |
| Compilation | **Réussie** | `npm run build` produit le HTML autonome `dist/ScanCam.html`, avec moteur et notices embarqués. |
| Tests automatisés | **49 réussis, 1 ignoré, aucun échec** | Suite existante relancée en 1.2.4 ; le test facultatif sur photo locale reste ignoré. |
| Titres et navigation | **Contrôlés dans Chrome Linux** | Scanner, Historique et Réglages affichent le nom ScanCam et la version 1.2.4 ; les titres de navigateur suivent les écrans. |
| Exemples fictifs | **Régénérés et vérifiés** | Le générateur vérifie le décodage exact avant d’écrire chaque fichier. Le QR de démonstration contient désormais « ScanCam — exemple de lecture ». |
| Script VPS | **Syntaxe et compatibilité relues** | `bash -n` réussit ; ancien marqueur Caddy conservé, dépôt cible renommé. Aucun script n’a été exécuté sur le VPS pendant cette qualification. |

[Capture de ScanCam 1.2.4](screenshots/scancam-1.2.4.png).

Le renommage ne modifie ni les traitements de détection ni le signal audio. Aucun nouvel essai matériel, Safari ou téléphone physique n’est annoncé pour cette version.

## Historique de qualification ScanLibre 1.2.3 — 9 novembre 2026

La version 1.2.3 épurait Scanner et regroupait ses paramètres dans Réglages → Lecture, sans modifier le moteur de lecture.

Les contrôles portent sur le **HTML compilé**, ouvert dans Chrome sous Linux dans des cadres responsive.

| Périmètre | Résultat | Portée |
| --- | --- | --- |
| Suite `npm test` relancée en 1.2.3 | **49 tests réussis, 1 ignoré, aucun échec** | 50 tests au total ; le test facultatif sur photo locale reste ignoré. |
| Scanner simplifié | **Contrôlé** | Aucun sélecteur sur Scanner ; aperçu, Caméra / Image et navigation mobile fixe. Les statuts de repos répétés et le bouton d’arrêt désactivé sont retirés de cet écran. Les erreurs et états de traitement restent disponibles. |
| Petit écran et portrait | **Sans débordement observé** | À 320 × 640 px : document de même taille, bas des actions à 559 px, navigation de 575 à 640 px. À 390 × 844 px : document de même taille, aperçu de 603 px, bas des actions à 763 px et barre au bas de la vue. |
| Paysage | **Sans débordement observé** | À 844 × 390 px : document de même taille, aperçu de 149 px, navigation de 325 à 390 px. |
| Présentation PC | **Contrôlée à 1 024 × 844 px** | Aperçu et résultat alignés ; les trois sélecteurs de Lecture occupent trois colonnes alignées dans Réglages. |
| Réglages → Lecture | **Fonctionnel et mémorisé** | Format Data Matrix, profil Précision, zone centrale et lecture renforcée désactivée retrouvés après rechargement. Remis à Tous les formats / Équilibré / Image entière / lecture renforcée active en fin d’essai. Champs empilés à 320 px. |
| Import d’un Data Matrix pâle fictif | **Lecture exacte** | `examples/data-matrix-pale.png` → `DEMO-PALE-0042`, avec ouverture de Résultat après import mobile. Le bouton Annuler apparaît pendant le traitement. |
| Annulation d’un lot | **Contrôlée** | Lot de 50 copies de la fixture fictive interrompu avec Annuler. Retour à Caméra / Image, focus sur Caméra, Scanner conservé et résultats déjà lus disponibles. Un lot complet de 50 copies a aussi été lu. |
| Informations déplacées | **Toujours alimentées** | Dernière analyse est affichée dans Réglages → Caméra après import : 960 × 720 px, durée observée de 103 ms. Cette durée ponctuelle n’est pas une mesure de débit. |
| Caméra indisponible | **Retour intégré** | En absence de matériel, message d’indisponibilité ; retour au bouton Caméra actif, sans bouton Arrêter désactivé sur Scanner. |
| Thèmes clair et sombre | **Contrôlés** | Changement de thème, puis retour au thème clair pour la capture de référence. |
| Raccords d’interface | **Revue statique effectuée** | IDs uniques, listeners et préférences conservés, commandes déléguées depuis Réglages et transfert de focus lors du changement de bouton. Les coins décoratifs sont masqués quand un statut actif occupe l’aperçu. |

[Capture du Scanner 1.2.3](screenshots/scanner-1.2.3.png).

**Limites :** aucun essai avec une webcam physique, Safari ou un téléphone physique pour ce correctif. L’état Arrêter pendant une capture réelle, les marges de sécurité matérielles et les changements de hauteur propres à Safari restent à vérifier sur appareil. Les tests d’import et la revue du code ne constituent pas une qualification matérielle.

## Historique de qualification ScanLibre 1.2.2 — 9 novembre 2026

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

## Historique de qualification ScanLibre 1.2.1 — 9 novembre 2026

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

## Historique ScanLibre 1.2.0 — 7 novembre 2026

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

Les exemples versionnés sont fictifs. Aucun nouvel appel réseau ni dépendance externe n’avait été ajouté pour la refonte 1.2.0. Le gain de décodage observé sur des fixtures ne constitue pas une promesse de lecture de tous les codes ni une mesure de cadence sur webcam. Les limites matérielles ci-dessus restent applicables à 1.2.1, 1.2.2 et 1.2.3 ; le contrôle de la photo signalée est décrit séparément dans la qualification 1.2.1.

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

Le build courant produit `dist/ScanCam.html`. Le moteur `zxing-wasm 3.1.6`, les modules de vérification `@zxing/library 0.23.0` et l’outil de compilation `esbuild 0.28.2` sont verrouillés dans `package-lock.json`. Python sert uniquement à créer les archives de distribution.

Pour le test photo, garder l’image hors du projet. Les noms de variables `SCANLIBRE_TEST_IMAGE` et `SCANLIBRE_TEST_EXPECTED` restent utilisables par compatibilité. Exemple PowerShell avec des valeurs fictives :

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
| Ouvrir le fichier téléchargé avec Edge ou Chrome | Nom ScanCam, commandes Caméra / Image disponibles après chargement et import fonctionnel sans connexion. |
| Ouvrir [scan.estrasse.fr](https://scan.estrasse.fr) sur un téléphone ou une tablette | Quatre écrans accessibles ; vérifier les autorisations dans le navigateur réel. Le site de test privé reste disponible en alternative avec connexion si demandée. |
| Faire défiler Scanner et Réglages sur mobile | Barre ancrée au bord inférieur de la zone web ; dernières commandes accessibles. Les menus Format, Profil et Zone sont regroupés dans Réglages → Lecture. |
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
