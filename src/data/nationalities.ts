/**
 * Pays du monde (code ISO 3166-1 alpha-3, nom français, démonyme) et pools de
 * prénoms / noms pour les principaux pays de football. Sert à la création du
 * personnage (liste complète), à la génération des PNJ (`engine/world/names.ts`)
 * et à la sélection nationale.
 *
 * Les codes des nations britanniques (ENG, SCO, WAL, NIR) et du Kosovo (XKX)
 * ne sont pas ISO mais sont ceux du football. `COUNTRY_ALIASES` traduit les
 * codes FIFA courants (POR, ALG, DEN, SUI…) vers le code canonique.
 */
import type { CountryCode } from '../engine/types';

export interface Nationality {
  code: CountryCode;
  /** Nom du pays en français. */
  name: string;
  /** Démonyme masculin singulier : « français », « brésilien ». */
  demonym: string;
}

const N = (code: string, name: string, demonym: string): Nationality => ({ code, name, demonym });

/** Liste complète, triée par continent puis par nom français. */
export const NATIONALITIES: readonly Nationality[] = [
  // ── Europe ──
  N('ALB', 'Albanie', 'albanais'), N('DEU', 'Allemagne', 'allemand'), N('AND', 'Andorre', 'andorran'),
  N('ENG', 'Angleterre', 'anglais'), N('ARM', 'Arménie', 'arménien'), N('AUT', 'Autriche', 'autrichien'),
  N('AZE', 'Azerbaïdjan', 'azerbaïdjanais'), N('BEL', 'Belgique', 'belge'), N('BLR', 'Biélorussie', 'biélorusse'),
  N('BIH', 'Bosnie-Herzégovine', 'bosnien'), N('BGR', 'Bulgarie', 'bulgare'), N('CYP', 'Chypre', 'chypriote'),
  N('HRV', 'Croatie', 'croate'), N('DNK', 'Danemark', 'danois'), N('SCO', 'Écosse', 'écossais'),
  N('ESP', 'Espagne', 'espagnol'), N('EST', 'Estonie', 'estonien'), N('FIN', 'Finlande', 'finlandais'),
  N('FRA', 'France', 'français'), N('GEO', 'Géorgie', 'géorgien'), N('GIB', 'Gibraltar', 'gibraltarien'),
  N('GRC', 'Grèce', 'grec'), N('HUN', 'Hongrie', 'hongrois'), N('FRO', 'Îles Féroé', 'féroïen'),
  N('IRL', 'Irlande', 'irlandais'), N('NIR', 'Irlande du Nord', 'nord-irlandais'), N('ISL', 'Islande', 'islandais'),
  N('ISR', 'Israël', 'israélien'), N('ITA', 'Italie', 'italien'), N('KAZ', 'Kazakhstan', 'kazakh'),
  N('XKX', 'Kosovo', 'kosovar'), N('LVA', 'Lettonie', 'letton'), N('LIE', 'Liechtenstein', 'liechtensteinois'),
  N('LTU', 'Lituanie', 'lituanien'), N('LUX', 'Luxembourg', 'luxembourgeois'), N('MKD', 'Macédoine du Nord', 'macédonien'),
  N('MLT', 'Malte', 'maltais'), N('MDA', 'Moldavie', 'moldave'), N('MCO', 'Monaco', 'monégasque'),
  N('MNE', 'Monténégro', 'monténégrin'), N('NOR', 'Norvège', 'norvégien'), N('NLD', 'Pays-Bas', 'néerlandais'),
  N('WAL', 'Pays de Galles', 'gallois'), N('POL', 'Pologne', 'polonais'), N('PRT', 'Portugal', 'portugais'),
  N('ROU', 'Roumanie', 'roumain'), N('GBR', 'Royaume-Uni', 'britannique'), N('RUS', 'Russie', 'russe'),
  N('SMR', 'Saint-Marin', 'saint-marinais'), N('SRB', 'Serbie', 'serbe'), N('SVK', 'Slovaquie', 'slovaque'),
  N('SVN', 'Slovénie', 'slovène'), N('SWE', 'Suède', 'suédois'), N('CHE', 'Suisse', 'suisse'),
  N('CZE', 'Tchéquie', 'tchèque'), N('TUR', 'Turquie', 'turc'), N('UKR', 'Ukraine', 'ukrainien'),
  // ── Afrique ──
  N('ZAF', 'Afrique du Sud', 'sud-africain'), N('DZA', 'Algérie', 'algérien'), N('AGO', 'Angola', 'angolais'),
  N('BEN', 'Bénin', 'béninois'), N('BWA', 'Botswana', 'botswanais'), N('BFA', 'Burkina Faso', 'burkinabé'),
  N('BDI', 'Burundi', 'burundais'), N('CMR', 'Cameroun', 'camerounais'), N('CPV', 'Cap-Vert', 'cap-verdien'),
  N('CAF', 'Centrafrique', 'centrafricain'), N('COM', 'Comores', 'comorien'), N('COG', 'Congo', 'congolais'),
  N('COD', 'RD Congo', 'congolais'), N('CIV', "Côte d'Ivoire", 'ivoirien'), N('DJI', 'Djibouti', 'djiboutien'),
  N('EGY', 'Égypte', 'égyptien'), N('ERI', 'Érythrée', 'érythréen'), N('SWZ', 'Eswatini', 'eswatinien'),
  N('ETH', 'Éthiopie', 'éthiopien'), N('GAB', 'Gabon', 'gabonais'), N('GMB', 'Gambie', 'gambien'),
  N('GHA', 'Ghana', 'ghanéen'), N('GIN', 'Guinée', 'guinéen'), N('GNB', 'Guinée-Bissau', 'bissau-guinéen'),
  N('GNQ', 'Guinée équatoriale', 'équato-guinéen'), N('KEN', 'Kenya', 'kényan'), N('LSO', 'Lesotho', 'lesothan'),
  N('LBR', 'Liberia', 'libérien'), N('LBY', 'Libye', 'libyen'), N('MDG', 'Madagascar', 'malgache'),
  N('MWI', 'Malawi', 'malawite'), N('MLI', 'Mali', 'malien'), N('MAR', 'Maroc', 'marocain'),
  N('MUS', 'Maurice', 'mauricien'), N('MRT', 'Mauritanie', 'mauritanien'), N('MOZ', 'Mozambique', 'mozambicain'),
  N('NAM', 'Namibie', 'namibien'), N('NER', 'Niger', 'nigérien'), N('NGA', 'Nigeria', 'nigérian'),
  N('UGA', 'Ouganda', 'ougandais'), N('REU', 'La Réunion', 'réunionnais'), N('RWA', 'Rwanda', 'rwandais'),
  N('STP', 'Sao Tomé-et-Principe', 'santoméen'), N('SEN', 'Sénégal', 'sénégalais'), N('SYC', 'Seychelles', 'seychellois'),
  N('SLE', 'Sierra Leone', 'sierra-léonais'), N('SOM', 'Somalie', 'somalien'), N('SDN', 'Soudan', 'soudanais'),
  N('SSD', 'Soudan du Sud', 'sud-soudanais'), N('TZA', 'Tanzanie', 'tanzanien'), N('TCD', 'Tchad', 'tchadien'),
  N('TGO', 'Togo', 'togolais'), N('TUN', 'Tunisie', 'tunisien'), N('ZMB', 'Zambie', 'zambien'),
  N('ZWE', 'Zimbabwe', 'zimbabwéen'),
  // ── Amériques ──
  N('ARG', 'Argentine', 'argentin'), N('BHS', 'Bahamas', 'bahaméen'), N('BRB', 'Barbade', 'barbadien'),
  N('BLZ', 'Belize', 'bélizien'), N('BOL', 'Bolivie', 'bolivien'), N('BRA', 'Brésil', 'brésilien'),
  N('CAN', 'Canada', 'canadien'), N('CHL', 'Chili', 'chilien'), N('COL', 'Colombie', 'colombien'),
  N('CRI', 'Costa Rica', 'costaricien'), N('CUB', 'Cuba', 'cubain'), N('CUW', 'Curaçao', 'curacien'),
  N('ECU', 'Équateur', 'équatorien'), N('USA', 'États-Unis', 'américain'), N('GRD', 'Grenade', 'grenadien'),
  N('GLP', 'Guadeloupe', 'guadeloupéen'), N('GTM', 'Guatemala', 'guatémaltèque'), N('GUY', 'Guyana', 'guyanien'),
  N('GUF', 'Guyane', 'guyanais'), N('HTI', 'Haïti', 'haïtien'), N('HND', 'Honduras', 'hondurien'),
  N('JAM', 'Jamaïque', 'jamaïcain'), N('MTQ', 'Martinique', 'martiniquais'), N('MEX', 'Mexique', 'mexicain'),
  N('NIC', 'Nicaragua', 'nicaraguayen'), N('PAN', 'Panama', 'panaméen'), N('PRY', 'Paraguay', 'paraguayen'),
  N('PER', 'Pérou', 'péruvien'), N('PRI', 'Porto Rico', 'portoricain'), N('DOM', 'République dominicaine', 'dominicain'),
  N('SLV', 'Salvador', 'salvadorien'), N('SUR', 'Suriname', 'surinamais'), N('TTO', 'Trinité-et-Tobago', 'trinidadien'),
  N('URY', 'Uruguay', 'uruguayen'), N('VEN', 'Venezuela', 'vénézuélien'),
  // ── Asie ──
  N('AFG', 'Afghanistan', 'afghan'), N('SAU', 'Arabie saoudite', 'saoudien'), N('BHR', 'Bahreïn', 'bahreïni'),
  N('BGD', 'Bangladesh', 'bangladais'), N('BTN', 'Bhoutan', 'bhoutanais'), N('MMR', 'Birmanie', 'birman'),
  N('BRN', 'Brunei', 'brunéien'), N('KHM', 'Cambodge', 'cambodgien'), N('CHN', 'Chine', 'chinois'),
  N('PRK', 'Corée du Nord', 'nord-coréen'), N('KOR', 'Corée du Sud', 'sud-coréen'), N('ARE', 'Émirats arabes unis', 'émirati'),
  N('HKG', 'Hong Kong', 'hongkongais'), N('IND', 'Inde', 'indien'), N('IDN', 'Indonésie', 'indonésien'),
  N('IRQ', 'Irak', 'irakien'), N('IRN', 'Iran', 'iranien'), N('JPN', 'Japon', 'japonais'),
  N('JOR', 'Jordanie', 'jordanien'), N('KGZ', 'Kirghizistan', 'kirghiz'), N('KWT', 'Koweït', 'koweïtien'),
  N('LAO', 'Laos', 'laotien'), N('LBN', 'Liban', 'libanais'), N('MYS', 'Malaisie', 'malaisien'),
  N('MDV', 'Maldives', 'maldivien'), N('MNG', 'Mongolie', 'mongol'), N('NPL', 'Népal', 'népalais'),
  N('OMN', 'Oman', 'omanais'), N('UZB', 'Ouzbékistan', 'ouzbek'), N('PAK', 'Pakistan', 'pakistanais'),
  N('PSE', 'Palestine', 'palestinien'), N('PHL', 'Philippines', 'philippin'), N('QAT', 'Qatar', 'qatarien'),
  N('SGP', 'Singapour', 'singapourien'), N('LKA', 'Sri Lanka', 'sri-lankais'), N('SYR', 'Syrie', 'syrien'),
  N('TJK', 'Tadjikistan', 'tadjik'), N('TWN', 'Taïwan', 'taïwanais'), N('THA', 'Thaïlande', 'thaïlandais'),
  N('TLS', 'Timor oriental', 'est-timorais'), N('TKM', 'Turkménistan', 'turkmène'), N('VNM', 'Viêt Nam', 'vietnamien'),
  N('YEM', 'Yémen', 'yéménite'),
  // ── Océanie ──
  N('AUS', 'Australie', 'australien'), N('FJI', 'Fidji', 'fidjien'), N('NCL', 'Nouvelle-Calédonie', 'calédonien'),
  N('NZL', 'Nouvelle-Zélande', 'néo-zélandais'), N('PNG', 'Papouasie-Nouvelle-Guinée', 'papouan'),
  N('PYF', 'Polynésie française', 'polynésien'), N('WSM', 'Samoa', 'samoan'), N('SLB', 'Îles Salomon', 'salomonais'),
  N('TON', 'Tonga', 'tongien'), N('VUT', 'Vanuatu', 'vanuatuan'),
];

const BY_CODE: Record<string, Nationality> = {};
for (const n of NATIONALITIES) BY_CODE[n.code] = n;

/** Codes FIFA (ou autres variantes courantes) → code canonique. */
export const COUNTRY_ALIASES: Readonly<Record<string, CountryCode>> = {
  ALG: 'DZA', ANG: 'AGO', BAN: 'BGD', BOT: 'BWA', BUL: 'BGR', CGO: 'COG', CHA: 'TCD', CHI: 'CHL', CRC: 'CRI',
  CRO: 'HRV', CTA: 'CAF', DEN: 'DNK', EQG: 'GNQ', GAM: 'GMB', GBS: 'GNB', GER: 'DEU', GRE: 'GRC', GUI: 'GIN',
  HAI: 'HTI', INA: 'IDN', IRI: 'IRN', KOS: 'XKX', KSA: 'SAU', KUW: 'KWT', LAT: 'LVA', LIB: 'LBN', MAD: 'MDG',
  MAS: 'MYS', MRI: 'MUS', MTN: 'MRT', MYA: 'MMR', NCA: 'NIC', NED: 'NLD', NEP: 'NPL', NIG: 'NER', OMA: 'OMN',
  PAR: 'PRY', PHI: 'PHL', POR: 'PRT', PUR: 'PRI', RSA: 'ZAF', SIN: 'SGP', SLO: 'SVN', SUI: 'CHE', TAN: 'TZA',
  TOG: 'TGO', TPE: 'TWN', TRI: 'TTO', UAE: 'ARE', URU: 'URY', VIE: 'VNM', ZAM: 'ZMB', ZIM: 'ZWE',
};

/** Code canonique pour un code ISO ou FIFA (inchangé si inconnu). */
export function normalizeCountryCode(code: string): CountryCode {
  const upper = code.toUpperCase();
  return COUNTRY_ALIASES[upper] ?? upper;
}

/** Fiche d'un pays, ou undefined si le code est inconnu (après normalisation). */
export function nationality(code: string): Nationality | undefined {
  return BY_CODE[normalizeCountryCode(code)];
}

/** Nom français d'un pays, ou le code lui-même si inconnu. */
export function countryName(code: string): string {
  return nationality(code)?.name ?? code;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pools de prénoms et de noms
// ═══════════════════════════════════════════════════════════════════════════

export interface NamePool {
  first: readonly string[];
  last: readonly string[];
}

/** Construit un pool à partir de listes « a, b, c ». */
function p(first: string, last: string): NamePool {
  const split = (s: string): string[] => s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  return { first: split(first), last: split(last) };
}

/** Pool de repli quand la nationalité n'a pas de pool dédié. */
export const INTERNATIONAL_POOL: NamePool = p(
  'Alex, Daniel, David, Samuel, Adam, Michael, Andrei, Sergei, Dmitri, Ivan, Marko, Emil, Omar, Ali, Ahmed, Kwame, Yusuf, Mohamed, Leon, Noah, Elias, Rafael, Diego, Pablo, Lucas, Marc, Nikola, Jan, Ari, Timur',
  'Novak, Petrov, Ivanov, Popov, Kovač, Horvat, Silva, Santos, Costa, Rossi, Meyer, Schmidt, Larsen, Berg, Nielsen, Ali, Hassan, Ahmed, Abdi, Osman, Touré, Koné, Diallo, Mensah, Okafor, Kim, Tanaka, Nguyen, Khan, Petrović',
);

export const NAME_POOLS: Readonly<Record<string, NamePool>> = {
  FRA: p(
    'Lucas, Hugo, Enzo, Léo, Nathan, Théo, Mathis, Noah, Louis, Gabriel, Raphaël, Jules, Adam, Maxime, Antoine, Clément, Thomas, Alexandre, Baptiste, Romain, Quentin, Rayan, Yanis, Ilan, Mehdi, Sofiane, Kévin, Florian, Dylan, Arthur, Paul, Valentin, Benjamin, Julien, Axel',
    'Martin, Bernard, Dubois, Thomas, Robert, Richard, Petit, Durand, Leroy, Moreau, Simon, Laurent, Lefebvre, Michel, Garcia, David, Bertrand, Roux, Vincent, Fournier, Morel, Girard, André, Mercier, Blanc, Guérin, Boyer, Garnier, Faure, Rousseau, Lemaire, Gauthier, Perrin, Diallo, Traoré, Konaté, Coulibaly, Benali, Bouazza, Camara, Sylla, Ferreira, Da Silva, Lopes, Marchand, Dumont, Renard, Aubert, Lacroix, Delorme',
  ),
  ESP: p(
    'Pablo, Álvaro, Sergio, Daniel, Javier, Adrián, Diego, Marcos, Rubén, Iker, Jorge, Carlos, Mikel, Unai, Ander, Aitor, Iván, Raúl, Fernando, Gonzalo, Hugo, Martín, Lucas, Mario, Pau, Joan, Gerard, Nico, Alejandro, Óscar',
    'García, Rodríguez, González, Fernández, López, Martínez, Sánchez, Pérez, Gómez, Martín, Jiménez, Ruiz, Hernández, Díaz, Moreno, Muñoz, Álvarez, Romero, Alonso, Gutiérrez, Navarro, Torres, Domínguez, Vázquez, Ramos, Gil, Serrano, Blanco, Molina, Morales, Ortega, Delgado, Castro, Iglesias, Garrido',
  ),
  ITA: p(
    'Alessandro, Lorenzo, Matteo, Francesco, Andrea, Gabriele, Riccardo, Tommaso, Leonardo, Federico, Marco, Davide, Simone, Nicolò, Giacomo, Pietro, Edoardo, Luca, Samuele, Mattia, Filippo, Antonio, Giovanni, Stefano, Alessio, Emanuele, Christian, Manuel',
    'Rossi, Russo, Ferrari, Esposito, Bianchi, Romano, Colombo, Ricci, Marino, Greco, Bruno, Gallo, Conti, De Luca, Mancini, Costa, Giordano, Rizzo, Lombardi, Moretti, Barbieri, Fontana, Santoro, Mariani, Rinaldi, Caruso, Ferrara, Galli, Martini, Leone, Longo, Gentile, Martinelli, Vitale, Serra, Coppola, De Santis, Marchetti',
  ),
  DEU: p(
    'Leon, Lukas, Jonas, Finn, Paul, Luca, Felix, Maximilian, Julian, Niklas, Tim, Moritz, Jan, David, Elias, Noah, Ben, Tom, Fabian, Philipp, Nico, Marcel, Kevin, Florian, Sebastian, Dominik, Timo, Jannik, Malik, Deniz',
    'Müller, Schmidt, Schneider, Fischer, Weber, Meyer, Wagner, Becker, Schulz, Hoffmann, Schäfer, Koch, Bauer, Richter, Klein, Wolf, Schröder, Neumann, Schwarz, Zimmermann, Braun, Krüger, Hofmann, Hartmann, Lange, Schmitt, Werner, Krause, Lehmann, Köhler, Herrmann, Walter, König, Huber, Kaiser, Fuchs, Peters, Lang, Scholz',
  ),
  ENG: p(
    'Harry, Jack, Oliver, George, Charlie, Jacob, Alfie, Thomas, Oscar, William, James, Joshua, Henry, Archie, Ethan, Freddie, Lewis, Callum, Kieran, Connor, Ryan, Jordan, Mason, Tyler, Reece, Jamie, Ben, Luke, Sam, Marcus',
    'Smith, Jones, Taylor, Brown, Williams, Wilson, Johnson, Davies, Robinson, Wright, Thompson, Evans, Walker, White, Roberts, Green, Hall, Wood, Jackson, Clarke, Harris, Lewis, Turner, Hill, Cooper, Ward, Morris, King, Baker, Bell, Hughes, Watson, Phillips, Carter, Mitchell, Parker, Bennett, Gray, Barnes, Dawson',
  ),
  PRT: p(
    'João, Diogo, Gonçalo, Rafael, Tiago, Rúben, Bruno, André, Pedro, Nuno, Rui, Ricardo, Fábio, Vítor, Miguel, Daniel, Francisco, Tomás, Afonso, Duarte, Bernardo, Renato, Nélson, Hélder, Sérgio, Paulo, Carlos, Gil',
    'Silva, Santos, Ferreira, Pereira, Oliveira, Costa, Rodrigues, Martins, Jesus, Sousa, Fernandes, Gonçalves, Gomes, Lopes, Marques, Alves, Almeida, Ribeiro, Pinto, Carvalho, Teixeira, Moreira, Correia, Mendes, Nunes, Soares, Vieira, Monteiro, Cardoso, Rocha, Neves, Coelho, Cruz, Cunha, Pires, Ramos, Antunes, Leite, Semedo, Fonseca',
  ),
  BRA: p(
    'Gabriel, Lucas, Matheus, Rafael, Guilherme, Felipe, Bruno, Rodrigo, Vinícius, Thiago, Pedro, João, Vitor, Caio, Leonardo, Eduardo, Gustavo, Diego, Danilo, Douglas, Wesley, Éverton, Anderson, Wellington, Marcos, Igor, Kaio, Yuri, Murilo, Arthur',
    'Silva, Santos, Oliveira, Souza, Lima, Pereira, Ferreira, Costa, Rodrigues, Almeida, Nascimento, Araújo, Carvalho, Gomes, Martins, Ribeiro, Alves, Barbosa, Rocha, Moreira, Cardoso, Batista, Freitas, Cunha, Teixeira, Correia, Vieira, Mendes, Nunes, Dias, Castro, Campos, Andrade, Pinto, Machado, Lopes, Ramos, Fernandes',
  ),
  ARG: p(
    'Lautaro, Julián, Enzo, Nicolás, Lucas, Ezequiel, Facundo, Nahuel, Alexis, Ángel, Rodrigo, Leandro, Gonzalo, Matías, Federico, Emiliano, Cristian, Juan, Franco, Thiago, Santiago, Tomás, Valentín, Bruno, Marcos, Agustín, Maximiliano, Exequiel, Giovani, Lisandro',
    'González, Rodríguez, Gómez, Fernández, López, Díaz, Martínez, Pérez, García, Sánchez, Romero, Sosa, Torres, Álvarez, Ruiz, Ramírez, Flores, Benítez, Acosta, Medina, Herrera, Aguirre, Molina, Castro, Ortiz, Silva, Rojas, Luna, Suárez, Cabrera, Ledesma, Paredes, Correa, Pereyra, Quintero, Vera, Ojeda, Giménez, Barrios, Villalba',
  ),
  NLD: p(
    'Daan, Sem, Luuk, Bram, Thijs, Lars, Jesse, Milan, Ruben, Tim, Sven, Joris, Teun, Wout, Stijn, Niels, Jasper, Kevin, Mitchell, Donny, Jurriën, Ryan, Xavi, Cody, Justin, Quinten, Jordy, Rick, Bart, Mees',
    'De Jong, Jansen, De Vries, Van den Berg, Van Dijk, Bakker, Janssen, Visser, Smit, Meijer, De Boer, Mulder, De Groot, Bos, Vos, Peters, Hendriks, Van Leeuwen, Dekker, Brouwer, De Wit, Dijkstra, Smits, De Graaf, Van der Meer, Kok, Jacobs, Van der Linden, Veerman, Vermeulen, Willems, Hoekstra, Kuipers, Post, Schouten',
  ),
  BEL: p(
    'Arthur, Noah, Louis, Lucas, Jules, Adam, Liam, Victor, Mathis, Nathan, Thomas, Maxime, Simon, Théo, Amadou, Yannick, Youri, Jérémy, Kevin, Thibaut, Dries, Wout, Jan, Toby, Axel, Leandro, Loïs, Aster, Arne, Zeno',
    'Peeters, Janssens, Maes, Jacobs, Mertens, Willems, Claes, Goossens, Wouters, De Smet, Dubois, Lambert, Dupont, Martin, Simon, Vermeulen, Hermans, Lemmens, Vandenberghe, Van Damme, Pauwels, Declercq, Verhaeghe, Michiels, Theate, Onana, Debast, De Cuyper, Vanaken, Bataille',
  ),
  MAR: p(
    'Youssef, Achraf, Sofiane, Hakim, Yassine, Amine, Ayoub, Anas, Mehdi, Zakaria, Bilal, Ismaël, Oussama, Hamza, Ilias, Nabil, Abdelhamid, Soufiane, Reda, Walid, Adam, Omar, Taha, Younès, Ayman, Noussair, Munir, Azzedine, Brahim, Rachid',
    'Alaoui, Bennani, El Amrani, Benjelloun, Tazi, Ziani, Idrissi, El Fassi, Chaoui, Berrada, Amrabat, Ounahi, Boufal, Mazraoui, Aguerd, Saïss, Bounou, El Kaabi, Sabiri, Ezzalzouli, Harit, Cheddira, El Yamiq, Aboukhlal, Lamrani, Bouchouari, Rahimi, Ouahbi, Benkirane, Chebbak',
  ),
  DZA: p(
    'Riyad, Ismaël, Youcef, Sofiane, Rayan, Amine, Hicham, Islam, Aïssa, Ramy, Adam, Farès, Mohamed, Baghdad, Houssem, Yacine, Zineddine, Saïd, Bilal, Nabil, Karim, Andy, Adlène, Mehdi, Rachid, Djamel, Walid, Ilyes, Anis, Akram',
    'Bensebaïni, Bennacer, Slimani, Belaïli, Feghouli, Brahimi, Atal, Bounedjah, Benrahma, Aouar, Zerrouki, Amoura, Ounas, Belkebla, Bouanani, Mandi, Touba, Hadjam, Chaïbi, Guedioura, Boudaoui, Kaddour, Zorgane, Benzia, Ghezzal, Bendebka, Benchaa, Chergui, Halimi, Meziane',
  ),
  SEN: p(
    'Sadio, Kalidou, Idrissa, Ismaïla, Édouard, Cheikhou, Boulaye, Habib, Pape, Moussa, Abdoulaye, Nampalys, Iliman, Bamba, Fodé, Krépin, Mamadou, Ousmane, Lamine, Youssouf, Saliou, Formose, Nicolas, Alfred, Bouna, Papa, Demba, Ibrahima, Malick, Cheikh',
    'Diallo, Ndiaye, Diop, Sarr, Sow, Faye, Gueye, Diouf, Sy, Ba, Camara, Ciss, Mendy, Dieng, Seck, Thiam, Niang, Fall, Diagne, Kouyaté, Sané, Badji, Mbaye, Cissokho, Dia, Sène, Wade, Diatta, Sagna, Coly',
  ),
  CIV: p(
    'Sébastien, Wilfried, Franck, Serge, Jean-Philippe, Nicolas, Ibrahim, Simon, Seko, Amad, Evan, Oumar, Christian, Odilon, Willy, Jean-Michaël, Max-Alain, Hamed, Yao, Ismaël, Kouassi, Cheick, Sinaly, Ghislain, Emmanuel, Eric, Karim, Maxwel, Jérémie, Junior',
    'Kouassi, Koné, Kouamé, Yao, Traoré, Konan, Bamba, Diomandé, Coulibaly, Kouadio, Touré, Doumbia, Gbohouo, Aurier, Sangaré, Fofana, Boly, Gradel, Diallo, Ouattara, Cornet, Bailly, Krasso, Adingra, Seri, N\'Guessan, Akpa, Zoro, Tiéné, Gbamin',
  ),
  CMR: p(
    'Vincent, Karl, André-Frank, Bryan, Eric-Maxim, Christian, Samuel, Nicolas, Olivier, Georges-Kévin, Jean-Charles, Ignatius, Frank, Carlos, Nouhou, Enzo, Jean, Moumi, Clinton, Stéphane, Yvan, Ambroise, Wilfried, Fabrice, Michael, Jérôme, Pierre, Arnaud, Landry, Sébastien',
    'Zambo Anguissa, Mbeumo, Bassogog, Ngamaleu, Nkoulou, Ondoa, Tolo, Ngadeu, Castelletto, Kunde, Ekambi, Oyongo, Mbekeli, Nsame, Fai, Ntcham, Njie, Ganago, Ebosse, Tchakoute, Djoum, Bahoken, Kemen, Mvoue, Tchato, Nlend, Biyick, Essomba, Mbida, Nguemo',
  ),
  NGA: p(
    'Victor, Ademola, Samuel, Kelechi, Alex, Wilfred, Frank, Calvin, Moses, Zaidu, Ola, Taiwo, Paul, Joe, Kenneth, Bright, Terem, Chidera, Raphael, Emmanuel, Innocent, William, Olisa, Semi, Francis, Kingsley, Ebuka, Gift, Sadiq, Tolu',
    'Lookman, Chukwueze, Iheanacho, Iwobi, Ndidi, Onyeka, Bassey, Simon, Sanusi, Aina, Awoniyi, Onuachu, Aribo, Omeruo, Osayi-Samuel, Moffi, Ejuke, Onyedika, Dennis, Bonke, Ndah, Ajayi, Uzoho, Okoye, Nwabali, Adebayo, Boniface, Musa, Okocha, Obi',
  ),
  GHA: p(
    'Mohammed, Thomas, Jordan, Kamaldeen, Iñaki, Tariq, Antoine, Alexander, Daniel, Abdul, Salis, Joseph, Elisha, Gideon, Ernest, Osman, Fatawu, Ibrahim, Alidu, Baba, Andy, Jeffrey, Kwasi, Kofi, Emmanuel, Richmond, Bernard, Nathaniel, Prince, Kwame',
    'Ayew, Sulemana, Williams, Lamptey, Semenyo, Djiku, Amartey, Mensah, Owusu, Boateng, Asante, Appiah, Gyan, Muntari, Baba, Nuamah, Seidu, Bukari, Paintsil, Schlupp, Yeboah, Agyemang, Sarpong, Ofori, Addo, Osei, Annan, Acheampong, Frimpong, Opoku',
  ),
  MLI: p(
    'Yves, Moussa, Amadou, Kalifa, Adama, Lassana, Diadie, Mohamed, Boubacar, Hamari, Sékou, Nene, Ibrahima, Cheick, Kamory, Mamadou, Djigui, Aliou, Falaye, Souleymane, Abdoulaye, Sikou, Fousseni, Youssouf, Lassine, Almamy, Modibo, Ismaël, Ousmane, Drissa',
    'Haidara, Coulibaly, Doumbia, Diarra, Traoré, Koné, Sissoko, Camara, Keïta, Konaté, Sylla, Touré, Diallo, Samassékou, Kouyaté, Djenepo, Sinayoko, Fofana, Diakité, Guindo, Niane, Dembélé, Sangaré, Maïga, Sacko, Tounkara, Bagayoko, Cissé, Dabo, Kanté',
  ),
  TUR: p(
    'Arda, Kenan, Hakan, Ferdi, Kerem, Cengiz, Merih, Zeki, Barış, Orkun, Salih, Yusuf, İrfan, Emre, Burak, Uğurcan, Mert, Altay, Abdülkerim, Kaan, Enes, Semih, Can, Berkan, Ozan, Umut, Halil, Rıdvan, Oğuz, Ahmet',
    'Yılmaz, Kaya, Demir, Şahin, Çelik, Yıldız, Yıldırım, Öztürk, Aydın, Özdemir, Arslan, Doğan, Kılıç, Aslan, Çetin, Kara, Koç, Kurt, Özkan, Şimşek, Polat, Güler, Kadıoğlu, Aktürkoğlu, Ünder, Demiral, Çakır, Kökçü, Yazıcı, Tosun',
  ),
  HRV: p(
    'Luka, Ivan, Marko, Mateo, Josip, Ante, Lovro, Mario, Andrej, Nikola, Duje, Borna, Toni, Petar, Bruno, Domagoj, Dominik, Marcelo, Kristijan, Filip, Martin, Dejan, Ivo, Ivica, Šime, Joško, Stipe, Dario, Marin, Antonio',
    'Kovačić, Perišić, Brozović, Gvardiol, Kramarić, Livaković, Vlašić, Pašalić, Sučić, Majer, Baturina, Ivanušec, Sosa, Juranović, Stanišić, Erlić, Pongračić, Vida, Lovren, Ćaleta-Car, Petković, Budimir, Oršić, Rebić, Horvat, Babić, Marić, Jurić, Novak, Kovač',
  ),
  SRB: p(
    'Dušan, Aleksandar, Nikola, Filip, Strahinja, Nemanja, Luka, Miloš, Andrija, Sergej, Saša, Marko, Lazar, Stefan, Uroš, Vanja, Predrag, Ivan, Đorđe, Veljko, Milan, Petar, Dejan, Mihajlo, Jovan, Nenad, Vladimir, Bogdan, Kosta, Matija',
    'Mitrović, Tadić, Pavlović, Gudelj, Kostić, Lukić, Živković, Jović, Samardžić, Ilić, Babić, Veljković, Milenković, Rajković, Petrović, Jovanović, Nikolić, Đorđević, Stojković, Marković, Popović, Stanković, Ivanović, Simić, Radonjić, Terzić, Maksimović, Ristić, Lazić, Đukić',
  ),
  POL: p(
    'Robert, Piotr, Wojciech, Jakub, Kamil, Krzysztof, Arkadiusz, Karol, Sebastian, Przemysław, Bartosz, Mateusz, Michał, Jan, Łukasz, Patryk, Damian, Adam, Paweł, Tomasz, Marcin, Kacper, Dominik, Filip, Szymon, Maciej, Dawid, Rafał, Grzegorz, Igor',
    'Zieliński, Kiwior, Bednarek, Frankowski, Piątek, Milik, Zalewski, Skorupski, Szymański, Moder, Linetty, Świderski, Buksa, Grosicki, Glik, Bereszyński, Kędziora, Kowalski, Nowak, Wiśniewski, Wójcik, Kamiński, Kaczmarek, Mazur, Kozłowski, Jankowski, Wojciechowski, Zając, Pawlak, Sikora',
  ),
  DNK: p(
    'Christian, Pierre-Emile, Rasmus, Andreas, Joakim, Kasper, Simon, Thomas, Mikkel, Jonas, Victor, Jens, Morten, Alexander, Mathias, Daniel, Frederik, Jesper, Anders, Nikolaj, Emil, Mads, Oliver, Gustav, Lucas, Malthe, Elias, Magnus, Marcus, Jacob',
    'Højbjerg, Christensen, Mæhle, Kjær, Skov, Damsgaard, Delaney, Dolberg, Wind, Poulsen, Andersen, Nørgaard, Bah, Kristiansen, Jensen, Nielsen, Hansen, Pedersen, Larsen, Sørensen, Rasmussen, Jørgensen, Petersen, Madsen, Kristensen, Olsen, Thomsen, Mortensen, Lund, Holm',
  ),
  SWE: p(
    'Alexander, Emil, Dejan, Viktor, Victor, Anthony, Robin, Ludwig, Jesper, Mattias, Marcus, Sebastian, Albin, Hugo, Elias, William, Oscar, Filip, Gustav, Joel, Anton, Kristoffer, Pontus, Jens, Carl, Samuel, Lucas, Noah, Benjamin, Isak',
    'Forsberg, Kulusevski, Lindelöf, Gyökeres, Elanga, Svanberg, Larsson, Olsen, Bergvall, Cajuste, Nilsson, Karlsson, Andersson, Johansson, Eriksson, Pettersson, Persson, Svensson, Gustafsson, Jonsson, Lindqvist, Berg, Holm, Lundberg, Sandberg, Ekdal, Augustinsson, Starfelt, Hien, Lindgren',
  ),
  NOR: p(
    'Erling, Martin, Alexander, Sander, Kristian, Mohamed, Fredrik, Antonio, Leo, Oscar, Julian, Jørgen, Morten, Stefan, Marcus, Ørjan, Kristoffer, Aron, Andreas, Patrick, Håkon, Jonas, Magnus, Sondre, Emil, Sivert, Jens, Tobias, Ola, Vetle',
    'Sørloth, Berge, Thorstvedt, Bobb, Nusa, Ryerson, Ajer, Hanche-Olsen, Nyland, Aursnes, Strand, Hansen, Johansen, Olsen, Larsen, Andersen, Pedersen, Nilsen, Kristiansen, Jensen, Karlsen, Johnsen, Pettersen, Eriksen, Berg, Haugen, Hagen, Solbakken, Moen, Dahl',
  ),
  CHE: p(
    'Granit, Xherdan, Manuel, Yann, Breel, Ricardo, Remo, Denis, Fabian, Silvan, Noah, Zeki, Dan, Ruben, Cédric, Nico, Kevin, Michel, Ardon, Leonidas, Vincent, Loris, Steven, Renato, Djibril, Haris, Eray, Christian, Ulisses, Luca',
    'Akanji, Sommer, Embolo, Rodríguez, Freuler, Zakaria, Schär, Widmer, Okafor, Amdouni, Ndoye, Vargas, Zesiger, Elvedi, Aebischer, Sow, Rieder, Steffen, Müller, Meier, Schmid, Keller, Weber, Huber, Schneider, Brunner, Frei, Baumann, Zuber, Gerber',
  ),
  AUT: p(
    'David, Marcel, Konrad, Christoph, Marko, Xaver, Nicolas, Patrick, Philipp, Kevin, Stefan, Michael, Florian, Maximilian, Alexander, Andreas, Julian, Leo, Romano, Gernot, Matthias, Lukas, Sasa, Valentino, Moritz, Dominik, Fabian, Daniel, Manuel, Thomas',
    'Sabitzer, Laimer, Baumgartner, Arnautović, Schlager, Seiwald, Grillitsch, Wöber, Posch, Lienhart, Trauner, Danso, Pentz, Schmid, Gregoritsch, Wimmer, Prass, Kainz, Mwene, Gruber, Huber, Bauer, Wagner, Müller, Pichler, Steiner, Moser, Mayer, Hofer, Berger',
  ),
  USA: p(
    'Christian, Weston, Tyler, Gio, Timothy, Sergiño, Matt, Chris, Antonee, Folarin, Ricardo, Brenden, Yunus, Josh, Malik, Ethan, Tanner, Kellyn, Cameron, Zack, Walker, Luca, Johnny, Joe, Brandon, Jordan, Paxten, Aidan, Gabriel, Miles',
    'McKennie, Adams, Reyna, Weah, Dest, Turner, Richards, Robinson, Balogun, Pepi, Aaronson, Musah, Sargent, Tillman, Horvath, Tessmann, Acosta, Carter-Vickers, Steffen, Zimmerman, De la Torre, Cardoso, Scally, Vázquez, Morris, Johnson, Williams, Miller, Davis, Anderson',
  ),
  MEX: p(
    'Hirving, Raúl, Edson, Santiago, Guillermo, Jesús, César, Johan, Luis, Julián, Orbelín, Diego, Erick, Uriel, Alexis, Henry, Carlos, Jorge, Israel, Roberto, Rodolfo, Andrés, Gerardo, Rafael, Marcelo, Fernando, Sebastián, Emilio, Víctor, Ricardo',
    'Jiménez, Álvarez, Giménez, Ochoa, Gallardo, Montes, Vásquez, Chávez, Quiñones, Pineda, Lainez, Sánchez, Antuna, Vega, Martín, Rodríguez, Araujo, Reyes, Herrera, Guardado, Corona, Alvarado, Romo, Gutiérrez, Hernández, García, Pérez, Ramírez, Flores, Aguilar',
  ),
  COL: p(
    'Luis, Jhon, James, Juan, Davinson, Yerry, Rafael, Jefferson, Camilo, Richard, Mateus, Daniel, Jorge, Santiago, Kevin, Andrés, Carlos, Yaser, Jaminton, Deiver, Álvaro, Johan, Sebastián, Cristian, Duván, Miguel, Wilmar, Éder, Brayan, Jhonatan',
    'Díaz, Arias, Rodríguez, Sánchez, Mina, Borré, Lerma, Uribe, Ríos, Cuesta, Muñoz, Machado, Carrascal, Castaño, Asprilla, Campaz, Sinisterra, Durán, Zapata, Cuadrado, Ospina, Vargas, Montero, Mojica, Barrios, Quintero, Borja, Mosquera, Lucumí, Córdoba',
  ),
  URY: p(
    'Federico, Darwin, Ronald, Rodrigo, Facundo, Nicolás, Manuel, Mathías, Matías, Maximiliano, Sebastián, Giorgian, Diego, José María, Luis, Edinson, Agustín, Santiago, Brian, Guillermo, Nahitan, Cristian, Bruno, Emiliano, Gastón, Lucas, Juan, Martín, Franco, Gonzalo',
    'Núñez, Araújo, Bentancur, Pellistri, De la Cruz, Ugarte, Olivera, Viña, Giménez, Rochet, Godín, Vecino, Nández, Torres, Rodríguez, Fernández, Pereira, González, Martínez, Sosa, Silva, Cáceres, Coates, Bueno, Betancur, Canobbio, Arrascaeta, Piquerez, Varela, Méndez',
  ),
  CHL: p(
    'Alexis, Arturo, Claudio, Charles, Gary, Erick, Ben, Eduardo, Diego, Paulo, Marcelino, Guillermo, Darío, Víctor, Jean, Francisco, Tomás, Alexander, Felipe, Vicente, Matías, Ignacio, Benjamín, Gabriel, Bruno, Clemente, Lucas, Marcelo, Bastián, Nicolás',
    'Sánchez, Bravo, Aránguiz, Medel, Pulgar, Brereton, Vargas, Valdés, Díaz, Núñez, Maripán, Osorio, Dávila, Pizarro, Isla, Suazo, Salas, Rojas, Fernández, González, Muñoz, Soto, Contreras, Silva, Martínez, Sepúlveda, Morales, Castillo, Riquelme, Tapia',
  ),
  JPN: p(
    'Takefusa, Kaoru, Ritsu, Daichi, Wataru, Takumi, Hidemasa, Ko, Hiroki, Ayase, Junya, Kyogo, Reo, Keito, Takehiro, Yuta, Shogo, Zion, Kota, Sota, Ao, Yukinari, Shuto, Koki, Daizen, Kento, Yuki, Ryota, Seiya, Genki',
    'Doan, Kamada, Endo, Minamino, Morita, Itakura, Ito, Ueda, Furuhashi, Hatate, Tomiyasu, Nakamura, Machida, Taniguchi, Suzuki, Sugawara, Tanaka, Sato, Takahashi, Watanabe, Yamada, Kobayashi, Kato, Yoshida, Yamamoto, Sasaki, Matsumoto, Inoue, Kimura, Hayashi',
  ),
  KOR: p(
    'Heung-min, Min-jae, Kang-in, Ui-jo, In-beom, Jae-sung, Woo-yeong, Seung-ho, Jin-su, Tae-hwan, Young-woo, Sang-ho, Hyun-woo, Seung-gyu, Gue-sung, Jun-ho, Dong-gyeong, Chan-hee, Min-kyu, Seung-won, Ji-soo, Hyeon-gyu, Do-young, Hyun-jun, Kyung-won, Yong, Ho-seung, Min-hyeok, Jung-hoon, Tae-young',
    'Kim, Lee, Hwang, Cho, Park, Jung, Kang, Yoon, Song, Kwon, Oh, Han, Jang, Bae, Seol, Na, Moon, Hong, Shin, Ryu, Yang, Baek, Ahn, Ko, Nam, Seo, Joo, Jeon, Ha, Ji',
  ),
  EGY: p(
    'Mohamed, Omar, Mostafa, Ahmed, Mahmoud, Amr, Tarek, Karim, Marwan, Emam, Hussein, Ali, Hamdi, Ibrahim, Youssef, Hossam, Ayman, Khaled, Ramadan, Abdallah, Akram, Kahraba, Mohanad, Taher, Sherif, Ahmed, Sayed, Islam, Bassem, Walid',
    'Marmoush, Elneny, Hegazi, Sobhi, Hamdi, Ashour, Fathi, Zizo, Ramadan, El-Shenawy, Abou Gabal, Mohamed, Ahmed, Hassan, Ibrahim, Mahmoud, Ali, Abdelrahman, Farouk, Kamal, Soliman, Rizk, Gaber, Hamed, Tawfik, Ezzat, Shalaby, Attia, Mostafa, Youssef',
  ),
  TUN: p(
    'Hannibal, Aïssa, Wahbi, Ellyes, Youssef, Ali, Montassar, Dylan, Anis, Yassine, Naïm, Mohamed, Seifeddine, Ferjani, Elias, Bilel, Saïf-Eddine, Hamza, Haythem, Ghaylen, Taha, Yan, Issam, Nader, Omar, Rami, Achref, Firas, Skander, Sami',
    'Mejbri, Laïdouni, Khazri, Skhiri, Msakni, Maâloul, Talbi, Bronn, Ben Slimane, Sliti, Abdi, Dräger, Jaziri, Sassi, Rafia, Ben Romdhane, Achouri, Chaouat, Ben Hamida, Ghandri, Kechrida, Hassen, Dahmen, Ben Said, Mathlouthi, Chaalali, Haddadi, Ifa, Kasraoui, Meriah',
  ),
  COD: p(
    'Cédric, Chancel, Yoane, Arthur, Gaël, Silas, Théo, Samuel, Aaron, Christian, Dieumerci, Jordan, Gédéon, Meschack, Charles, Simon, Fiston, Grady, Edo, Henoc, Joris, Axel, Noah, Lionel, Elia, Kevin, Yannick, Paul-José, Dimitri, Nathan',
    'Bakambu, Mbemba, Wissa, Masuaku, Kakuta, Bongonda, Moutoussamy, Kabasele, Mbokani, Elia, Kalulu, Elonga, Pickel, Banza, Mayele, Mukau, Kayembe, Tshibola, Bope, Batubinsika, Lomami, Tulonge, Kazadi, Mputu, Muleka, Kabongo, Lukoki, Tshimanga, Ilunga, Mbuyi',
  ),
  GIN: p(
    'Naby, Serhou, Ilaix, Amadou, Mohamed, François, Issiaga, Mory, Julian, Aguibou, Morgan, Sékou, Mamadou, Ibrahima, Saïdou, Antoine, Seydouba, Abdoulaye, Alseny, Aboubacar, Moriba, Ousmane, Facinet, Lamine, Kaba, Mady, Fodé, Alpha, Thierno, Pathé',
    'Keïta, Guirassy, Diawara, Bayo, Kamano, Sylla, Konaté, Jeanvier, Camara, Guilavogui, Cissé, Bah, Traoré, Kanté, Barry, Diallo, Touré, Soumah, Condé, Youla, Fofana, Kouyaté, Sow, Yattara, Doumbouya, Balde, Souaré, Diaby, Loua, Bangoura',
  ),
  CPV: p(
    'Ryan, Jovane, Garry, Bebé, Logan, Willy, Josimar, Roberto, Kevin, Vozinha, Kenny, Steven, Bruno, Dailon, Djaniny, Deroy, Nuno, Diney, Júlio, Patrick, Gilson, Pico, Laros, Sidny, Marco, Kelvin, Jamiro, Duarte, Telmo, Stopira',
    'Mendes, Cabral, Semedo, Tavares, Lopes, Fortes, Livramento, Pina, Andrade, Rocha, Monteiro, Duarte, Rodrigues, Fernandes, Vieira, Silva, Santos, Sanches, Delgado, Brito, Gomes, Barbosa, Moreira, Lima, Dias, Costa, Almeida, Correia, Furtado, Évora',
  ),
};

/** Pool de noms d'un pays (code ISO ou FIFA), repli international sinon. */
export function namePool(code: string): NamePool {
  return NAME_POOLS[normalizeCountryCode(code)] ?? INTERNATIONAL_POOL;
}

/**
 * Nationalités étrangères plausibles dans un championnat, avec leur poids
 * relatif, par pays d'accueil. Sert au tirage des PNJ générés.
 */
export const FOREIGN_NATIONALITY_WEIGHTS: Readonly<Record<string, readonly [CountryCode, number][]>> = {
  FRA: [
    ['MAR', 9], ['DZA', 8], ['SEN', 8], ['CIV', 7], ['CMR', 6], ['MLI', 6], ['GIN', 4], ['COD', 4], ['TUN', 3], ['CPV', 2],
    ['BRA', 7], ['ARG', 5], ['PRT', 5], ['ESP', 4], ['ITA', 3], ['BEL', 4], ['NLD', 3], ['DNK', 3], ['NOR', 2], ['SWE', 2],
    ['POL', 2], ['HRV', 2], ['SRB', 2], ['TUR', 2], ['ENG', 2], ['DEU', 2], ['CHE', 2], ['AUT', 1], ['USA', 2], ['MEX', 1],
    ['COL', 2], ['URY', 2], ['CHL', 1], ['JPN', 2], ['KOR', 2], ['EGY', 1], ['NGA', 3], ['GHA', 3],
  ],
};

/** Poids par défaut quand le pays d'accueil n'a pas de table dédiée. */
export const DEFAULT_FOREIGN_WEIGHTS: readonly [CountryCode, number][] = [
  ['BRA', 6], ['ARG', 4], ['FRA', 3], ['ESP', 3], ['PRT', 3], ['NLD', 2], ['ENG', 2], ['DEU', 2], ['ITA', 2],
  ['SEN', 2], ['CIV', 2], ['NGA', 2], ['GHA', 2], ['MAR', 2], ['JPN', 1], ['KOR', 1], ['USA', 1], ['COL', 1],
];
