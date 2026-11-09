# Mise en ligne sur scan.estrasse.fr

## Fonctionnement

- **GitHub Actions** (`.github/workflows/deploy-site.yml`) : à chaque push sur `main`, `npm test` puis `npm run build`. `dist/ScanLibre.html` est publié en `index.html` sur la branche orpheline `site`.
- **VPS** : Caddy sert `/srv/scan/current` sur `scan.estrasse.fr`, avec un certificat Let's Encrypt obtenu et renouvelé automatiquement. Le timer systemd `scan-update.timer` récupère la branche `site` toutes les 5 minutes. Le lien `current` bascule d'un coup vers la nouvelle version, et les 3 dernières versions restent dans `/srv/scan/releases/`.

## Installation (une seule fois, sur le VPS)

Prérequis : l'enregistrement DNS `scan` en **A** vers l'IP du VPS, et Caddy installé comme service systemd `caddy` avec un Caddyfile.

```sh
curl -fsSL https://raw.githubusercontent.com/M4D135/ScanLibre/main/deploy/install-vps.sh | sudo bash
```

Le script peut être relancé sans risque. Il sauvegarde le Caddyfile avant d'y ajouter le bloc. Si Caddy refuse la nouvelle configuration, il restaure l'original : les sites existants ne sont pas touchés.

## Exploitation

| Besoin | Commande |
| --- | --- |
| Forcer la mise à jour | `sudo systemctl start scan-update` |
| Journal des mises à jour | `journalctl -u scan-update` |
| Version en ligne | `readlink /srv/scan/current` |
| Revenir à une version précédente | `sudo systemctl stop scan-update.timer && sudo ln -sfn releases/<sha> /srv/scan/current` |
| Reprendre les mises à jour | `sudo systemctl start scan-update.timer` |
| Désinstaller | `curl -fsSL https://raw.githubusercontent.com/M4D135/ScanLibre/main/deploy/install-vps.sh \| sudo bash -s -- uninstall` |

## Configuration manuelle (Caddy dans Docker, Caddyfile importé, etc.)

Copie `index.html` de la branche `site` dans un dossier lisible par Caddy, puis ajoute ce bloc et recharge Caddy :

```caddyfile
scan.estrasse.fr {
	root * /srv/scan/current
	encode zstd gzip
	header {
		Permissions-Policy "camera=(self), microphone=(), geolocation=()"
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		Cache-Control "no-cache"
		-Server
	}
	file_server
}
```

Ne réutilise pas un en-tête `Permissions-Policy: camera=()` commun aux autres sites : le navigateur bloquerait la webcam sans même demander l'autorisation.
