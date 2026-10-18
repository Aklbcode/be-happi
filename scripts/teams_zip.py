"""Fabrique le paquet Teams (be-happi-teams.zip) à partir du modèle.

Utilisation : python3 scripts/teams_zip.py https://exemple.github.io/be-happi/ [version]
Le fichier obtenu est celui que l'IT importe dans le centre d'administration Teams.
"""
import json
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlparse

RACINE = Path(__file__).resolve().parent.parent
ID_FIXE = uuid.uuid5(uuid.NAMESPACE_URL, 'be-happi.ipes-tubize')  # même identifiant à chaque version


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('Indique l’adresse de l’app, ex. https://exemple.github.io/be-happi/')
    url = sys.argv[1].rstrip('/') + '/'
    version = sys.argv[2] if len(sys.argv) > 2 else json.loads((RACINE / 'package.json').read_text())['version']
    modele = (RACINE / 'teams' / 'manifest.template.json').read_text(encoding='utf-8')
    manifeste = (
        modele.replace('{{URL}}', url)
        .replace('{{DOMAINE}}', urlparse(url).netloc)
        .replace('{{ID}}', str(ID_FIXE))
        .replace('{{VERSION}}', version)
    )
    json.loads(manifeste)  # vérifie que le JSON est valide
    sortie = RACINE / 'be-happi-teams.zip'
    with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', manifeste)
        z.write(RACINE / 'teams' / 'color.png', 'color.png')
        z.write(RACINE / 'teams' / 'outline.png', 'outline.png')
    print(f'Paquet Teams prêt : {sortie}')


if __name__ == '__main__':
    main()
