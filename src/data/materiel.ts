// Matériel à réserver, comme l'écran Matériel de Power Apps (même noms, mêmes quantités).

export interface Rack {
  nom: string;
  stock: number;
  info: string;
}

export const RACKS: Rack[] = [
  { nom: 'Rack tablettes A', stock: 1, info: '25 tablettes' },
  { nom: 'Rack tablettes B', stock: 1, info: '25 tablettes' },
  { nom: 'Rack PC portables', stock: 1, info: 'Ordinateurs portables' },
  { nom: 'Vidéoprojecteur mobile', stock: 3, info: '3 appareils' },
  { nom: 'Rallonge électrique', stock: 3, info: 'Rallonges' },
  { nom: 'Câble HDMI', stock: 3, info: 'Câbles HDMI' },
];
