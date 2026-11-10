#!/usr/bin/env python3
"""Package the already-built reader and its reproducible sources."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
OUTPUT = ROOT / "artifacts"
OUTPUT.mkdir(exist_ok=True)
READER = ROOT / "dist" / "ScanCam.html"
if not READER.is_file():
    raise SystemExit("Run npm ci, npm test and npm run build before packaging.")

GUIDE = f"""SCANCAM {VERSION} — GUIDE D'UTILISATION

1. Extraire entièrement ce ZIP dans un dossier de votre PC.
2. Clic droit sur ScanCam.html > Ouvrir avec > Microsoft Edge ou Google Chrome.
3. Cliquer sur Activer la webcam et autoriser la caméra.
   Sur mobile, ce bouton s'appelle Caméra.
4. Au premier usage, le mode Manuel est sélectionné : viser le code entier
   dans le cadre central, attendre une image nette, puis appuyer sur Scanner.
   Un nouvel appui lance la lecture suivante.
5. Pour lire en continu, choisir explicitement Auto. Pour un fichier, utiliser
   Ouvrir une image (Image sur mobile) : toute l'image est analysée et tous
   les codes reconnus sont conservés, quel que soit le mode de la caméra.
6. Si nécessaire, ouvrir Réglages > Lecture pour choisir le format :
   Tous les formats, Data Matrix, QR code ou Codes-barres 1D.

Le moteur est inclus. Aucun compte, abonnement, installation de Python,
de Node.js ou serveur local n'est nécessaire pour utiliser ce fichier HTML.

NAVIGATION

L'application reste fixe dans la fenêtre, sans défilement global des pages,
sur PC comme sur mobile. Sur PC, Scanner affiche l'aperçu et le résultat
côte à côte. Le nom et la version figurent uniquement dans la colonne latérale.
Sur mobile, la barre ancrée au bas de l'écran ouvre Scanner, Résultat,
Historique ou Réglages. La visée ne défile pas sous les gestes du doigt.
Réglages se parcourt par catégories : Lecture, Déclenchement, Caméra,
Commandes, Son, Copie et historique, Interface. Ouvrir une catégorie puis
revenir au menu pour en choisir une autre.
Historique et les commandes caméra utilisent des pages adaptées à la place
disponible. Résultat propose Contenu et Champs lorsqu'ils sont reconnus.
Un texte long peut défiler à l'intérieur du champ sans déplacer l'écran.

Dans Scanner, le bouton caméra devient Arrêter pendant la capture, ou Annuler
pendant l'ouverture de la caméra et l'import d'images. Un code lu par caméra
affiche une notification ouvrant le résultat, sans quitter Scanner.
Après un import réussi, Résultat s'ouvre à la fin du lot sur mobile, uniquement
si Scanner est toujours affiché. Afficher dans l'historique ouvre aussi un résultat.

VISER ET DÉCLENCHER

En Manuel, la caméra sert d'abord à viser : aucun décodage n'a lieu avant
l'appui sur Scanner ou sur le raccourci choisi. Garder le code entier et ses
marges dans le cadre central. Une tentative enregistre un seul code, le plus
proche du centre parmi ceux reconnus, puis s'arrête immédiatement.
Dans Réglages > Déclenchement, choisir la durée maximale d'une tentative :
1,5 seconde, 3 secondes par défaut ou 5 secondes. Sans résultat, ajuster
la visée puis réessayer. Les appuis pendant la recherche ne s'empilent pas.
Un nouvel appui peut relire le même article sans le retirer : son compteur
augmente d'une lecture.

Auto lance la lecture continue. Le choix Manuel / Auto est mémorisé.
Un code restant devant la caméra en Auto ne compte pas à chaque image ;
le retirer quelques secondes puis le représenter pour le relire.
La zone de recherche choisie dans Réglages > Lecture s'applique en Auto.
Le mode Manuel utilise toujours le cadre central.

BOUTON OU TOUCHE

Dans Réglages > Déclenchement, choisir Bouton à l'écran uniquement,
Barre d'espace, Entrée ou Touche associée. Associer un bouton attend une
vraie touche reçue du clavier ou d'une télécommande. Tester le bouton vérifie
sa réception sans enregistrer de scan. Les raccourcis déclenchent en mode
Manuel dans Scanner, caméra active, hors des champs et autres commandes.
Un appui maintenu ne produit pas plusieurs lectures.
Les boutons Volume du téléphone restent souvent réservés au système.
Leur fonctionnement dans une page web n'est pas garanti : effectuer le test
sur l'appareil concerné. Utiliser Scanner ou une télécommande transmettant
une touche reconnue si le navigateur ne reçoit aucun événement.

LAMPE ET CAMÉRA

Le bouton Lampe dans Scanner est disponible seulement si la caméra et
le navigateur exposent une commande utilisable. Son état suit les valeurs
confirmées ; une commande refusée ou ignorée est signalée. Attendre la fin
d'une recherche manuelle ou d'un réglage en cours pour le basculer.
Arrêter ou remplacer la caméra libère sa piste vidéo et son éclairage.
Un flash physique ne garantit pas que le navigateur puisse le commander.

Réglages > Caméra permet de choisir la source vidéo, la résolution et la
cadence. Full HD est proposé au départ. Les informations de capture indiquent
les valeurs réellement obtenues. Dernière analyse indique la définition
analysée et sa durée, y compris après un import d'image.
Réglages > Commandes présente les réglages disponibles sur le matériel actif :
mise au point, zoom, exposition, etc. Les flèches changent de page si nécessaire.
Les réglages refusés ou ignorés sont signalés. Réinitialiser restaure
les valeurs de départ de cette session caméra.

LECTURE, SON ET AFFICHAGE

Dans Réglages > Lecture, choisir le format, le profil de lecture,
la zone de recherche du mode Auto et l'option Lecture renforcée.
Essayer Précision pour une petite étiquette. Les profils Équilibré et Précision
renforcent aussi le contraste local des étiquettes pâles ; conserver Lecture
renforcée activée pour ces codes. Une image floue ou masquée par un reflet
peut nécessiter une nouvelle prise de vue. Les fichiers importés sont toujours
analysés en entier.

Dans Réglages > Son, ajuster Volume du bip entre 0 et 100 %, puis Tester le son.
À 0 %, le bip est muet. Le niveau dépend aussi du volume du système et des enceintes.
Le bouton de thème permet de choisir clair ou sombre. Dans Réglages > Interface,
choisir la taille 100 à 200 %, la densité Confortable/Compacte et les animations :
Suivre l'appareil, Expressives ou Réduites. Les préférences sont mémorisées
dans ce navigateur ; la densité compacte concerne surtout le PC.

COPIE ET HISTORIQUE

Dans Réglages > Copie et historique, Contenu à copier permet de choisir
le contenu complet, le numéro de série ou la référence produit.
Les champs nommés (S/N, P/N, serial, product...) et certaines paires structurées
sont reconnus sans supposer une marque. Sinon le contenu complet est conservé.
Le lecteur copie dans le presse-papiers ; coller avec Ctrl+V dans le logiciel cible.

L'historique reste en mémoire pendant la session. Conserver l'historique,
dans la même catégorie, l'enregistre dans ce navigateur ; désactiver l'option
supprime la copie enregistrée mais conserve la liste de la session ouverte.
Les réglages et l'historique enregistré restent accessibles à la même adresse,
dans le même profil de navigateur, y compris après le renommage en ScanCam.
Chaque ligne regroupe un même format et contenu, avec son compteur de relectures
(maximum 500 codes distincts). Date et heure indique la dernière lecture : date
locale, secondes et millisecondes, fuseau du navigateur dans l'en-tête du tableau.

Les flèches de l'historique changent de page. Cocher plusieurs lignes pour
les Copier, les Exporter ou les Supprimer ensemble. Tout sélectionner agit
sur tout l'historique. Avec une recherche, Sélectionner les résultats agit
sur TOUS les résultats du filtre, sur toutes les pages.
La sélection reste active en changeant de page ou de filtre. Le nombre de scans
cochés sur d'autres pages ou masqués par le filtre est indiqué par « non affichés ».
La croix Tout désélectionner retire toute la sélection.
Copier réunit les contenus cochés, séparés par un retour à la ligne, selon
Contenu à copier. Supprimer demande confirmation du nombre de scans, en indiquant
ceux qui ne sont pas affichés sur la page courante.
La corbeille de chaque ligne retire un seul code après confirmation intégrée.
Annuler ou Échap conserve les entrées. Une suppression retire aussi les relectures
regroupées et actualise les compteurs, les lectures récentes et la copie enregistrée.
Vider demande confirmation dans l'écran Historique ; Annuler garde les données.
Avec des lignes cochées, Exporter la sélection contient seulement ces lignes,
y compris celles sur d'autres pages ou masquées par le filtre. Sans sélection,
Exporter CSV contient tout l'historique, quelle que soit la page ou la recherche.
Les dates du CSV restent au format ISO en UTC avec millisecondes.

RACCOURCIS ET REPRISE

Ctrl+O : ouvrir une image. Ctrl+V : coller une capture.
Échap pendant une recherche manuelle annule la tentative et conserve l'aperçu ;
hors recherche, il arrête la caméra. Arrêter libère toujours la webcam.
La caméra s'arrête dans Historique, dans Résultat sur mobile et quand l'onglet
passe en arrière-plan. Revenir dans Scanner et la réactiver pour reprendre.
Elle reste active dans Réglages pour observer les ajustements, mais quitter
Scanner annule une tentative manuelle en cours.
Si la webcam est occupée, fermer Caméra Windows, Teams ou l'autre application.
Si le code reste flou, reculer légèrement ; éviter les reflets sur le métal.
Le dossier examples contient trois images synthétiques pour essayer le lecteur.

Cette version utilise le navigateur. Ce pack ne contient pas d'exécutable EXE.
L'image est analysée sur l'appareil ; aucun fichier n'est envoyé à un serveur.
Un lien détecté ne s'ouvre que sur une action explicite de votre part.

Site : https://scan.estrasse.fr/
Alternative privée : https://scanlibre-test-m4d135.garden-lake-2660.chatgpt.site
Pour cette alternative, utiliser le compte ChatGPT associé au projet si demandé.
Une connexion est nécessaire pour charger cette page. Le fichier HTML du pack
fonctionne sans compte et hors ligne ; la mise en cache du site n'est pas garantie.

Source : https://github.com/M4D135/ScanCam
Licence du projet : MIT. Licences du moteur : THIRD_PARTY_NOTICES.txt.
"""


def files_in(relative):
    return sorted(path for path in (ROOT / relative).rglob("*") if path.is_file())


prod = OUTPUT / f"ScanCam-{VERSION}-PROD.zip"
with ZipFile(prod, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(READER, "ScanCam/ScanCam.html")
    archive.writestr("ScanCam/LIRE-MOI.txt", GUIDE)
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.txt"):
        archive.write(ROOT / name, f"ScanCam/{name}")
    for folder in ("examples", "licenses"):
        for path in files_in(folder):
            archive.write(path, f"ScanCam/{path.relative_to(ROOT).as_posix()}")

dev = OUTPUT / f"ScanCam-{VERSION}-DEV.zip"
with ZipFile(dev, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt", "package.json", "package-lock.json", ".gitignore"):
        archive.write(ROOT / name, f"ScanCam-DEV/{name}")
    for folder in ("src", "scripts", "tests", "docs", "licenses", "examples", "deploy", ".github"):
        for path in files_in(folder):
            archive.write(path, f"ScanCam-DEV/{path.relative_to(ROOT).as_posix()}")
    archive.write(READER, "ScanCam-DEV/dist/ScanCam.html")

checksums = OUTPUT / "SHA256SUMS.txt"
checksums.write_text("".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
    for path in (prod, dev, READER)
), encoding="utf-8")
for path in (prod, dev, checksums):
    print(f"{path.name}: {path.stat().st_size} bytes")
