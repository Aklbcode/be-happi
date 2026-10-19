"""Fabrique le paquet Teams (be-happi-teams.zip) à partir du modèle public/teams/.

Le plus simple : le bouton « Paquet Teams » de l'app (École → Connexion → Mise en service), qui
fabrique le même fichier dans le navigateur. Ce script fait la même chose en ligne de commande :

  python3 scripts/teams_zip.py https://aklbcode.github.io/be-happi/                 # sans école (démo)
  python3 scripts/teams_zip.py https://aklbcode.github.io/be-happi/ \\
      --tenant <ID de l'annuaire> --client <ID d'application> --site https://ecole.sharepoint.com/sites/BeHappi

Les réglages de l'école vont dans l'adresse de l'onglet (?ecole=…), jamais dans le dépôt :
le fichier obtenu reste local (ignoré par git) et se charge dans le centre d'administration Teams.
"""
import argparse
import base64
import json
import re
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlparse

RACINE = Path(__file__).resolve().parent.parent
MODELE = RACINE / 'public' / 'teams'
ID_FIXE = uuid.uuid5(uuid.NAMESPACE_URL, 'be-happi.ipes-tubize')  # même identifiant à chaque version
GUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


def guid_court(guid: str) -> str:
    """Même codage que l'app (src/lib/reglages.ts) : base64url des 16 octets, sans « = »."""
    return base64.urlsafe_b64encode(uuid.UUID(guid).bytes).decode().rstrip('=')


def parametre_ecole(tenant: str, client: str, site: str) -> str:
    for nom, valeur in (('tenant', tenant), ('client', client)):
        if not GUID.match(valeur.strip()):
            sys.exit(f'--{nom} : identifiant attendu (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), reçu « {valeur} »')
    morceaux = [m for m in re.sub(r'^https?://', '', site.strip(), flags=re.I).split('?')[0].split('/') if m]
    hote = morceaux[0].lower() if morceaux else ''
    if len(morceaux) < 3 or not re.fullmatch(r'[a-z0-9-]+\.sharepoint\.com', hote) or morceaux[1].lower() not in ('sites', 'teams') \
            or not re.fullmatch(r'[A-Za-z0-9_.-]+', morceaux[2]):
        sys.exit(f'--site : adresse attendue https://….sharepoint.com/sites/…, reçu « {site} »')
    prefixe = hote[: -len('.sharepoint.com')]
    return f'{guid_court(tenant.strip())}.{guid_court(client.strip())}.{prefixe}/{morceaux[1].lower()}/{morceaux[2]}'


def avec_ecole(adresse: str, parametre: str) -> str:
    avant, diese, apres = adresse.partition('#')
    return f"{avant}{'&' if '?' in avant else '?'}ecole={parametre}{diese}{apres}"


def main() -> None:
    p = argparse.ArgumentParser(description='Fabrique be-happi-teams.zip')
    p.add_argument('url', help="adresse de l'app, ex. https://aklbcode.github.io/be-happi/")
    p.add_argument('version', nargs='?', help='version (par défaut : celle de package.json)')
    p.add_argument('--tenant', help="ID de l'annuaire (locataire) Microsoft de l'école")
    p.add_argument('--client', help="ID d'application (client) enregistrée par l'IT")
    p.add_argument('--site', help='adresse du site SharePoint des listes')
    a = p.parse_args()

    url = re.sub(r'[?#].*$', '', a.url).rstrip('/') + '/'
    version = a.version or json.loads((RACINE / 'package.json').read_text())['version']
    reglages = [a.tenant, a.client, a.site]
    if any(reglages) and not all(reglages):
        sys.exit('Donne les trois réglages ensemble : --tenant, --client et --site.')
    parametre = parametre_ecole(a.tenant, a.client, a.site) if all(reglages) else None

    modele = (MODELE / 'manifest.template.json').read_text(encoding='utf-8')
    manifeste = json.loads(
        modele.replace('{{URL}}', url)
        .replace('{{DOMAINE}}', urlparse(url).netloc)
        .replace('{{ID}}', str(ID_FIXE))
        .replace('{{VERSION}}', version)
    )
    if parametre:
        for onglet in manifeste.get('staticTabs', []):
            onglet['contentUrl'] = avec_ecole(onglet['contentUrl'], parametre)
            if onglet.get('websiteUrl'):
                onglet['websiteUrl'] = avec_ecole(onglet['websiteUrl'], parametre)

    sortie = RACINE / 'be-happi-teams.zip'
    with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps(manifeste, ensure_ascii=False, indent=2) + '\n')
        z.write(MODELE / 'color.png', 'color.png')
        z.write(MODELE / 'outline.png', 'outline.png')
    print(f'Paquet Teams prêt : {sortie}')
    if parametre:
        print(f"Lien d'installation (téléphones, navigateurs) : {avec_ecole(url, parametre)}")
    else:
        print("Sans réglages d'école : l'onglet s'ouvrira en démo.")


if __name__ == '__main__':
    main()
