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
READER = ROOT / "dist" / "ScanLibre.html"
if not READER.is_file():
    raise SystemExit("Run npm ci, npm test and npm run build before packaging.")

GUIDE = f"""SCANLIBRE {VERSION} — GUIDE D'UTILISATION

1. Extraire entièrement ce ZIP dans un dossier de votre PC.
2. Clic droit sur ScanLibre.html > Ouvrir avec > Microsoft Edge ou Google Chrome.
3. Cliquer sur Activer la webcam et autoriser la caméra, ou Ouvrir une image.
4. Choisir Tous les formats, Data Matrix, QR code ou Codes-barres 1D selon le code.

Le moteur est inclus. Aucun compte, abonnement, installation de Python,
de Node.js ou serveur local n'est nécessaire pour utiliser ce fichier HTML.

Navigation sur PC : Scanner affiche l'aperçu et le résultat côte à côte, les
trois dernières lectures et les compteurs. Historique et Réglages ont leur écran.
Sur mobile : la barre du bas ouvre Scanner, Résultat, Historique ou Réglages.
Un code lu par caméra affiche une notification, sans quitter Scanner.
Après un import réussi, Résultat s'ouvre à la fin du lot sur mobile, uniquement
si Scanner est toujours affiché. Afficher dans l'historique ouvre aussi un résultat.

Lecture : les choix du format, du profil et de la zone sont dans Scanner.
Essayer Précision et la zone centrale pour une petite étiquette à la caméra.
Les images importées sont toujours analysées en entier.
Les profils Équilibré et Précision renforcent aussi le contraste local des
étiquettes pâles. Garder Lecture renforcée activée pour ces codes.

Copie : contenu complet, numéro de série ou référence produit.
Les champs nommés (S/N, P/N, serial, product...) et certaines paires structurées
sont reconnus sans supposer une marque. Sinon le contenu complet est conservé.

Caméra : ouvrir Réglages pour choisir la caméra, sa résolution et sa cadence.
L'aperçu reste actif dans cet écran. Après activation, les commandes proposées
par le matériel apparaissent : mise au point, zoom, exposition, etc.
Full HD est proposé au départ ; la définition réellement obtenue est affichée.
Réinitialiser restaure les valeurs de départ de la session caméra.

Son : dans Réglages, ajuster Volume du bip entre 0 et 100 %, puis Tester le son.
À 0 %, le bip est muet. Le niveau dépend aussi du volume du système et des enceintes.
Affichage : thèmes clair/sombre, taille 100 à 200 %, densité Confortable/Compacte.
Animations : Suivre l'appareil, Expressives ou Réduites. Les préférences sont
mémorisées dans ce navigateur ; la densité compacte concerne surtout le PC.

Ctrl+O : ouvrir une image. Ctrl+V : coller une capture. Échap : arrêter.
L'historique reste en mémoire pendant la session. Dans Réglages, Conserver
l'historique l'enregistre dans ce navigateur ; désactiver l'option supprime
la copie enregistrée mais conserve la liste de la session ouverte.
Vider demande confirmation dans l'écran Historique ; Annuler garde les données.
Exporter CSV contient tout l'historique, même filtré (maximum 500 codes distincts).

Le dossier examples contient deux images synthétiques pour essayer le lecteur.

Si la webcam est occupée, fermer Caméra Windows, Teams ou l'autre application.
Si le code reste flou, reculer légèrement ; éviter les reflets sur le métal.
La caméra s'arrête dans Historique, dans Résultat sur mobile et quand l'onglet
passe en arrière-plan. Revenir dans Scanner et la réactiver pour reprendre.
Elle reste active dans Réglages pour observer les ajustements.
Le lecteur copie dans le presse-papiers ; coller avec Ctrl+V dans le logiciel cible.

Cette version utilise le navigateur. Ce pack ne contient pas d'exécutable EXE.
L'image est analysée sur l'appareil ; aucun fichier n'est envoyé à un serveur.
Un lien détecté ne s'ouvre que sur une action explicite de votre part.

Test en ligne : https://scanlibre-test-m4d135.garden-lake-2660.chatgpt.site
Le site est privé : utiliser le compte ChatGPT associé au projet si demandé.
Une connexion est nécessaire pour charger cette page. Le fichier HTML du pack
fonctionne sans compte et hors ligne ; la mise en cache du site n'est pas garantie.

Source : https://github.com/M4D135/ScanLibre
Licence du projet : MIT. Licences du moteur : THIRD_PARTY_NOTICES.txt.
"""


def files_in(relative):
    return sorted(path for path in (ROOT / relative).rglob("*") if path.is_file())


prod = OUTPUT / f"ScanLibre-{VERSION}-PROD.zip"
with ZipFile(prod, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(READER, "ScanLibre/ScanLibre.html")
    archive.writestr("ScanLibre/LIRE-MOI.txt", GUIDE)
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.txt"):
        archive.write(ROOT / name, f"ScanLibre/{name}")
    for folder in ("examples", "licenses"):
        for path in files_in(folder):
            archive.write(path, f"ScanLibre/{path.relative_to(ROOT).as_posix()}")

dev = OUTPUT / f"ScanLibre-{VERSION}-DEV.zip"
with ZipFile(dev, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt", "package.json", "package-lock.json", ".gitignore"):
        archive.write(ROOT / name, f"ScanLibre-DEV/{name}")
    for folder in ("src", "scripts", "tests", "docs", "licenses", "examples"):
        for path in files_in(folder):
            archive.write(path, f"ScanLibre-DEV/{path.relative_to(ROOT).as_posix()}")
    archive.write(READER, "ScanLibre-DEV/dist/ScanLibre.html")

checksums = OUTPUT / "SHA256SUMS.txt"
checksums.write_text("".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
    for path in (prod, dev, READER)
), encoding="utf-8")
for path in (prod, dev, checksums):
    print(f"{path.name}: {path.stat().st_size} bytes")
