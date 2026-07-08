// ═══════════════════════════════════════════════════════════════
// CATALOGUES PRODUITS — Frenchy Leurres & Ravager
// Source de vérité pour le générateur d'articles
// ═══════════════════════════════════════════════════════════════

const CATALOG_FL = {
  marque: 'Frenchy Leurres',
  site:   'https://frenchyleurres.fr',
  cibles: ['bar', 'loup', 'dorade', 'sparidés', 'maquereau'],
  peche:  ['pêche en bateau', 'pêche côtière', 'pêche en bord de mer', 'pêche en port'],

  produits: [
    {
      nom:     'G de Gautier',
      type:    'Leurre prêt à pêcher',
      taille:  '9 cm',
      cibles:  ['bar', 'loup', 'dorade'],
      contexte: 'Leurre polyvalent idéal pour la pêche côtière et en bateau. Conçu pour nager de façon naturelle à faible vitesse de récupération.',
      variantes: [
        { couleur: 'Blanc Perle', grammage: '3 g', usage: 'Eau peu profonde (0-2m), eaux troubles ou agitées, pêche de nuit, lampadaires de port. Le blanc perle réfléchit la moindre lumière.' },
        { couleur: 'Blanc Perle', grammage: '6 g', usage: 'Eau de profondeur moyenne (2-4m), conditions mixtes, polyvalent jour et nuit.' },
        { couleur: 'Blanc Perle', grammage: '9 g', usage: 'Eau profonde (4m+), courant, vent, pêche depuis un bateau en dérive.' },
        { couleur: 'Kaki',        grammage: '3 g', usage: 'Eaux claires et peu profondes, pêche de jour, fonds herbiers, imite parfaitement un petit poisson naturel.' },
        { couleur: 'Kaki',        grammage: '6 g', usage: 'Conditions intermédiaires, eaux claires à mi-profondes, jour et début de soirée.' },
        { couleur: 'Kaki',        grammage: '9 g', usage: 'Eaux claires profondes, pêche au large ou par vent, bonne visibilité dans l\'eau.' },
      ]
    },
    {
      nom:     'Frenchy Shiner',
      type:    'Leurre souple',
      cibles:  ['bar', 'loup', 'maquereau', 'dorade'],
      contexte: 'Leurre souple à monter sur tête plombée. Queue en fourche très travaillante. Nombreux coloris pour adapter à toutes les conditions.',
      variantes: [
        { couleur: 'Sardine',             taille: '9 cm',    usage: 'Imite la sardine, redoutable en Méditerranée.' },
        { couleur: 'Kaki / Irisé Rose',   taille: '9 cm',    usage: 'Eaux troubles, lumière faible, pêche coucher de soleil.' },
        { couleur: 'Vert Electric',        taille: '9 cm',    usage: 'Eaux claires, plein soleil, pêche de jour.' },
        { couleur: 'Chartreux',            taille: '9 cm',    usage: 'Conditions lumineuses, eaux vertes ou troubles.' },
        { couleur: 'Blanc Perle',          taille: '9 cm',    usage: 'Pêche de nuit, eaux sombres, bonne visibilité à faible lumière.' },
        { couleur: 'Bleu Flash',           taille: '9 cm',    usage: 'Eaux bleues profondes, larges, pêche au large.' },
        { couleur: 'Bleu Violet / Irisé Rose', taille: '9 cm', usage: 'Conditions mixtes, eaux semi-claires.' },
        { couleur: 'Sardine',             taille: '10.5 cm',  usage: 'Profils plus gros, bar de taille, dorade royale.' },
        { couleur: 'Violet / Irisé Rose',  taille: '10.5 cm', usage: 'Grand format eaux troubles ou profondes.' },
        { couleur: 'Blanc',               taille: '10.5 cm',  usage: 'Grand format pêche de nuit.' },
        { couleur: 'Blanc Paillette',      taille: '10.5 cm', usage: 'Effet flash pour attirer de loin, nuit ou faible lumière.' },
      ]
    },
    {
      nom:     'Mistik Shad',
      type:    'Leurre prêt à pêcher',
      cibles:  ['bar', 'loup', 'mulet', 'dorade'],
      contexte: 'Petit shad compact 6 cm, format finesse pour les bars méfiants ou la pêche en eau claire peu profonde.',
      variantes: [
        { couleur: 'Kaki / Irisé Rose', grammage: '3 g', usage: 'Eaux peu profondes claires, présentation fine et naturelle.' },
        { couleur: 'Kaki Paillette',    grammage: '3 g', usage: 'Eaux claires avec effet scintillant pour déclencher les touches.' },
        { couleur: 'Vert Electric',     grammage: '3 g', usage: 'Pêche de jour, eaux vertes méditerranéennes.' },
      ]
    },
    {
      nom:     'Astro Shad',
      type:    'Leurre souple',
      cibles:  ['bar', 'loup', 'dorade'],
      contexte: 'Shad à queue frétillante, vibrations basses fréquences perceptibles par le bar même à faible vitesse. Idéal pour pêche lente et eaux fraîches.',
      variantes: []  // Couleurs et grammages à compléter depuis la boutique
    },
    {
      nom:     'Frenchy TP',
      type:    'Tête plombée (accessoire)',
      contexte: 'Têtes plombées Frenchy Leurres, conçues pour s\'associer parfaitement aux leurres souples de la gamme.',
      variantes: [
        { taille: 'Taille 1', grammage: '3 g',  usage: 'Eau très peu profonde, 0-1,5m.' },
        { taille: 'Taille 1', grammage: '6 g',  usage: 'Eau peu profonde à intermédiaire, 1-3m.' },
        { taille: 'Taille 1', grammage: '9 g',  usage: 'Eau profonde ou courant marqué.' },
        { taille: 'Taille 2', grammage: '6 g',  usage: 'Hameçon plus grand, poissons de taille.' },
      ]
    }
  ],

  techniques: [
    'nage linéaire lente',
    'stop and go',
    'grattage de fond',
    'nage en dérive sous courant',
    'pêche sous lumières de nuit',
    'pêche en herbier posidonie',
    'pêche en bord de digue',
    'pêche en embouchure de rivière',
    'pêche en surf casting',
    'pêche en port de nuit',
    'drop shot en mer',
    'pêche slow fishing'
  ]
};

const CATALOG_RAVAGER = {
  marque: 'RAVAGER',
  fondateur: 'Johan Gautier',
  site:   'https://ravager.fr',
  cibles: ['thon rouge', 'thon de Méditerranée'],
  peche:  ['pêche du thon sur chasse', 'pêche en Méditerranée', 'big game côtier'],
  histoire: 'Leurres artisanaux fabriqués par Johan Gautier dans le Sud de la France. Chaque leurre est conçu spécifiquement pour la chasse au thon rouge en Méditerranée.',

  produits: [
    {
      nom:      'Ravager Shad',
      type:     'Shad grande taille pour thon rouge',
      disponible: true,
      contexte: 'Leurre souple haute résistance conçu pour résister aux attaques du thon rouge. Corps profilé hydrodynamique, nage réaliste en récupération rapide et sur chasse.',
      variantes: [
        { taille_nom: 'T1', longueur: '79 mm',  poids: '35 g', usage: 'Thon rouge de taille modeste (15-30 kg), chasses peu intenses, conditions calmes. Idéal pour débuter sur le thon.' },
        { taille_nom: 'T2', longueur: '?? mm',  poids: '40 g', usage: 'Polyvalent, adapté à la majorité des situations de chasse en Méditerranée.' },
        { taille_nom: 'T3', longueur: '105 mm', poids: '54 g', usage: 'Thon rouge moyen à gros (30-80 kg), chasses actives, récupération rapide. Taille référence pour les experts.' },
        { taille_nom: 'T4', longueur: '125 mm', poids: '70 g', usage: 'Gros thon rouge (80 kg+), chasses explosives, conditions de mer agitées. Réservé aux pêcheurs expérimentés.' },
      ]
    },
    {
      nom:      'Ravager FS',
      type:     'Shad full silicone (à venir)',
      disponible: false,
      contexte: 'Prochain leurre Ravager en silicone full-body. Beaucoup plus résistant que le PVC, absorbe mieux les chocs des attaques de thon rouge. Corps ultra-souple pour une nage encore plus naturelle.',
      variantes: [
        { longueur: '130 mm', poids: '65 g', couleurs: ['Rose', 'Bleu Violet', 'Bleu', 'Kaki'], usage: 'Format maximal, thon rouge de grande taille, chasses lointaines. Couleurs vives pour visibilité maximale.' },
        { longueur: '100 mm', poids: '40 g', couleurs: ['Rose', 'Bleu Violet', 'Bleu', 'Kaki'], usage: 'Format intermédiaire, polyvalent, idéal pour chasses rapprochées ou thons méfiants.' },
      ]
    },
    {
      nom:      'Têtes tombées Ravager',
      type:     'Tête plombée pour thon (accessoire)',
      disponible: true,
      contexte: 'Têtes plombées spécialement conçues pour s\'associer aux corps Ravager. Résistance aux dents du thon rouge, hameçon renforcé.'
    },
    {
      nom:      'Corps Ravager',
      type:     'Corps de leurre souple vendu séparément',
      disponible: true,
      contexte: 'Corps de remplacement Ravager. Permet de changer rapidement le corps après une attaque de thon sans racheter la tête plombée.'
    },
    {
      nom:      'Colle Ravager',
      type:     'Colle spéciale leurres souples',
      disponible: true,
      contexte: 'Colle spéciale pour fixer et réparer les corps de leurres souples. Indispensable pour prolonger la durée de vie de chaque leurre après les attaques du thon.'
    }
  ],

  techniques: [
    'pêche sur chasse (thon en surface)',
    'casting longue distance sur banc de thons',
    'récupération ultra-rapide sur chasse active',
    'récupération moyenne avec pauses sur chasse profonde',
    'popping devant une chasse',
    'pêche en traîne légère au leurre souple',
    'approche discrète des bancs',
    'lecture des oiseaux pour trouver les chasses',
    'choix de la taille selon la taille du thon visible'
  ],

  conditions: [
    'thon en surface (chasse visible)',
    'thon à mi-eau (pas de chasse visible)',
    'mer calme',
    'mer formée',
    'pleine lumière de midi',
    'aube et crépuscule',
    'Méditerranée estivale (juillet-août)',
    'Méditerranée de fin de saison (septembre-octobre)'
  ]
};

module.exports = { CATALOG_FL, CATALOG_RAVAGER };
