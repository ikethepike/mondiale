import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Curated list of country-anchored world events for the Timeline round. A
 * hand-picked seed (rather than a Wikidata query) keeps the set MEMORABLE —
 * events a player has at least brushed against — and controllable. Each entry
 * is a Wikidata-searchable name + its anchor country + a curated year; the
 * generator resolves the Q-id and verifies the year against the item's time
 * claims (P585 point-in-time first, then start/end/inception/publication/
 * discovery/launch). An entry whose year Wikidata cannot confirm is dropped
 * and reported, never silently shipped.
 *
 * Descriptions follow the landmark-facts rules: hand-written, but checked
 * against each event's Wikipedia lead via fetch-event-facts + check-event-facts.
 * Aim for the detail a player retells at the table, not the encyclopedia line.
 *
 * `year` is the year the CARD asserts — the single number the whole round
 * turns on. Negative years are BCE.
 */
export type EventKind =
  | 'revolution'
  | 'nation'
  | 'conflict'
  | 'politics'
  | 'disaster'
  | 'engineering'
  | 'science'
  | 'culture'

export interface EventSeed {
  /** Wikidata-searchable name, disambiguating words included. */
  name: string
  /** Card title shown to players; defaults to `name`. */
  title?: string
  /** Anchor country for the card's flag and variant filtering. */
  country: ISOCountryCode
  kind: EventKind
  /** Curated year (negative = BCE), verified against Wikidata time claims. */
  year: number
  /** One or two lines for the post-placement reveal. */
  description: string
  /** Pin the exact Wikidata item, e.g. `Q6939`, when name search misfires. */
  qid?: string
  /** Image overrides, tried before the Wikidata page image: a direct file
   *  URL, or an explicit Commons filename. */
  imageUrl?: string
  commons?: string
}

export const EVENT_SEEDS: EventSeed[] = [
  // --- Antiquity ------------------------------------------------------------
  {
    name: 'Battle of Marathon',
    country: 'GR',
    kind: 'conflict',
    year: -490,
    description:
      'Athens beat back the first Persian invasion of Greece on the plain of Marathon. The modern 42-kilometre race is named for the messenger legend that grew out of it.',
  },
  {
    name: 'Battle of Thermopylae',
    country: 'GR',
    kind: 'conflict',
    year: -480,
    description:
      'King Leonidas and his rearguard — the famous three hundred Spartans among them — held the mountain pass at Thermopylae for days against the vast Persian army before being wiped out.',
  },
  {
    name: 'Death of Alexander the Great',
    country: 'IQ',
    kind: 'politics',
    year: -323,
    description:
      'Alexander died in Babylon at thirty-two, ruler of an empire reaching from Greece to India. His generals immediately carved it apart.',
  },
  {
    name: "Qin's wars of unification",
    title: 'China is unified under its First Emperor',
    country: 'CN',
    kind: 'nation',
    year: -221,
    description:
      'The state of Qin swallowed the last of its rival kingdoms and its king proclaimed himself Qin Shi Huang — First Emperor. Standard script, currency and measures followed; so did the first Great Wall.',
  },
  {
    name: 'Assassination of Julius Caesar',
    country: 'IT',
    kind: 'politics',
    year: -44,
    description:
      "Rome's dictator was stabbed by dozens of senators at a Senate meeting on the Ides of March. The republic they claimed to save died with him — his heir became the first emperor.",
  },
  {
    name: 'Battle of Actium',
    country: 'GR',
    kind: 'conflict',
    year: -31,
    description:
      "Octavian's fleet crushed Antony and Cleopatra off the west coast of Greece. Egypt fell, both lovers died by suicide, and Octavian ruled Rome alone as Augustus.",
  },
  {
    name: 'Eruption of Mount Vesuvius in 79 AD',
    title: 'Vesuvius buries Pompeii',
    country: 'IT',
    kind: 'disaster',
    year: 79,
    description:
      'Vesuvius erupted and buried Pompeii and Herculaneum under metres of ash, freezing two Roman towns mid-breath. They stayed sealed for over 1,500 years.',
  },
  {
    name: 'Edict of Milan',
    country: 'IT',
    kind: 'politics',
    year: 313,
    description:
      'Constantine and his co-emperor agreed to tolerate Christianity across the Roman Empire, ending centuries of persecution. Within a century it was the state religion.',
  },
  {
    name: 'Fall of the Western Roman Empire',
    country: 'IT',
    kind: 'nation',
    year: 476,
    description:
      'The Germanic commander Odoacer deposed the teenage emperor Romulus Augustulus and did not bother appointing another. The eastern half of the empire carried on from Constantinople for another thousand years.',
  },
  {
    name: 'Hegira',
    title: 'The Hegira — Muhammad leaves Mecca for Medina',
    country: 'SA',
    kind: 'culture',
    year: 622,
    description:
      'Muhammad and his followers left Mecca for Medina to escape persecution. The journey counts as year one of the Islamic calendar.',
  },
  {
    name: 'Coronation of Charlemagne',
    title: 'Charlemagne is crowned emperor',
    country: 'FR',
    kind: 'politics',
    year: 800,
    description:
      'Pope Leo III crowned the Frankish king Charlemagne emperor in Rome on Christmas Day — the first western emperor in three centuries, and the seed of the Holy Roman Empire.',
  },
  {
    name: 'Althing',
    title: 'Iceland founds the Althing',
    country: 'IS',
    kind: 'culture',
    year: 930,
    description:
      "Icelandic chieftains began meeting each summer at Þingvellir in an assembly called the Althing. It still sits today — the world's oldest surviving parliament.",
  },
  {
    name: "Christianization of Kievan Rus'",
    country: 'UA',
    kind: 'culture',
    year: 988,
    description:
      "Grand Prince Vladimir of Kyiv had himself and his people baptised into Byzantine Christianity, mass-christening them in the Dnieper. Eastern Europe's religious map was drawn that day.",
  },

  // --- Middle Ages ----------------------------------------------------------
  {
    name: 'East–West Schism',
    title: 'The Great Schism splits Christianity',
    country: 'VA',
    kind: 'culture',
    year: 1054,
    description:
      'Rome and Constantinople excommunicated each other, splitting Christianity into Catholic and Orthodox halves. The mutual excommunications were only lifted in 1965.',
  },
  {
    name: 'Battle of Hastings',
    country: 'GB',
    kind: 'conflict',
    year: 1066,
    description:
      'William of Normandy killed King Harold and took England in a single October day. The conquest rewired the English language, law and aristocracy.',
  },
  {
    name: 'University of Bologna',
    title: 'The first university opens in Bologna',
    country: 'IT',
    kind: 'culture',
    year: 1088,
    description:
      "Law students in Bologna organised the institution now counted as the world's first university. The word universitas was coined for it.",
  },
  {
    name: 'Siege of Jerusalem (1099)',
    title: 'The First Crusade takes Jerusalem',
    country: 'IL',
    kind: 'conflict',
    year: 1099,
    description:
      'After a three-year march across Europe and Anatolia, the First Crusade stormed Jerusalem and massacred much of the city, founding a crusader kingdom that lasted not quite two centuries.',
  },
  {
    name: 'Mongol Empire',
    title: 'Genghis Khan founds the Mongol Empire',
    country: 'MN',
    kind: 'nation',
    year: 1206,
    description:
      'Temüjin united the feuding steppe tribes and took the title Genghis Khan. His descendants built the largest contiguous land empire in history.',
  },
  {
    name: 'Magna Carta',
    country: 'GB',
    kind: 'politics',
    year: 1215,
    description:
      'Rebel barons cornered King John at Runnymede and made him seal a charter putting the king himself under the law. He repudiated it within weeks — but the idea never went away.',
  },
  {
    name: 'Ottoman Empire',
    title: 'Osman founds the Ottoman state',
    country: 'TR',
    kind: 'nation',
    year: 1299,
    description:
      'A frontier warlord named Osman began carving a state out of crumbling Byzantine Anatolia. His house went on to rule an empire on three continents for six centuries.',
  },
  {
    name: 'Black Death',
    title: 'The Black Death reaches Europe',
    country: 'IT',
    kind: 'disaster',
    year: 1347,
    description:
      'Plague arrived in Sicily aboard Genoese ships and burned through the continent, killing perhaps a third to a half of Europe within five years.',
  },
  {
    name: 'Kalmar Union',
    title: 'Scandinavia unites under one crown',
    country: 'DK',
    kind: 'politics',
    year: 1397,
    description:
      'Denmark, Sweden and Norway were joined under a single monarch at Kalmar, run for most of its life from Copenhagen. Sweden fought its way out in 1523.',
  },
  {
    name: 'Battle of Grunwald',
    country: 'PL',
    kind: 'conflict',
    year: 1410,
    description:
      "A combined Polish–Lithuanian army destroyed the Teutonic Knights in one of medieval Europe's largest battles, breaking the crusading order's power for good.",
  },
  {
    name: 'Ming treasure voyages',
    title: "Zheng He's treasure fleet sets sail",
    country: 'CN',
    kind: 'science',
    year: 1405,
    description:
      'The admiral Zheng He led enormous Ming fleets — some ships several times the size of anything in Europe — across the Indian Ocean as far as East Africa, decades before Columbus.',
  },
  {
    name: 'Forbidden City',
    title: 'The Forbidden City is completed',
    country: 'CN',
    kind: 'engineering',
    year: 1420,
    description:
      'The Yongle Emperor moved the Ming capital to Beijing and into a brand-new walled palace of nearly a thousand buildings. Emperors ruled from it for the next five centuries.',
  },
  {
    name: 'Execution of Joan of Arc',
    title: 'Joan of Arc is burned at the stake',
    country: 'FR',
    kind: 'conflict',
    year: 1431,
    description:
      "The nineteen-year-old who had turned the Hundred Years' War for France was burned as a heretic in English-held Rouen. A church court annulled the verdict 25 years later; she is now a saint.",
  },
  {
    name: 'Fall of Constantinople',
    country: 'TR',
    kind: 'conflict',
    year: 1453,
    description:
      "Mehmed II's cannon breached the walls that had held for a thousand years, ending the Byzantine Empire. Constantinople became the Ottoman capital.",
  },
  {
    name: 'Gutenberg Bible',
    title: 'Gutenberg prints his Bible',
    country: 'DE',
    kind: 'science',
    year: 1455,
    description:
      'Johannes Gutenberg finished the first major book printed with movable metal type in Mainz. Printing made books cheap, and cheap books remade Europe.',
  },
  {
    name: 'Granada War',
    title: 'Granada falls — the Reconquista ends',
    country: 'ES',
    kind: 'conflict',
    year: 1492,
    description:
      'The last Muslim emirate on the Iberian Peninsula surrendered to Ferdinand and Isabella, ending nearly eight centuries of Reconquista — months before the same monarchs funded Columbus.',
  },

  // --- Age of exploration & early modern ------------------------------------
  {
    name: 'First voyage of Christopher Columbus',
    title: 'Columbus reaches the Americas',
    country: 'BS',
    kind: 'science',
    year: 1492,
    description:
      'Sailing west for Asia under the Spanish crown, Columbus made landfall in the Bahamas. He insisted to his death that he had reached the Indies.',
  },
  {
    name: 'Treaty of Tordesillas',
    title: 'Spain and Portugal divide the world',
    country: 'ES',
    kind: 'politics',
    year: 1494,
    description:
      'Spain and Portugal drew a meridian down the Atlantic and split all newly found lands between them. The line is why Brazil speaks Portuguese and most of Latin America Spanish.',
  },
  {
    name: 'Portuguese discovery of the sea route to India',
    title: 'Vasco da Gama reaches India by sea',
    country: 'IN',
    kind: 'science',
    year: 1498,
    description:
      'Vasco da Gama rounded Africa and anchored off Calicut, opening the first all-sea route between Europe and Asia and breaking the overland spice monopoly.',
  },
  {
    name: 'Ninety-five Theses',
    title: 'Luther posts his Ninety-five Theses',
    country: 'DE',
    kind: 'culture',
    year: 1517,
    description:
      'Martin Luther published ninety-five arguments against the sale of indulgences in Wittenberg. The printing press did the rest — the Reformation split western Christianity.',
  },
  {
    name: 'Fall of Tenochtitlan',
    country: 'MX',
    kind: 'conflict',
    year: 1521,
    description:
      'Cortés, his indigenous allies and a smallpox epidemic brought down the Aztec capital after a brutal siege. Mexico City rose on its ruins.',
  },
  {
    name: 'Magellan expedition',
    title: 'The first circumnavigation of the Earth',
    country: 'ES',
    kind: 'science',
    year: 1522,
    description:
      'Of the five ships and roughly 270 men who left Spain, one ship and 18 men returned three years later, having sailed all the way around the world. Magellan himself died in the Philippines.',
  },
  {
    name: 'First Battle of Panipat',
    title: 'Babur founds the Mughal Empire',
    country: 'IN',
    kind: 'nation',
    year: 1526,
    description:
      "Babur's cannon and cavalry destroyed the Delhi Sultanate's much larger army at Panipat. The Mughal dynasty he founded ruled most of India into the era of the British.",
  },
  {
    name: 'Battle of Cajamarca',
    title: 'Pizarro captures the Inca emperor',
    country: 'PE',
    kind: 'conflict',
    year: 1532,
    description:
      'Francisco Pizarro ambushed the emperor Atahualpa at Cajamarca with fewer than 200 men. A room full of gold was paid in ransom; Atahualpa was executed anyway, and the Inca Empire fell.',
  },
  {
    name: 'De revolutionibus orbium coelestium',
    title: 'Copernicus puts the Sun at the centre',
    country: 'PL',
    kind: 'science',
    year: 1543,
    description:
      "Copernicus's book placing the Sun, not the Earth, at the centre of the universe was published as he lay dying. It took a century — and Galileo's trial — for the idea to win.",
  },
  {
    name: 'Great Siege of Malta',
    country: 'MT',
    kind: 'conflict',
    year: 1565,
    description:
      'A few thousand Knights of St John and Maltese defenders held the island against a massive Ottoman armada for four months. The capital Valletta was founded on the victory.',
  },
  {
    name: 'Battle of Lepanto',
    country: 'GR',
    kind: 'conflict',
    year: 1571,
    description:
      'A Holy League fleet shattered the Ottoman navy off western Greece in the last great battle between rowed galleys. Cervantes lost the use of a hand there, years before writing Don Quixote.',
  },
  {
    name: 'Spanish Armada',
    title: 'The Spanish Armada is defeated',
    country: 'GB',
    kind: 'conflict',
    year: 1588,
    description:
      "Philip II's invasion fleet was beaten in the Channel and wrecked by storms on the long way home around Scotland and Ireland. England stayed Protestant, and stayed uninvaded.",
  },
  {
    name: 'Battle of Sekigahara',
    country: 'JP',
    kind: 'conflict',
    year: 1600,
    description:
      'Tokugawa Ieyasu won the decisive battle for control of Japan. The shogunate his victory founded kept the country at peace — and closed to most of the world — for over 250 years.',
  },
  {
    name: 'Dutch East India Company',
    title: 'The Dutch East India Company is founded',
    country: 'NL',
    kind: 'politics',
    year: 1602,
    description:
      'The Dutch merged their Asia traders into the VOC, the first company to issue shares to the public — armed with its own fleets, forts and colonies.',
  },
  {
    name: 'Jamestown',
    title: 'Jamestown — England lands in America',
    country: 'US',
    kind: 'nation',
    year: 1607,
    description:
      'The first permanent English settlement in the Americas was planted on a Virginia river island. Two-thirds of the first colonists were dead within a year, but the foothold held.',
  },
  {
    name: 'Second Defenestration of Prague',
    title: 'Prague throws its governors out the window',
    country: 'CZ',
    kind: 'conflict',
    year: 1618,
    description:
      "Protestant nobles hurled two imperial governors from a castle window in Prague — they survived the drop — and lit the fuse of the Thirty Years' War, which devastated Central Europe.",
  },
  {
    name: 'Mayflower',
    title: 'The Mayflower sails',
    country: 'US',
    kind: 'nation',
    year: 1620,
    // The ship item carries no dates; the voyage item does.
    qid: 'Q41967248',
    description:
      'A hundred-odd settlers, the Pilgrims among them, crossed from England to Cape Cod aboard the Mayflower, signing a self-government compact before stepping ashore.',
  },
  {
    name: 'Peace of Westphalia',
    country: 'DE',
    kind: 'politics',
    year: 1648,
    description:
      "The treaties ending the Thirty Years' War fixed the principle that each state is sovereign within its own borders — the operating system of international politics ever since.",
  },
  {
    name: 'Great Fire of London',
    country: 'GB',
    kind: 'disaster',
    year: 1666,
    description:
      "A bakery fire on Pudding Lane burned four-fifths of the walled city over four days, destroying more than 13,000 houses and old St Paul's Cathedral — yet recorded deaths were few.",
  },
  {
    name: 'Battle of Vienna',
    title: 'The Ottomans are turned back at Vienna',
    country: 'AT',
    kind: 'conflict',
    year: 1683,
    description:
      "The second and last Ottoman siege of Vienna was broken by a relief army under the Polish king Jan Sobieski, whose winged hussars delivered one of history's largest cavalry charges.",
  },
  {
    name: 'Philosophiæ Naturalis Principia Mathematica',
    title: 'Newton publishes the Principia',
    country: 'GB',
    kind: 'science',
    year: 1687,
    description:
      "Newton's Principia set out the laws of motion and universal gravitation — one mathematics for a falling apple and an orbiting Moon.",
  },
  {
    name: 'Glorious Revolution',
    country: 'GB',
    kind: 'revolution',
    year: 1688,
    description:
      "Parliament's allies invited William of Orange to invade and King James II fled without a battle. The Bill of Rights that followed made the English crown answer to Parliament.",
  },
  {
    name: 'Saint Petersburg',
    title: 'Peter the Great founds Saint Petersburg',
    country: 'RU',
    kind: 'nation',
    year: 1703,
    description:
      'Peter the Great founded a new capital on Baltic marshland seized from Sweden — his "window to Europe", built at enormous human cost and modelled on the West.',
  },
  {
    name: 'Acts of Union 1707',
    title: 'England and Scotland become Great Britain',
    country: 'GB',
    kind: 'nation',
    year: 1707,
    description:
      'The English and Scottish parliaments voted themselves into a single Kingdom of Great Britain with one parliament at Westminster.',
    // Illuminated title page of the 1707 Articles of Union, Parliamentary Archives — PD.
    commons: 'Articles of Union between England and Scotland 28 Jan 1707.png',
  },
  {
    name: 'Battle of Poltava',
    country: 'UA',
    kind: 'conflict',
    year: 1709,
    description:
      "Peter the Great destroyed Charles XII's invading Swedish army deep in Ukraine. Sweden's run as a great power ended on that field; Russia's began.",
  },
  {
    name: '1755 Lisbon earthquake',
    country: 'PT',
    kind: 'disaster',
    year: 1755,
    description:
      "An earthquake, tsunami and days of fire destroyed most of Lisbon on All Saints' Day. The catastrophe shook European philosophy — Voltaire wrote Candide in its shadow.",
  },
  {
    name: 'Battle of Plassey',
    title: 'The East India Company takes Bengal',
    country: 'IN',
    kind: 'conflict',
    year: 1757,
    description:
      "Robert Clive's small Company army — helped by a bought-off commander — defeated the Nawab of Bengal at Plassey. A trading company began ruling the richest province in India.",
  },

  // --- Age of revolutions ----------------------------------------------------
  {
    name: 'Boston Tea Party',
    country: 'US',
    kind: 'revolution',
    year: 1773,
    description:
      "Colonists disguised as Mohawks dumped 342 chests of East India Company tea into Boston Harbor rather than pay Parliament's tax on it. Britain's crackdown pushed the colonies toward war.",
  },
  {
    name: 'United States Declaration of Independence',
    country: 'US',
    kind: 'nation',
    year: 1776,
    description:
      'Thirteen British colonies declared themselves free and independent states, resting the claim on the self-evident truth that all men are created equal.',
  },
  {
    // The First Fleet item is undated; Sydney's inception carries the year.
    name: 'Sydney',
    title: 'The First Fleet reaches Australia',
    country: 'AU',
    kind: 'nation',
    year: 1788,
    qid: 'Q3130',
    description:
      'Eleven British ships carrying around 1,400 people — most of them convicts — anchored at Sydney Cove to found a penal colony, beginning the European settlement of Australia.',
  },
  {
    name: 'Storming of the Bastille',
    country: 'FR',
    kind: 'revolution',
    year: 1789,
    description:
      "A Paris crowd stormed the royal fortress-prison of the Bastille, found just seven prisoners, and started the French Revolution anyway. July 14 is still France's national day.",
  },
  {
    name: 'Haitian Revolution',
    country: 'HT',
    kind: 'revolution',
    year: 1791,
    description:
      "The enslaved people of France's richest colony rose, defeated their enslavers and the armies of three empires, and by 1804 had founded Haiti — history's only successful slave revolution to birth a state.",
  },
  {
    name: 'Rosetta Stone',
    title: 'The Rosetta Stone is found',
    country: 'EG',
    kind: 'science',
    year: 1799,
    description:
      'French soldiers rebuilding a fort in the Nile Delta dug up a slab carrying the same decree in three scripts. It became the key that unlocked Egyptian hieroglyphs.',
  },
  {
    name: 'Coronation of Napoleon I',
    title: 'Napoleon crowns himself emperor',
    country: 'FR',
    kind: 'politics',
    year: 1804,
    description:
      'In Notre-Dame, with the Pope watching, Napoleon took the crown and set it on his own head. The republic born of the Revolution had become an empire.',
  },
  {
    name: 'Battle of Trafalgar',
    country: 'GB',
    kind: 'conflict',
    year: 1805,
    description:
      'Nelson destroyed the combined French and Spanish fleets off Cape Trafalgar and died aboard Victory in the doing. Britain ruled the waves for the next century.',
  },
  {
    name: 'Slave Trade Act 1807',
    title: 'Britain abolishes the slave trade',
    country: 'GB',
    kind: 'politics',
    year: 1807,
    description:
      'Parliament outlawed the Atlantic slave trade across the British Empire, and the Royal Navy began intercepting slave ships. Slavery itself in the colonies lasted until 1833.',
  },
  {
    name: 'French invasion of Russia',
    title: 'Napoleon marches on Moscow',
    country: 'RU',
    kind: 'conflict',
    year: 1812,
    description:
      'Napoleon led some 600,000 men into Russia and reached a burning, empty Moscow. Winter, hunger and Cossacks destroyed the Grande Armée on the way home — a tenth of it returned.',
  },
  {
    name: 'Battle of Waterloo',
    country: 'BE',
    kind: 'conflict',
    year: 1815,
    description:
      'Escaped from Elba, Napoleon gambled everything on one battle in Belgium and lost it to Wellington and Blücher. He spent his last six years on Saint Helena in the South Atlantic.',
  },
  {
    name: 'Congress of Vienna',
    country: 'AT',
    kind: 'politics',
    year: 1815,
    description:
      "Europe's powers redrew the map after Napoleon, restoring monarchs and balancing power. The settlement kept the continent free of a general war for nearly a century.",
  },
  {
    name: 'Argentine Declaration of Independence',
    country: 'AR',
    kind: 'nation',
    year: 1816,
    description:
      'Delegates meeting in Tucumán declared the Provinces of the Río de la Plata independent of Spain, formalising a revolution that had been fighting since 1810.',
  },
  {
    name: 'Battle of Boyacá',
    title: 'Bolívar frees New Granada',
    country: 'CO',
    kind: 'revolution',
    year: 1819,
    description:
      'Simón Bolívar surprised the Spanish after a brutal march over the Andes and broke their army at Boyacá, freeing Bogotá. Gran Colombia was proclaimed months later.',
  },
  {
    name: 'Greek War of Independence',
    country: 'GR',
    kind: 'revolution',
    year: 1821,
    description:
      "Greece rose against four centuries of Ottoman rule. Europe's romantics rallied to the cause — Lord Byron died for it — and an independent Greek state emerged within a decade.",
  },
  {
    name: 'Mexican War of Independence',
    title: 'Mexico wins independence',
    country: 'MX',
    kind: 'nation',
    year: 1821,
    description:
      "Eleven years after the priest Hidalgo's dawn call to revolt, the Army of the Three Guarantees rode into Mexico City and New Spain became independent Mexico.",
  },
  {
    name: 'Independence of Brazil',
    country: 'BR',
    kind: 'nation',
    year: 1822,
    description:
      'The Portuguese crown prince Pedro, ruling from Rio, declared "Independence or death!" on the banks of the Ipiranga and became Brazil\'s first emperor — independence via the royal family itself.',
  },
  {
    name: 'Battle of Ayacucho',
    title: 'Spanish rule in South America ends',
    country: 'PE',
    kind: 'revolution',
    year: 1824,
    description:
      "Sucre's patriot army defeated the last Spanish royalist force in the Peruvian highlands at Ayacucho, sealing the independence of Spanish South America.",
  },
  {
    name: 'Stockton and Darlington Railway',
    title: 'The first public steam railway opens',
    country: 'GB',
    kind: 'engineering',
    year: 1825,
    description:
      'The Stockton and Darlington in northern England became the first public railway worked by steam locomotives. Within a generation, railways had shrunk the world.',
  },
  {
    name: 'Belgian Revolution',
    title: 'Belgium breaks away',
    country: 'BE',
    kind: 'nation',
    year: 1830,
    description:
      'A revolt that began after an opera performance in Brussels drove out the Dutch and created an independent, neutral Belgium with its own king.',
  },
  {
    name: 'Slavery Abolition Act 1833',
    title: 'Britain abolishes slavery',
    country: 'GB',
    kind: 'politics',
    year: 1833,
    description:
      'Parliament abolished slavery across most of the British Empire, freeing some 800,000 people — while paying slave-owners, not the enslaved, £20 million in compensation.',
  },
  {
    name: 'First Opium War',
    country: 'CN',
    kind: 'conflict',
    year: 1839,
    description:
      "China's destruction of British opium stocks brought gunboats. Defeat forced open treaty ports and ceded Hong Kong — the start of what China calls its century of humiliation.",
  },
  {
    name: 'Treaty of Waitangi',
    country: 'NZ',
    kind: 'politics',
    year: 1840,
    description:
      "British officials and some 540 Māori chiefs signed New Zealand's founding document. Its English and Māori texts differ on the crucial word — sovereignty — and the argument continues today.",
  },
  {
    name: 'Great Famine (Ireland)',
    title: 'The Great Famine strikes Ireland',
    country: 'IE',
    kind: 'disaster',
    year: 1845,
    description:
      "Potato blight destroyed the crop that fed Ireland's poor. A million people died and over a million emigrated while food exports continued — the island's population has never recovered.",
  },
  {
    name: 'Liberian Declaration of Independence',
    title: 'Liberia declares independence',
    country: 'LR',
    kind: 'nation',
    year: 1847,
    description:
      "The West African colony founded for freed Black Americans declared itself a republic — Africa's first — with a constitution and flag modelled on the United States.",
  },
  {
    name: 'Revolutions of 1848',
    title: 'Revolutions sweep Europe',
    country: 'FR',
    kind: 'revolution',
    year: 1848,
    description:
      'Uprisings toppled the French king and shook thrones from Berlin to Vienna to Palermo in the most widespread revolutionary wave Europe has seen. Nearly all were crushed within a year.',
  },
  {
    name: 'The Communist Manifesto',
    country: 'GB',
    kind: 'culture',
    year: 1848,
    description:
      'Marx and Engels published their pamphlet in London weeks before revolution swept Europe. "Workers of the world, unite!" went on to reorganise half the planet.',
  },
  {
    name: 'Taiping Rebellion',
    country: 'CN',
    kind: 'revolution',
    year: 1850,
    description:
      'A failed exam candidate who believed himself the younger brother of Jesus raised a rebel Heavenly Kingdom against the Qing. The fourteen-year civil war killed some twenty million people.',
  },
  {
    name: 'Great Exhibition',
    title: 'The Great Exhibition opens in the Crystal Palace',
    country: 'GB',
    kind: 'culture',
    year: 1851,
    description:
      "The first world's fair filled a vast prefabricated glass hall in Hyde Park with the machines and goods of the industrial age. Six million people came — a third of Britain's population.",
  },
  {
    name: 'Crimean War',
    country: 'UA',
    kind: 'conflict',
    year: 1853,
    description:
      "Britain, France and the Ottomans fought Russia, mostly on the Crimean peninsula. It gave the world the Charge of the Light Brigade, war photography and Florence Nightingale's nursing reforms.",
  },
  {
    name: 'Indian Rebellion of 1857',
    country: 'IN',
    kind: 'revolution',
    year: 1857,
    description:
      'Sepoy regiments rose against the East India Company and the revolt spread across northern India. After its brutal suppression, the British Crown took direct rule of India from the Company.',
  },
  {
    name: 'On the Origin of Species',
    title: 'Darwin publishes On the Origin of Species',
    country: 'GB',
    kind: 'science',
    year: 1859,
    description:
      "Darwin's book laid out evolution by natural selection after twenty years of hesitation. The first print run sold out to booksellers on day one.",
  },
  {
    name: 'Kingdom of Italy',
    title: 'Italy is unified',
    country: 'IT',
    kind: 'nation',
    year: 1861,
    description:
      "After Garibaldi's thousand red-shirted volunteers took the south, the Kingdom of Italy was proclaimed under Victor Emmanuel II — the peninsula's first single state since Rome. Venice and Rome itself joined within a decade.",
  },
  {
    name: 'American Civil War',
    country: 'US',
    kind: 'conflict',
    year: 1861,
    description:
      'Eleven slave states seceded and the Union fought them back over four years — the deadliest war in American history. It ended slavery by the Thirteenth Amendment.',
  },
  {
    name: 'Emancipation reform of 1861',
    title: 'Russia frees the serfs',
    country: 'RU',
    kind: 'politics',
    year: 1861,
    description:
      'Tsar Alexander II emancipated more than twenty million serfs — bound peasants who could be bought and sold with the land. Freedom came with debts that kept most of them poor.',
  },
  {
    name: 'International Committee of the Red Cross',
    title: 'The Red Cross is founded',
    country: 'CH',
    kind: 'politics',
    year: 1863,
    description:
      'Horrified by the untended wounded at Solferino, the Geneva businessman Henry Dunant founded the Red Cross. The first Geneva Convention followed a year later.',
  },
  {
    name: 'Alaska Purchase',
    title: 'The United States buys Alaska',
    country: 'US',
    kind: 'politics',
    year: 1867,
    description:
      'Russia sold Alaska to the United States for $7.2 million — about two cents an acre. Critics called it "Seward\'s Folly" until the gold and oil turned up.',
  },
  {
    name: 'Canadian Confederation',
    country: 'CA',
    kind: 'nation',
    year: 1867,
    description:
      'Three British North American colonies federated into the Dominion of Canada — a country assembled by conference and statute rather than revolution.',
  },
  {
    name: 'Meiji Restoration',
    country: 'JP',
    kind: 'revolution',
    year: 1868,
    description:
      'Samurai from the southwest toppled the shogunate and restored the young Meiji emperor. Japan then industrialised at a sprint, going from feudal isolation to great power in one generation.',
  },
  {
    name: 'Suez Canal',
    title: 'The Suez Canal opens',
    country: 'EG',
    kind: 'engineering',
    year: 1869,
    description:
      "Ten years of digging joined the Mediterranean to the Red Sea, cutting the Europe–Asia voyage by weeks. Verdi's Aida was commissioned for the Cairo opera house that opened alongside it.",
  },
  {
    name: 'First transcontinental railroad',
    title: "America's coasts are joined by rail",
    country: 'US',
    kind: 'engineering',
    year: 1869,
    description:
      'A golden spike at Promontory Summit, Utah joined the tracks built east from Sacramento and west from Omaha. A months-long wagon crossing became a week by train.',
  },
  {
    name: 'Paris Commune',
    country: 'FR',
    kind: 'revolution',
    year: 1871,
    description:
      "After France's defeat by Prussia, Paris rose and governed itself as a radical commune for 72 days before the army retook the city street by street, killing thousands in Bloody Week.",
  },
  {
    name: 'Unification of Germany',
    title: 'Germany is unified',
    country: 'DE',
    kind: 'nation',
    year: 1871,
    description:
      "After Prussia's victory over France, the German Empire was proclaimed — pointedly — in the Hall of Mirrors at Versailles, with the Prussian king as Kaiser and Bismarck as chancellor.",
  },
  {
    name: 'Berlin Conference',
    title: 'Europe carves up Africa',
    country: 'DE',
    kind: 'politics',
    year: 1884,
    description:
      'European powers met in Berlin to set the rules for claiming African territory — no African was at the table. Within two decades the continent was almost entirely colonised.',
  },
  {
    name: '1883 eruption of Krakatoa',
    country: 'ID',
    kind: 'disaster',
    year: 1883,
    description:
      'The island volcano between Java and Sumatra blew itself apart with a blast heard 4,800 kilometres away. Its tsunamis killed tens of thousands, and its dust reddened sunsets worldwide for years.',
  },
  {
    name: 'Statue of Liberty',
    title: 'The Statue of Liberty is dedicated',
    country: 'US',
    kind: 'engineering',
    year: 1886,
    description:
      "France's copper colossus — designed by Bartholdi, engineered inside by Eiffel — was unveiled in New York Harbor, greeting the greatest wave of immigration in American history.",
  },
  {
    name: 'Lei Áurea',
    title: 'Brazil abolishes slavery',
    country: 'BR',
    kind: 'politics',
    year: 1888,
    description:
      "Princess Isabel signed the Golden Law, freeing Brazil's remaining enslaved people with a single sentence. Brazil was the last country in the Americas to abolish slavery.",
  },
  {
    name: 'Eiffel Tower',
    title: 'The Eiffel Tower opens',
    country: 'FR',
    kind: 'engineering',
    year: 1889,
    description:
      "Built as the entrance arch to the 1889 World's Fair and meant to stand twenty years, it was then the tallest structure on Earth. Paris's artists petitioned furiously against it.",
  },
  {
    name: 'Battle of Adwa',
    title: 'Ethiopia defeats an invading empire',
    country: 'ET',
    kind: 'conflict',
    year: 1896,
    description:
      "Emperor Menelik II's army routed the invading Italians at Adwa. Ethiopia became the great exception of the colonial age — an African state that beat a European power and kept its independence.",
  },
  {
    name: '1896 Summer Olympics',
    title: 'The first modern Olympics',
    country: 'GR',
    kind: 'culture',
    year: 1896,
    description:
      'The Olympic Games returned after fifteen centuries, staged in Athens with 14 nations. A Greek water-carrier, Spyridon Louis, won the first marathon and became a national hero.',
  },
  {
    name: 'Klondike Gold Rush',
    country: 'CA',
    kind: 'culture',
    year: 1896,
    description:
      'Gold found in a Yukon creek sent a hundred thousand stampeders over frozen mountain passes toward Dawson City. Most arrived to find the good claims long staked.',
  },
  {
    name: 'Spanish–American War',
    country: 'CU',
    kind: 'conflict',
    year: 1898,
    description:
      "A ten-week war fought over Cuba ended Spain's empire in the Americas and the Pacific. The United States emerged with Puerto Rico, Guam and the Philippines — a colonial power itself.",
  },
  {
    name: 'Second Boer War',
    country: 'ZA',
    kind: 'conflict',
    year: 1899,
    description:
      'Britain fought the Boer republics for three years over southern Africa and its gold. The war introduced the world to the term "concentration camp", where tens of thousands died.',
  },
  {
    name: 'Boxer Rebellion',
    country: 'CN',
    kind: 'revolution',
    year: 1900,
    description:
      "An anti-foreign uprising besieged Beijing's diplomatic quarter for 55 days until an eight-nation army marched on the capital. The indemnities imposed helped bring down the Qing a decade later.",
  },

  // --- Turn of the century to WWI --------------------------------------------
  {
    name: 'Federation of Australia',
    country: 'AU',
    kind: 'nation',
    year: 1901,
    description:
      'Six self-governing British colonies federated into the Commonwealth of Australia on the first day of the new century — nationhood by referendum rather than revolution.',
  },
  {
    name: 'Nobel Prize',
    title: 'The first Nobel Prizes are awarded',
    country: 'SE',
    kind: 'culture',
    year: 1901,
    description:
      'The fortune of Alfred Nobel — the inventor of dynamite — funded the first prizes for physics, chemistry, medicine, literature and peace, awarded in Stockholm and Oslo.',
  },
  {
    name: 'Wright Flyer',
    title: 'The Wright brothers fly',
    country: 'US',
    kind: 'science',
    year: 1903,
    description:
      "On a North Carolina beach, the Wright brothers made the first controlled, powered aeroplane flights. The longest of the day covered 260 metres — less than a modern jet's wingspan-to-tail walk.",
  },
  {
    name: 'Russo-Japanese War',
    country: 'JP',
    kind: 'conflict',
    year: 1904,
    description:
      'Japan fought Russia over Korea and Manchuria and won on land and at sea, annihilating the Baltic Fleet at Tsushima — the first modern defeat of a European great power by an Asian one.',
  },
  {
    name: 'Dissolution of the union between Norway and Sweden',
    title: 'Norway leaves its union with Sweden',
    country: 'NO',
    kind: 'nation',
    year: 1905,
    description:
      'Norway voted itself out of the union with Sweden — 368,208 for, 184 against — and both sides let it happen peacefully. A Danish prince became King Haakon VII.',
  },
  {
    name: '1906 San Francisco earthquake',
    country: 'US',
    kind: 'disaster',
    year: 1906,
    description:
      "The earthquake and the three days of fire that followed destroyed most of San Francisco, leaving over half the city's population homeless.",
  },
  {
    name: 'Young Turk Revolution',
    country: 'TR',
    kind: 'revolution',
    year: 1908,
    description:
      "Army officers of the Young Turk movement forced the sultan to restore the constitution and parliament, beginning the Ottoman Empire's last, turbulent decade.",
  },
  {
    name: 'Mexican Revolution',
    country: 'MX',
    kind: 'revolution',
    year: 1910,
    description:
      'What began as a revolt against the thirty-year rule of Porfirio Díaz became a decade of civil war — Zapata and Villa among its generals — that killed perhaps a million Mexicans.',
  },
  {
    name: "Amundsen's South Pole expedition",
    title: 'Amundsen reaches the South Pole',
    country: 'NO',
    kind: 'science',
    year: 1911,
    description:
      "Roald Amundsen's ski-and-dog-sled team reached the South Pole five weeks ahead of Robert Scott, whose entire party died on the return march.",
  },
  {
    name: 'Xinhai Revolution',
    title: "China's last dynasty falls",
    country: 'CN',
    kind: 'revolution',
    year: 1911,
    description:
      'A mutiny at Wuchang cascaded into national revolution, and within months the six-year-old Puyi abdicated. Two thousand years of imperial rule ended; the Republic of China began.',
  },
  {
    name: 'Sinking of the Titanic',
    country: 'GB',
    kind: 'disaster',
    year: 1912,
    description:
      'The largest ship afloat, promoted as practically unsinkable, struck an iceberg on her maiden voyage and sank with around 1,500 people — lifeboats had seats for barely half of those aboard.',
  },
  {
    name: 'Panama Canal',
    title: 'The Panama Canal opens',
    country: 'PA',
    kind: 'engineering',
    year: 1914,
    description:
      'The canal cut through the isthmus joined the Atlantic and Pacific, sparing ships the 13,000-kilometre voyage around Cape Horn. France had tried first and lost some 20,000 workers to disease.',
  },
  {
    name: 'Assassination of Archduke Franz Ferdinand',
    title: 'Shots at Sarajevo — the spark of WWI',
    country: 'BA',
    kind: 'conflict',
    year: 1914,
    description:
      'A Bosnian Serb student shot the Austro-Hungarian heir and his wife in Sarajevo. Five weeks of ultimatums and mobilisations later, most of Europe was at war.',
  },
  {
    name: 'Gallipoli campaign',
    country: 'TR',
    kind: 'conflict',
    year: 1915,
    description:
      "The Allied attempt to force the Dardanelles and take Constantinople died on the Gallipoli beaches. The defence made Mustafa Kemal's name; the landings are founding memory for Australia and New Zealand.",
  },
  {
    name: 'Armenian genocide',
    country: 'AM',
    kind: 'conflict',
    year: 1915,
    description:
      'The Ottoman government deported the empire\'s Armenians into the Syrian desert through massacre and death march, killing perhaps a million or more. The word "genocide" was later coined largely for it.',
  },
  {
    name: 'Easter Rising',
    country: 'IE',
    kind: 'revolution',
    year: 1916,
    description:
      'Irish republicans seized central Dublin and proclaimed a republic from the General Post Office. The rising was crushed in six days, but the execution of its leaders turned the country against British rule.',
  },
  {
    name: 'October Revolution',
    country: 'RU',
    kind: 'revolution',
    year: 1917,
    description:
      "Lenin's Bolsheviks seized Petrograd's key points and the Winter Palace in a nearly bloodless coup, eight months after the tsar had fallen. The world's first communist state followed.",
  },
  {
    name: 'Finnish Declaration of Independence',
    title: 'Finland declares independence',
    country: 'FI',
    kind: 'nation',
    year: 1917,
    description:
      "As revolutionary Russia collapsed, Finland's parliament declared independence after a century as a Russian grand duchy — recognised, remarkably, by Lenin's new government within a month.",
  },
  {
    name: 'Armistice of 11 November 1918',
    title: 'The Armistice ends the First World War',
    country: 'FR',
    kind: 'conflict',
    year: 1918,
    description:
      'In a railway carriage in the forest of Compiègne, the guns of the First World War fell silent at the eleventh hour of the eleventh day of the eleventh month. Some 17 million people were dead.',
  },
  {
    name: 'Spanish flu',
    title: 'The 1918 flu pandemic',
    country: 'US',
    kind: 'disaster',
    year: 1918,
    description:
      'The influenza pandemic of 1918 infected a third of humanity and killed at least 50 million — more than the war it rode in on. It was called "Spanish" only because Spain\'s uncensored press reported it first.',
  },
  {
    name: 'Treaty of Versailles',
    country: 'FR',
    kind: 'politics',
    year: 1919,
    description:
      'The peace signed in the Hall of Mirrors stripped Germany of territory and empire and billed it for the war. Its "war guilt" terms became tinder for the next one.',
  },
  {
    name: 'Jallianwala Bagh massacre',
    country: 'IN',
    kind: 'conflict',
    year: 1919,
    description:
      'British troops fired without warning into a trapped crowd in a walled garden in Amritsar, killing hundreds. The massacre broke Indian faith in the empire and swelled the independence movement.',
  },
  {
    name: 'League of Nations',
    title: 'The League of Nations convenes',
    country: 'CH',
    kind: 'politics',
    year: 1920,
    description:
      'The first world organisation for collective security assembled in Geneva — without the United States, whose Senate refused to join the body its own president had championed.',
  },
  {
    name: 'Anglo-Irish Treaty',
    title: 'The Irish Free State is born',
    country: 'IE',
    kind: 'nation',
    year: 1921,
    description:
      'The treaty ending the Irish War of Independence created a self-governing Free State of 26 counties, with six remaining British. The split over its terms led straight into civil war.',
  },
  {
    name: 'March on Rome',
    title: 'Mussolini takes power',
    country: 'IT',
    kind: 'revolution',
    year: 1922,
    description:
      "Mussolini's blackshirts converged on the capital and the king, rather than order the army to stop them, invited the Fascist leader to form a government. Europe had its first fascist state.",
  },
  {
    name: 'Tomb of Tutankhamun',
    title: "Tutankhamun's tomb is opened",
    country: 'EG',
    kind: 'science',
    year: 1922,
    description:
      'Howard Carter found the one royal tomb in the Valley of the Kings that robbers had barely touched. Asked if he could see anything through the breach, he answered: "Yes, wonderful things."',
  },
  {
    name: 'Soviet Union',
    title: 'The Soviet Union is formed',
    country: 'RU',
    kind: 'nation',
    year: 1922,
    description:
      'Russia, Ukraine, Belarus and the Transcaucasus signed themselves into the Union of Soviet Socialist Republics — on paper a federation, in practice ruled from Moscow. It lasted 69 years.',
  },
  {
    name: '1923 Great Kantō earthquake',
    country: 'JP',
    kind: 'disaster',
    year: 1923,
    description:
      "The earthquake and firestorms that followed destroyed Tokyo and Yokohama, killing over 100,000 people — Japan's deadliest disaster, struck at lunchtime while the city's stoves were lit.",
  },
  {
    name: 'Republic of Türkiye',
    title: 'Atatürk proclaims the Turkish republic',
    country: 'TR',
    kind: 'nation',
    year: 1923,
    description:
      'From the Ottoman Empire\'s ruins, Mustafa Kemal — later Atatürk, "father of the Turks" — proclaimed a republic with its capital at Ankara, then remade alphabet, dress and law at speed.',
  },
  {
    name: 'Discovery of penicillin',
    title: 'Fleming discovers penicillin',
    country: 'GB',
    kind: 'science',
    year: 1928,
    // The penicillin item itself holds the discovery date (P575).
    qid: 'Q12190',
    description:
      'Alexander Fleming returned from holiday to find mould killing the bacteria on a neglected culture plate. The antibiotic age it opened has saved hundreds of millions of lives.',
  },
  {
    name: 'Wall Street Crash of 1929',
    country: 'US',
    kind: 'disaster',
    year: 1929,
    description:
      'The New York stock market collapsed over a handful of October days, erasing fortunes and confidence together. The Great Depression that followed put a quarter of Americans out of work.',
  },

  // --- The thirties and WWII --------------------------------------------------
  {
    name: 'Salt March',
    title: 'Gandhi marches to the sea for salt',
    country: 'IN',
    kind: 'revolution',
    year: 1930,
    description:
      'Gandhi walked 385 kilometres to the sea and picked up a handful of salt, breaking the British monopoly law. The gesture ignited mass civil disobedience across India.',
  },
  {
    name: '1930 FIFA World Cup',
    title: 'The first football World Cup',
    country: 'UY',
    kind: 'culture',
    year: 1930,
    description:
      'Uruguay hosted and won the first World Cup, beating Argentina 4–2 in Montevideo. Only thirteen teams came — every European entrant had to be talked into the boat journey.',
  },
  {
    name: 'Empire State Building',
    title: 'The Empire State Building opens',
    country: 'US',
    kind: 'engineering',
    year: 1931,
    description:
      "Built in a Depression-defying 13 months, the 102-storey tower took the title of world's tallest building and held it for four decades.",
  },
  {
    name: 'Siamese revolution of 1932',
    title: 'Siam ends absolute monarchy',
    country: 'TH',
    kind: 'revolution',
    year: 1932,
    description:
      'A bloodless dawn coup by young officers and officials ended seven centuries of absolute monarchy in Siam, forcing the king to accept a constitution.',
  },
  {
    name: 'Machtergreifung',
    title: 'Hitler comes to power',
    country: 'DE',
    kind: 'revolution',
    year: 1933,
    description:
      'Hitler was appointed chancellor by President Hindenburg, and within months the Nazis had burned out the Reichstag opposition, banned rival parties and ruled by decree.',
  },
  {
    name: 'Long March',
    country: 'CN',
    kind: 'conflict',
    year: 1934,
    description:
      "Encircled by Nationalist armies, the Chinese communists broke out and marched thousands of kilometres over mountains and rivers to a new base at Yan'an. Mao emerged from it as the party's leader.",
  },
  {
    name: 'Second Italo-Ethiopian War',
    title: 'Italy invades Ethiopia',
    country: 'ET',
    kind: 'conflict',
    year: 1935,
    description:
      "Mussolini invaded Ethiopia with tanks, bombers and poison gas, avenging Adwa forty years on. The League of Nations' failure to stop it exposed collective security as a dead letter.",
  },
  {
    name: 'Spanish Civil War',
    country: 'ES',
    kind: 'conflict',
    year: 1936,
    description:
      "A generals' rising against the republic tore Spain apart for three years, with Hitler and Mussolini arming Franco and volunteers from fifty countries fighting for the other side. Franco's dictatorship lasted until 1975.",
  },
  {
    name: 'Golden Gate Bridge',
    title: 'The Golden Gate Bridge opens',
    country: 'US',
    kind: 'engineering',
    year: 1937,
    description:
      'The longest suspension span yet built crossed the fog-swept strait at the mouth of San Francisco Bay. Its "international orange" paint was meant to be temporary.',
  },
  {
    name: 'Hindenburg disaster',
    country: 'US',
    kind: 'disaster',
    year: 1937,
    description:
      'The hydrogen-filled German airship burst into flames while landing in New Jersey, killing 36 — with newsreel cameras rolling. The age of the great passenger airships ended in that minute.',
  },
  {
    name: 'Nanjing Massacre',
    country: 'CN',
    kind: 'conflict',
    year: 1937,
    description:
      "After the fall of China's capital, Japanese troops spent weeks massacring prisoners and civilians and raping tens of thousands. The death toll is contested; the horror is not.",
  },
  {
    name: 'Kristallnacht',
    country: 'DE',
    kind: 'conflict',
    year: 1938,
    description:
      'In a single organised November night, Nazi mobs burned over a thousand synagogues and smashed Jewish shops and homes across Germany and Austria. The name mocks the broken glass in the streets.',
  },
  {
    name: 'Invasion of Poland',
    title: 'The Second World War begins',
    country: 'PL',
    kind: 'conflict',
    year: 1939,
    description:
      'Germany invaded Poland from the west; the Soviet Union followed from the east under their secret pact. Britain and France declared war on Germany two days in — the Second World War had begun.',
  },
  {
    name: 'Battle of Britain',
    country: 'GB',
    kind: 'conflict',
    year: 1940,
    description:
      'The Luftwaffe spent a summer trying to break the RAF as the prelude to invasion, and failed — the war\'s first check on Germany. "Never was so much owed by so many to so few."',
  },
  {
    name: 'Attack on Pearl Harbor',
    country: 'US',
    kind: 'conflict',
    year: 1941,
    description:
      'Japanese carrier aircraft struck the US Pacific Fleet at anchor in Hawaii on a Sunday morning, sinking battleships and killing over 2,400 Americans. The United States entered the war the next day.',
  },
  {
    name: 'Battle of Stalingrad',
    country: 'RU',
    kind: 'conflict',
    year: 1942,
    description:
      'The Wehrmacht bled out in five months of street fighting on the Volga, and the encircled Sixth Army surrendered in the ruins. It was the turning point of the war in Europe.',
  },
  {
    name: 'Normandy landings',
    title: 'D-Day — the Allies land in Normandy',
    country: 'FR',
    kind: 'conflict',
    year: 1944,
    description:
      "On 6 June 1944, some 156,000 Allied troops crossed the Channel onto five Normandy beaches in history's largest seaborne invasion. Paris was free by August.",
  },
  {
    name: 'Bretton Woods Conference',
    country: 'US',
    kind: 'politics',
    year: 1944,
    description:
      'Delegates from 44 Allied nations, meeting at a New Hampshire resort hotel, designed the postwar money system — fixed exchange rates, the IMF and the World Bank.',
  },
  {
    name: 'Iceland',
    title: 'Iceland becomes a republic',
    country: 'IS',
    kind: 'nation',
    year: 1944,
    description:
      'With Denmark under German occupation, Icelanders voted almost unanimously to dissolve the union with the Danish crown and founded a republic at Þingvellir, seat of their thousand-year-old assembly.',
  },
  {
    name: 'Atomic bombings of Hiroshima and Nagasaki',
    title: 'Atomic bombs fall on Japan',
    country: 'JP',
    kind: 'conflict',
    year: 1945,
    description:
      "The first nuclear weapons used in war destroyed Hiroshima and, three days later, Nagasaki, killing well over a hundred thousand people by year's end. Japan surrendered within a week of the second bomb.",
  },
  {
    name: 'United Nations',
    title: 'The United Nations is founded',
    country: 'US',
    kind: 'politics',
    year: 1945,
    description:
      'Fifty-one nations signed the UN Charter in San Francisco, determined — its opening words say — "to save succeeding generations from the scourge of war".',
  },
  {
    name: 'Nuremberg trials',
    country: 'DE',
    kind: 'politics',
    year: 1945,
    description:
      'The surviving Nazi leadership was tried by an international tribunal in Nuremberg for crimes against humanity — the founding precedent that following orders is no defence.',
  },
  {
    name: 'Treaty of Manila (1946)',
    title: 'The Philippines becomes independent',
    country: 'PH',
    kind: 'nation',
    year: 1946,
    description:
      'The United States recognised Philippine independence on 4 July 1946, closing nearly half a century of American rule that had followed three centuries of Spanish rule.',
  },
  {
    name: 'Partition of India',
    title: 'India and Pakistan are born',
    country: 'IN',
    kind: 'nation',
    year: 1947,
    description:
      'British India was split at midnight into independent India and Pakistan. The partition uprooted some 15 million people along hastily drawn lines and killed perhaps a million in the violence.',
  },
  {
    name: 'Marshall Plan',
    country: 'US',
    kind: 'politics',
    year: 1948,
    description:
      "The United States poured about $13 billion into rebuilding Western Europe's shattered economies — and binding them to the West as the Cold War hardened.",
  },
  {
    name: 'Assassination of Mahatma Gandhi',
    country: 'IN',
    kind: 'politics',
    year: 1948,
    description:
      'Five months into independence, Gandhi was shot dead at his evening prayer meeting in Delhi by a Hindu nationalist who blamed him for partition and for conciliating Muslims.',
  },
  {
    name: 'Israeli Declaration of Independence',
    title: 'The State of Israel is declared',
    country: 'IL',
    kind: 'nation',
    year: 1948,
    description:
      "David Ben-Gurion proclaimed the State of Israel in Tel Aviv as the British mandate expired. Five Arab armies crossed the borders the next day; the war's displacements shape the region still.",
  },
  {
    name: 'Berlin Blockade',
    title: 'The Berlin Airlift begins',
    country: 'DE',
    kind: 'conflict',
    year: 1948,
    description:
      'The Soviets cut every road and rail line into West Berlin, and the Western allies fed two million people by air for eleven months — a plane landing roughly every minute at the peak.',
  },
  {
    name: 'Universal Declaration of Human Rights',
    country: 'FR',
    kind: 'politics',
    year: 1948,
    description:
      'The UN General Assembly, meeting in Paris, adopted thirty articles of rights belonging to every human being — drafted by a committee chaired by Eleanor Roosevelt.',
  },
  {
    name: 'NATO',
    title: 'NATO is founded',
    country: 'US',
    kind: 'politics',
    year: 1949,
    description:
      'Twelve North Atlantic nations signed a treaty in Washington making an attack on one an attack on all. Article 5 has been invoked once — after September 11.',
  },
  {
    name: "Proclamation of the People's Republic of China",
    country: 'CN',
    kind: 'nation',
    year: 1949,
    description:
      "From the Tiananmen gate, Mao proclaimed the People's Republic after the communists' civil-war victory. The defeated Nationalists withdrew to Taiwan — both governments still claim to be China.",
  },

  // --- The fifties and sixties -------------------------------------------------
  {
    name: 'Korean War',
    country: 'KR',
    kind: 'conflict',
    year: 1950,
    description:
      'North Korea invaded the South and a UN force led by the United States fought it — and then China — to a stalemate near where the war began. An armistice, never a peace treaty, holds the line today.',
  },
  {
    name: 'Egyptian revolution of 1952',
    title: "The Free Officers topple Egypt's king",
    country: 'EG',
    kind: 'revolution',
    year: 1952,
    description:
      "Army officers led by Nasser and Naguib deposed King Farouk in a night, ending the monarchy and British-era rule. Nasser's Egypt became the pole star of Arab nationalism.",
  },
  {
    name: '1953 British Mount Everest expedition',
    title: 'Everest is climbed',
    country: 'NP',
    kind: 'science',
    year: 1953,
    description:
      'Edmund Hillary and Tenzing Norgay stood on the summit of Everest on 29 May 1953 — the first people on the highest point on Earth. News reached London on Coronation morning.',
  },
  {
    name: 'Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid',
    title: 'The DNA double helix is revealed',
    country: 'GB',
    kind: 'science',
    year: 1953,
    description:
      "Watson and Crick published DNA's double-helix structure, built on Rosalind Franklin's X-ray images. The paper's closing understatement — the structure \"suggests a possible copying mechanism\" — opened modern genetics.",
  },
  {
    name: 'Battle of Dien Bien Phu',
    title: 'France falls at Dien Bien Phu',
    country: 'VN',
    kind: 'conflict',
    year: 1954,
    description:
      'The Viet Minh dragged artillery up jungle mountains and crushed the French garrison in its valley fortress. French Indochina ended at the conference table weeks later, with Vietnam divided at the 17th parallel.',
  },
  {
    name: 'Warsaw Pact',
    country: 'PL',
    kind: 'politics',
    year: 1955,
    description:
      'The Soviet Union bound its Eastern European satellites into a military alliance answering NATO. Its only joint invasion was of one of its own members — Czechoslovakia, 1968.',
  },
  {
    name: 'Montgomery bus boycott',
    title: 'Rosa Parks keeps her seat',
    country: 'US',
    kind: 'culture',
    year: 1955,
    description:
      "Rosa Parks was arrested for refusing to give up her bus seat, and Black Montgomery walked for 381 days until the buses were desegregated. The boycott's young spokesman was Martin Luther King Jr.",
  },
  {
    name: 'Bandung Conference',
    country: 'ID',
    kind: 'politics',
    year: 1955,
    description:
      'Twenty-nine newly independent Asian and African states met in Bandung to chart a course between the Cold War blocs — the seedbed of the Non-Aligned Movement.',
  },
  {
    name: 'Hungarian Revolution of 1956',
    country: 'HU',
    kind: 'revolution',
    year: 1956,
    description:
      'Budapest rose against Soviet rule and for a few days Hungary was free — until the tanks returned. Thousands died and 200,000 fled west while the world watched.',
  },
  {
    name: 'Suez Crisis',
    country: 'EG',
    kind: 'conflict',
    year: 1956,
    description:
      'When Nasser nationalised the Suez Canal, Britain, France and Israel invaded — and were forced out by American and Soviet pressure. The end of empire had a date on it after Suez.',
  },
  {
    name: 'Independence of Ghana',
    title: 'Ghana leads Africa to independence',
    country: 'GH',
    kind: 'nation',
    year: 1957,
    description:
      'The Gold Coast became Ghana under Kwame Nkrumah — the first sub-Saharan colony to win independence. "Our independence is meaningless," he said that night, "unless it is linked up with the total liberation of Africa."',
    // UK National Archives (CO 1069) portrait of Nkrumah — OGL v1.0.
    commons: 'Kwame Nkrumah - The National Archives UK - CO 1069-50-1.jpg',
  },
  {
    name: 'Treaty of Rome',
    title: 'Six nations found the Common Market',
    country: 'IT',
    kind: 'politics',
    year: 1957,
    description:
      "France, West Germany, Italy and the Benelux countries signed the Treaty of Rome, creating the European Economic Community — the six-member seed of today's European Union.",
  },
  {
    name: 'Sputnik 1',
    title: 'Sputnik opens the Space Age',
    country: 'RU',
    kind: 'science',
    year: 1957,
    description:
      'The Soviet Union lofted a beeping 58-centimetre metal sphere into orbit — the first artificial satellite. Its radio signal, audible to amateurs worldwide, started the space race.',
  },
  {
    name: 'Malayan Declaration of Independence',
    title: 'Malaya becomes independent',
    country: 'MY',
    kind: 'nation',
    year: 1957,
    description:
      'At midnight in Kuala Lumpur\'s Merdeka Stadium, the Federation of Malaya became independent of Britain to shouts of "Merdeka!" — freedom. Malaysia was formed six years later.',
  },
  {
    name: 'Cuban Revolution',
    country: 'CU',
    kind: 'revolution',
    year: 1959,
    description:
      "Fidel Castro's guerrillas came down from the Sierra Maestra and took Havana on New Year's Day as Batista fled. Within two years Cuba was a communist state ninety miles from Florida.",
  },
  {
    name: 'Independence of Nigeria',
    title: 'Nigeria becomes independent',
    country: 'NG',
    kind: 'nation',
    year: 1960,
    description:
      'Africa\'s most populous country took independence from Britain in 1960 — the "Year of Africa", when seventeen African nations raised new flags.',
  },
  {
    name: 'Independence of the Democratic Republic of the Congo',
    title: 'The Congo becomes independent',
    country: 'CD',
    kind: 'nation',
    year: 1960,
    // No event item; the country's inception carries the year.
    qid: 'Q974',
    description:
      "Belgium handed over the Congo at two weeks' organised notice after decades of brutal rule. Within months the army mutinied, Katanga seceded and Prime Minister Lumumba was murdered.",
  },
  {
    name: 'Vostok 1',
    title: 'Gagarin — the first human in space',
    country: 'RU',
    kind: 'science',
    year: 1961,
    description:
      'Yuri Gagarin orbited the Earth once in 108 minutes aboard Vostok 1 and landed by parachute a national hero. He was 27, and the first human being to see the planet whole.',
  },
  {
    name: 'Berlin Wall',
    title: 'The Berlin Wall goes up',
    country: 'DE',
    kind: 'conflict',
    year: 1961,
    description:
      'East Germany sealed West Berlin overnight with barbed wire that hardened into a concrete wall, to stop the exodus of its own citizens — about one in six had already left. It stood for 28 years.',
  },
  {
    name: 'Évian Accords',
    title: 'Algeria wins independence',
    country: 'DZ',
    kind: 'nation',
    year: 1962,
    description:
      "The accords signed at Évian ended an eight-year war that had killed hundreds of thousands and brought down France's Fourth Republic. A million French settlers left Algeria within months.",
  },
  {
    name: 'Cuban Missile Crisis',
    country: 'CU',
    kind: 'conflict',
    year: 1962,
    description:
      'For thirteen October days the superpowers stood at the edge of nuclear war over Soviet missiles in Cuba, until Khrushchev withdrew them — and the US quietly pulled its own from Turkey.',
  },
  {
    name: 'Independence of Jamaica',
    title: 'Jamaica becomes independent',
    country: 'JM',
    kind: 'nation',
    year: 1962,
    description:
      'Jamaica left the failed West Indies Federation and took full independence from Britain, the first of the anglophone Caribbean islands to do so.',
  },
  {
    name: 'Organisation of African Unity',
    title: "Africa's states unite in one organisation",
    country: 'ET',
    kind: 'politics',
    year: 1963,
    description:
      'Thirty-two independent African states founded the OAU in Addis Ababa, pledging to finish decolonisation. It became the African Union in 2002, headquartered in the same city.',
  },
  {
    name: 'Assassination of John F. Kennedy',
    country: 'US',
    kind: 'politics',
    year: 1963,
    description:
      "President Kennedy was shot dead in an open car in Dallas. The murder, caught on a bystander's home-movie camera, has fed six decades of grief and conspiracy alike.",
  },
  {
    name: 'March on Washington for Jobs and Freedom',
    title: '"I Have a Dream" — the March on Washington',
    country: 'US',
    kind: 'culture',
    year: 1963,
    description:
      'A quarter of a million people filled the Mall to demand civil rights, and Martin Luther King Jr. told them his dream from the Lincoln Memorial steps. The Civil Rights Act passed the next year.',
  },
  {
    name: 'Independence of Singapore',
    title: 'Singapore goes it alone',
    country: 'SG',
    kind: 'nation',
    year: 1965,
    description:
      "Expelled from Malaysia after two years, Singapore became a sovereign city-state against its own wishes — Lee Kuan Yew wept announcing it. It became one of the world's richest places anyway.",
  },
  {
    name: 'Six-Day War',
    country: 'IL',
    kind: 'conflict',
    year: 1967,
    description:
      "Israel destroyed the Egyptian air force on the ground in the war's opening hours and in six days took Sinai, Gaza, the West Bank, East Jerusalem and the Golan — territories at the heart of the conflict since.",
  },
  {
    name: 'First heart transplant',
    title: 'The first human heart transplant',
    country: 'ZA',
    kind: 'science',
    year: 1967,
    description:
      "Christiaan Barnard's team at Cape Town's Groote Schuur Hospital transplanted a human heart for the first time. The patient lived 18 days; the operation changed what surgery believed possible.",
  },
  {
    name: 'Prague Spring',
    country: 'CZ',
    kind: 'revolution',
    year: 1968,
    description:
      'Czechoslovakia\'s reform communists promised "socialism with a human face" — until half a million Warsaw Pact troops arrived in August to shut it down. The thaw was over in a night.',
  },
  {
    name: 'Assassination of Martin Luther King Jr.',
    country: 'US',
    kind: 'politics',
    year: 1968,
    description:
      'King was shot on a Memphis motel balcony at 39, in town to support striking sanitation workers. Riots broke out in over a hundred American cities in the week that followed.',
  },
  {
    name: 'Apollo 11',
    title: 'Apollo 11 — humans walk on the Moon',
    country: 'US',
    kind: 'science',
    year: 1969,
    description:
      'Armstrong and Aldrin landed on the Sea of Tranquility with about 25 seconds of fuel to spare while some 600 million people watched. Twelve people have walked the Moon; none since 1972.',
  },
  {
    name: 'Woodstock',
    country: 'US',
    kind: 'culture',
    year: 1969,
    // Bare name search finds the town, not the festival.
    qid: 'Q164815',
    description:
      'Some 400,000 people descended on a dairy farm in upstate New York for three days of music and rain. The festival lost money, ran out of everything, and became the emblem of a generation.',
  },
  {
    name: 'Concorde',
    title: "Concorde's first flight",
    country: 'FR',
    kind: 'engineering',
    year: 1969,
    description:
      'The Anglo-French supersonic airliner flew for the first time from Toulouse. It crossed the Atlantic in under three and a half hours for 27 years — no passenger aircraft has gone supersonic since 2003.',
  },

  // --- The seventies and eighties ---------------------------------------------
  {
    name: 'Aswan Dam',
    title: 'Work begins on the Aswan High Dam',
    country: 'EG',
    kind: 'engineering',
    year: 1960,
    qid: 'Q38891',
    description:
      "Begun in 1960 and completed a decade later, the Soviet-financed dam tamed the Nile's ancient flood and lit Egypt — while drowning Nubian homelands and forcing the block-by-block rescue of the Abu Simbel temples.",
  },
  {
    name: 'Bangladesh Liberation War',
    title: 'Bangladesh is born',
    country: 'BD',
    kind: 'nation',
    year: 1971,
    description:
      "East Pakistan broke from the West in a nine-month war marked by genocide and ten million refugees. With India's intervention it ended in the birth of Bangladesh.",
  },
  {
    name: "1971 Ugandan coup d'état",
    title: 'Idi Amin seizes Uganda',
    country: 'UG',
    kind: 'revolution',
    year: 1971,
    description:
      "General Idi Amin took Uganda while the president was abroad. His eight years killed perhaps 300,000 people and expelled the country's entire Asian community on ninety days' notice.",
  },
  {
    name: 'Munich massacre',
    country: 'DE',
    kind: 'conflict',
    year: 1972,
    description:
      'Palestinian gunmen took the Israeli team hostage at the Munich Olympics; eleven athletes and coaches died, most in a botched rescue at the airport. The Games controversially went on.',
  },
  {
    name: 'Sydney Opera House',
    title: 'The Sydney Opera House opens',
    country: 'AU',
    kind: 'engineering',
    year: 1973,
    description:
      "Jørn Utzon's sail-roofed masterpiece opened ten years late and fourteen times over budget — its Danish architect had resigned and never returned to see it finished.",
  },
  {
    name: "1973 Chilean coup d'état",
    title: "Pinochet's coup in Chile",
    country: 'CL',
    kind: 'revolution',
    year: 1973,
    description:
      "The armed forces bombed the presidential palace, President Allende died there, and General Pinochet's junta ruled for 17 years — thousands were executed, tortured or disappeared.",
  },
  {
    name: '1973 oil crisis',
    country: 'SA',
    kind: 'politics',
    year: 1973,
    description:
      'Arab oil producers embargoed the West over the October war with Israel and prices quadrupled in months — queues at petrol pumps, speed limits, and the end of the postwar boom.',
  },
  {
    name: 'Carnation Revolution',
    country: 'PT',
    kind: 'revolution',
    year: 1974,
    description:
      "Junior officers toppled Europe's oldest dictatorship in a day, signalled by songs on the radio, and crowds put carnations in the soldiers' rifle barrels. Portugal's African colonies were free within two years.",
  },
  {
    name: 'Turkish invasion of Cyprus',
    title: 'Cyprus is divided',
    country: 'CY',
    kind: 'conflict',
    year: 1974,
    description:
      "After a Greek-backed coup aimed at union with Greece, Turkey invaded and took the island's north. A UN buffer zone has split Cyprus — and its capital Nicosia — ever since.",
  },
  {
    name: 'Fall of Saigon',
    title: 'The Vietnam War ends',
    country: 'VN',
    kind: 'conflict',
    year: 1975,
    description:
      "North Vietnamese tanks broke through the gates of Saigon's Presidential Palace as the last Americans left by helicopter from an embassy roof. Vietnam was reunified after thirty years of war.",
  },
  {
    name: 'Independence of Angola',
    title: 'Angola becomes independent',
    country: 'AO',
    kind: 'nation',
    year: 1975,
    description:
      "Angola took independence as Portugal's empire collapsed after the Carnation Revolution — and slid straight into a superpower-fuelled civil war that ran, with pauses, until 2002.",
  },
  {
    name: 'Death of Francisco Franco',
    title: 'Franco dies — Spain turns to democracy',
    country: 'ES',
    kind: 'politics',
    year: 1975,
    qid: 'Q51753258',
    description:
      'Franco died after 36 years of dictatorship, and the king he had groomed, Juan Carlos, steered Spain instead to parliamentary democracy within three years.',
  },
  {
    name: 'Soweto uprising',
    country: 'ZA',
    kind: 'revolution',
    year: 1976,
    description:
      "Soweto's schoolchildren marched against being taught in Afrikaans and the police opened fire. Hundreds died in the months that followed, and a generation was radicalised against apartheid.",
  },
  {
    name: '1976 Tangshan earthquake',
    country: 'CN',
    kind: 'disaster',
    year: 1976,
    description:
      'An earthquake flattened the industrial city of Tangshan before dawn, killing at least 240,000 people by official count — the deadliest earthquake of the twentieth century.',
  },
  {
    name: 'Voyager 1',
    title: 'Voyager 1 leaves for the outer planets',
    country: 'US',
    kind: 'science',
    year: 1977,
    description:
      "Launched to fly past Jupiter and Saturn, Voyager 1 kept going — now the most distant human-made object, carrying a golden record of Earth's sounds, and still calling home from interstellar space.",
  },
  {
    name: 'Camp David Accords',
    country: 'EG',
    kind: 'politics',
    year: 1978,
    description:
      'Thirteen secret days at the US presidential retreat produced a framework for peace between Egypt and Israel — the first Arab state to recognise Israel. Sadat paid for it with his life three years later.',
  },
  {
    name: 'Iranian Revolution',
    country: 'IR',
    kind: 'revolution',
    year: 1979,
    description:
      'Mass protests drove out the Shah, and Ayatollah Khomeini returned from exile to found an Islamic republic. The US embassy hostage crisis began within the year.',
  },
  {
    name: 'Soviet–Afghan War',
    title: 'The Soviets invade Afghanistan',
    country: 'AF',
    kind: 'conflict',
    year: 1979,
    description:
      'Soviet troops took Kabul in the last week of 1979 and stayed nine years, fighting US-armed mujahideen. The war helped exhaust the USSR — and seeded the conflicts that followed.',
  },
  {
    name: 'Independence of Zimbabwe',
    title: 'Zimbabwe becomes independent',
    country: 'ZW',
    kind: 'nation',
    year: 1980,
    description:
      'White-ruled Rhodesia became independent Zimbabwe after a long guerrilla war and the Lancaster House settlement. Robert Mugabe won the first elections — and held power for 37 years.',
  },
  {
    name: 'Solidarity (Polish trade union)',
    title: 'Solidarity is born in the Gdańsk shipyard',
    country: 'PL',
    kind: 'revolution',
    year: 1980,
    description:
      "Striking Gdańsk shipyard workers led by Lech Wałęsa forced the communist state to accept the Soviet bloc's first independent trade union. Ten million Poles joined within a year.",
  },
  {
    name: 'Iran–Iraq War',
    country: 'IQ',
    kind: 'conflict',
    year: 1980,
    description:
      'Saddam Hussein invaded revolutionary Iran expecting a quick win and got eight years of trench warfare, poison gas and perhaps half a million dead — borders ending where they began.',
  },
  {
    name: 'Falklands War',
    country: 'AR',
    kind: 'conflict',
    year: 1982,
    description:
      "Argentina's junta seized the Falkland Islands and Britain took them back in a ten-week war fought 13,000 kilometres from home. Defeat brought down the junta within a year.",
  },
  {
    name: 'Bhopal disaster',
    country: 'IN',
    kind: 'disaster',
    year: 1984,
    description:
      "A Union Carbide pesticide plant leaked toxic gas over sleeping Bhopal, killing thousands within days and injuring hundreds of thousands — the world's deadliest industrial disaster.",
  },
  {
    name: 'Live Aid',
    country: 'GB',
    kind: 'culture',
    year: 1985,
    description:
      "Twin concerts at Wembley and Philadelphia — sixteen hours, broadcast to well over a billion people — raised over £100 million for Ethiopia's famine. Queen's twenty minutes became rock legend.",
  },
  {
    name: '1985 Mexico City earthquake',
    country: 'MX',
    kind: 'disaster',
    year: 1985,
    description:
      'A magnitude-8 earthquake collapsed hundreds of buildings in Mexico City, killing at least ten thousand people. Citizen rescue brigades, organised where the state failed, reshaped Mexican civil society.',
  },
  {
    name: 'Chernobyl disaster',
    country: 'UA',
    kind: 'disaster',
    year: 1986,
    description:
      'Reactor 4 exploded during a botched safety test, spreading fallout across Europe while Moscow stayed silent for days. Gorbachev later called it a true cause of the Soviet collapse.',
  },
  {
    name: 'Space Shuttle Challenger disaster',
    country: 'US',
    kind: 'disaster',
    year: 1986,
    description:
      'Challenger broke apart 73 seconds after liftoff, killing all seven aboard — including the teacher Christa McAuliffe, with schoolchildren across America watching live. A frozen rubber O-ring was to blame.',
  },
  {
    name: 'People Power Revolution',
    country: 'PH',
    kind: 'revolution',
    year: 1986,
    description:
      "Millions of Filipinos filled Manila's EDSA highway, nuns kneeling in front of tanks, until Ferdinand Marcos fled after a stolen election. Corazon Aquino — a slain rival's widow — became president.",
  },

  // --- 1989 and the post-Cold-War world ----------------------------------------
  {
    name: 'World Wide Web',
    title: 'The World Wide Web is invented',
    country: 'CH',
    kind: 'science',
    year: 1989,
    description:
      'At CERN, Tim Berners-Lee proposed a hypertext system for sharing physics papers; his manager pencilled "vague, but exciting". He gave the Web away patent-free.',
    // Berners-Lee's own WorldWideWeb browser on NeXTStep — public domain.
    commons: 'WorldWideWeb.1.png',
  },
  {
    name: 'Baltic Way',
    title: 'Two million join hands across the Baltics',
    country: 'LT',
    kind: 'revolution',
    year: 1989,
    description:
      'Some two million Estonians, Latvians and Lithuanians joined hands in an unbroken 675-kilometre chain to demand independence, fifty years to the day after the pact that had handed them to Stalin.',
  },
  {
    name: '1989 Tiananmen Square protests and massacre',
    title: 'Tiananmen Square',
    country: 'CN',
    kind: 'revolution',
    year: 1989,
    description:
      'Weeks of student-led protests for reform filled Tiananmen Square until the army cleared Beijing with tanks and live fire, killing hundreds at least. The lone "Tank Man" photo endures where the count is censored.',
  },
  {
    name: 'Fall of the Berlin Wall',
    country: 'DE',
    kind: 'revolution',
    year: 1989,
    description:
      'A fumbled press conference answer — travel is free, "immediately, without delay" — sent East Berliners to the checkpoints that night, and the guards stood aside. The Cold War\'s symbol fell to hands and hammers.',
  },
  {
    name: 'Velvet Revolution',
    country: 'CZ',
    kind: 'revolution',
    year: 1989,
    description:
      "Ten days of swelling, entirely peaceful protests ended communist rule in Czechoslovakia. By the year's end the dissident playwright Václav Havel — in prison that spring — was president.",
  },
  {
    name: 'Romanian Revolution',
    country: 'RO',
    kind: 'revolution',
    year: 1989,
    description:
      "The only violent fall in Eastern Europe's year of revolutions: a week of fighting ended with the Ceaușescus tried by a drumhead court and shot on Christmas Day.",
  },
  {
    name: '1995 Rugby World Cup',
    title: 'The Rainbow Nation wins the Rugby World Cup',
    country: 'ZA',
    kind: 'culture',
    year: 1995,
    description:
      "A year into democracy, South Africa hosted the tournament and won it — and Nelson Mandela handed François Pienaar the trophy wearing the Springboks' jersey, apartheid's old symbol turned unifier.",
  },
  {
    name: 'German reunification',
    country: 'DE',
    kind: 'nation',
    year: 1990,
    description:
      "Less than a year after the Wall fell, East Germany's five states acceded to the Federal Republic and Germany was one country again — 3 October is now its national day.",
  },
  {
    name: 'Independence of Namibia',
    title: 'Namibia becomes independent',
    country: 'NA',
    kind: 'nation',
    year: 1990,
    description:
      "Africa's last colony became independent from South African rule after a decades-long liberation war and a UN-supervised transition — one of the closing acts of both empire and Cold War.",
  },
  {
    name: 'Hubble Space Telescope',
    title: 'Hubble is launched',
    country: 'US',
    kind: 'science',
    year: 1990,
    description:
      'The first great space telescope launched with a flawed mirror — corrected by spacewalking astronauts three years later. Its deep-field images showed thousands of galaxies in a patch of "empty" sky.',
  },
  {
    name: 'Gulf War',
    title: 'Iraq invades Kuwait — the Gulf War',
    country: 'KW',
    kind: 'conflict',
    year: 1990,
    description:
      'Saddam Hussein swallowed Kuwait in a day; a 35-nation coalition threw him out in a six-week air war and a hundred-hour ground campaign, watched live on satellite news.',
  },
  {
    name: 'Croatian War of Independence',
    title: 'Yugoslavia begins to break apart',
    country: 'HR',
    kind: 'conflict',
    year: 1991,
    description:
      "Croatia's declaration of independence brought war with the Yugoslav army and Serb militias — the siege of Vukovar, the shelling of Dubrovnik — as the federation tore apart piece by piece.",
  },
  {
    name: 'Dissolution of the Soviet Union',
    country: 'RU',
    kind: 'nation',
    year: 1991,
    description:
      'After a failed hardline coup, the republics walked away and Gorbachev resigned on Christmas Day as the red flag came down from the Kremlin. Fifteen states stood where the superpower had been.',
  },
  {
    name: 'Maastricht Treaty',
    title: 'The European Union is created',
    country: 'NL',
    kind: 'politics',
    year: 1992,
    description:
      'Signed in the Dutch city of Maastricht, the treaty turned the Community into the European Union, created EU citizenship and set the path to a single currency.',
  },
  {
    name: 'Dissolution of Czechoslovakia',
    title: 'The Velvet Divorce',
    country: 'SK',
    kind: 'nation',
    year: 1993,
    description:
      "Czechoslovakia split into the Czech Republic and Slovakia at midnight on New Year's Eve — negotiated by two prime ministers, without a referendum and without a shot.",
  },
  {
    name: 'Oslo I Accord',
    title: 'The Oslo Accords',
    country: 'IL',
    kind: 'politics',
    year: 1993,
    description:
      'Negotiated secretly in Norway and sealed with a Rabin–Arafat handshake on the White House lawn, the accords brought mutual recognition and Palestinian self-rule in parts of the territories — but no final peace.',
  },
  {
    name: 'Independence of Eritrea',
    title: 'Eritrea becomes independent',
    country: 'ER',
    kind: 'nation',
    year: 1993,
    description:
      "After a thirty-year war against Ethiopia — Africa's longest independence struggle — Eritreans voted almost unanimously for statehood in a UN-supervised referendum.",
  },
  {
    name: 'Rwandan genocide',
    country: 'RW',
    kind: 'conflict',
    year: 1994,
    description:
      'In roughly one hundred days, Hutu extremists murdered around 800,000 Tutsi and moderate Hutu — much of it by machete, neighbour against neighbour — while the world declined to intervene.',
  },
  {
    name: '1994 South African general election',
    title: 'Apartheid ends at the ballot box',
    country: 'ZA',
    kind: 'nation',
    year: 1994,
    description:
      'South Africans of all races voted together for the first time, queueing for hours in lines visible from the air. Nelson Mandela was inaugurated president two weeks later.',
  },
  {
    name: 'Channel Tunnel',
    title: 'The Channel Tunnel opens',
    country: 'GB',
    kind: 'engineering',
    year: 1994,
    description:
      'Two centuries after the idea was first floated, a 50-kilometre rail tunnel — 38 of them under the seabed — joined Britain to the European mainland for the first time since the Ice Age.',
  },
  {
    name: 'Dayton Agreement',
    title: 'The Bosnian War ends at Dayton',
    country: 'BA',
    kind: 'politics',
    year: 1995,
    description:
      'Three years of siege and ethnic cleansing — including genocide at Srebrenica that summer — ended with a peace hammered out at a US airbase in Ohio, freezing Bosnia into two entities under one roof.',
  },
  {
    name: 'Dolly the Sheep',
    title: 'Dolly the sheep is cloned',
    country: 'GB',
    kind: 'science',
    year: 1996,
    qid: 'Q171433',
    description:
      'Scientists near Edinburgh cloned a sheep from a single adult udder cell — the first cloned mammal, named after Dolly Parton for exactly the reason you suspect.',
  },
  {
    name: 'Handover of Hong Kong',
    country: 'CN',
    kind: 'politics',
    year: 1997,
    description:
      'Britain returned Hong Kong to China at midnight in a rain-soaked ceremony, ending 156 years of colonial rule under a promise of "one country, two systems" for fifty years.',
  },
  {
    name: '1997 Asian financial crisis',
    country: 'TH',
    kind: 'disaster',
    year: 1997,
    description:
      'Thailand\'s forced float of the baht set off a contagion that crashed currencies and economies from Jakarta to Seoul, humbling the "Asian tigers" and toppling Indonesia\'s Suharto.',
    // Suharto's resignation address, Indonesian government publication — PD.
    commons: 'Suharto resigns.jpg',
  },
  {
    name: 'Good Friday Agreement',
    country: 'GB',
    kind: 'politics',
    year: 1998,
    description:
      'Signed in Belfast on Good Friday, the agreement largely ended thirty years of the Troubles — power-sharing, paramilitary disarmament, and an open border on the island of Ireland.',
  },
  {
    name: 'International Space Station',
    title: 'The International Space Station begins',
    country: 'US',
    kind: 'science',
    year: 1998,
    description:
      'A Russian module launched from Baikonur and an American one joined it weeks later, beginning the largest structure ever assembled in space. It has been continuously inhabited since 2000.',
  },
  {
    name: 'Euro',
    title: 'The euro is born',
    country: 'DE',
    kind: 'politics',
    year: 1999,
    description:
      'Eleven EU countries locked their currencies into the euro; notes and coins followed in 2002, retiring the franc, mark, lira and peseta. It is now money for over 340 million people.',
  },
  {
    name: 'Torrijos–Carter Treaties',
    title: 'America promises the canal to Panama',
    country: 'PA',
    kind: 'politics',
    year: 1977,
    qid: 'Q277343',
    description:
      "Carter and Panama's Torrijos signed the treaties returning the canal — the handover itself came at noon on the last day of 1999, ending nearly a century of American control.",
  },

  // --- The 21st century ---------------------------------------------------------
  {
    name: 'September 11 attacks',
    country: 'US',
    kind: 'conflict',
    year: 2001,
    description:
      'Al-Qaeda hijackers flew airliners into the World Trade Center and the Pentagon, killing nearly 3,000 people. The wars that answered it ran for two decades.',
  },
  {
    name: 'Wikipedia',
    title: 'Wikipedia launches',
    country: 'US',
    kind: 'culture',
    year: 2001,
    description:
      'An encyclopedia anyone could edit sounded like a joke and became one of the most visited sites on Earth — millions of articles in hundreds of languages, written free by volunteers.',
  },
  {
    name: 'East Timor',
    title: 'East Timor becomes independent',
    country: 'TL',
    kind: 'nation',
    year: 2002,
    // The country item's inception is the 1975 proclamation; the UN
    // transitional administration's dissolution marks the 2002 restoration.
    qid: 'Q332358',
    description:
      'The first new state of the century rose from a quarter-century of brutal Indonesian occupation and a UN-run transition after its people voted overwhelmingly for freedom in 1999.',
  },
  {
    name: 'Iraq War',
    country: 'IQ',
    kind: 'conflict',
    year: 2003,
    description:
      'A US-led coalition invaded to seize weapons of mass destruction that were never found. Saddam fell in three weeks; the insurgency and civil war that followed lasted years.',
  },
  {
    name: 'Human Genome Project',
    title: 'The human genome is sequenced',
    country: 'US',
    kind: 'science',
    year: 2003,
    description:
      'The thirteen-year international project to read all three billion letters of human DNA was declared complete — the book of the species, open source.',
  },
  {
    name: '2004 Indian Ocean earthquake and tsunami',
    country: 'ID',
    kind: 'disaster',
    year: 2004,
    description:
      'A magnitude-9 earthquake off Sumatra sent tsunamis across the whole ocean, killing some 230,000 people in fourteen countries on a single morning — many with no warning at all.',
  },
  {
    name: '2004 enlargement of the European Union',
    title: 'The EU takes in ten new members',
    country: 'PL',
    kind: 'politics',
    year: 2004,
    description:
      "Ten countries — eight of them from behind the old Iron Curtain — joined the EU in its largest single expansion, stitching the continent's Cold War halves together.",
    // NASA World Wind satellite map, accession states highlighted — PD.
    commons: 'Eu expansion 2004 map.jpg',
  },
  {
    name: 'Orange Revolution',
    country: 'UA',
    kind: 'revolution',
    year: 2004,
    description:
      "A rigged presidential run-off brought hundreds of thousands into a frozen Kyiv's Independence Square for weeks, until the courts ordered a re-vote — which the opposition won.",
  },
  {
    name: 'Hurricane Katrina',
    country: 'US',
    kind: 'disaster',
    year: 2005,
    description:
      "Katrina's surge broke New Orleans' levees and drowned four-fifths of the city. Some 1,400 died, and the images of Americans stranded on rooftops indicted every level of government.",
  },
  {
    name: '2006 Montenegrin independence referendum',
    title: 'Montenegro votes for independence',
    country: 'ME',
    kind: 'nation',
    year: 2006,
    description:
      'Montenegro voted to leave its union with Serbia — clearing the 55% bar by half a point — and the last piece of the old Yugoslavia went its own way.',
    // "PO!" (Yes) campaign posters in Plav, uploader PD release.
    commons: 'Albanian language poster for Montenegro referendum.JPG',
  },
  {
    name: 'iPhone (1st generation)',
    title: 'The iPhone arrives',
    country: 'US',
    kind: 'culture',
    year: 2007,
    description:
      'Steve Jobs introduced "an iPod, a phone and an internet communicator" — one device. The smartphone it defined put the internet in most of humanity\'s pockets within a decade.',
  },
  {
    name: '2008 Kosovo declaration of independence',
    title: 'Kosovo declares independence',
    country: 'XK',
    kind: 'nation',
    year: 2008,
    description:
      "Nine years after the NATO intervention, Kosovo's assembly declared independence from Serbia. About half the world's states recognise it; Serbia and Russia do not.",
  },
  {
    name: 'Bankruptcy of Lehman Brothers',
    title: 'Lehman falls — the global financial crisis',
    country: 'US',
    kind: 'disaster',
    year: 2008,
    description:
      'The 158-year-old investment bank filed the largest bankruptcy in US history and the global financial system seized. The Great Recession that followed cost millions their homes and jobs.',
  },
  {
    name: 'Russo-Georgian War',
    country: 'GE',
    kind: 'conflict',
    year: 2008,
    description:
      "A five-day August war over South Ossetia ended with Russian troops deep in Georgia and two breakaway regions under de facto Russian control — Europe's first invasion of the century.",
  },
  {
    name: 'First inauguration of Barack Obama',
    title: 'America inaugurates its first Black president',
    country: 'US',
    kind: 'politics',
    year: 2009,
    description:
      'Barack Obama took the oath before a record crowd on the National Mall, 45 years after the March on Washington filled the same ground.',
  },
  {
    name: '2010 Haiti earthquake',
    country: 'HT',
    kind: 'disaster',
    year: 2010,
    description:
      "A magnitude-7 earthquake struck just outside Port-au-Prince, killing well over 100,000 people and flattening much of the capital of the hemisphere's poorest country.",
  },
  {
    name: 'Burj Khalifa',
    title: 'The Burj Khalifa opens',
    country: 'AE',
    kind: 'engineering',
    year: 2010,
    description:
      'Dubai opened the tallest structure humans have ever built — 828 metres, nearly twice the old record holder Taipei 101 — renamed at the last minute for the Abu Dhabi ruler whose bailout saved it.',
  },
  {
    name: 'Tunisian Revolution',
    title: 'The Arab Spring begins in Tunisia',
    country: 'TN',
    kind: 'revolution',
    year: 2010,
    description:
      "A street vendor's self-immolation in a provincial town lit protests that drove out Tunisia's president in 28 days — and spread revolt across the Arab world within weeks.",
  },
  {
    name: '2011 Tōhoku earthquake and tsunami',
    title: 'The tsunami and Fukushima',
    country: 'JP',
    kind: 'disaster',
    year: 2011,
    description:
      "Japan's strongest recorded earthquake sent a tsunami over the sea walls, killing nearly 20,000 people and triggering meltdowns at the Fukushima Daiichi nuclear plant — the worst since Chernobyl.",
  },
  {
    name: 'Independence of South Sudan',
    title: "South Sudan — the world's newest country",
    country: 'SS',
    kind: 'nation',
    year: 2011,
    description:
      "After decades of civil war and a near-unanimous referendum, South Sudan became the world's newest country. Civil war within it followed two years later.",
  },
  {
    name: 'Syrian civil war',
    country: 'SY',
    kind: 'conflict',
    year: 2011,
    description:
      "The Arab Spring's Syrian protests met bullets and spiralled into a war that has killed hundreds of thousands and displaced half the country — the largest refugee crisis of the era.",
  },
  {
    name: 'Higgs boson',
    title: 'The Higgs boson is found',
    country: 'CH',
    kind: 'science',
    year: 2012,
    description:
      "CERN's Large Hadron Collider found the particle predicted 48 years earlier to explain why matter has mass. Peter Higgs, in the audience, wiped away tears; the Nobel came the next year.",
  },
  {
    name: '2013 papal conclave',
    title: 'The first pope from the Americas',
    country: 'VA',
    kind: 'culture',
    year: 2013,
    description:
      "After the first papal resignation in six centuries, the conclave chose Buenos Aires's Jorge Bergoglio — the first pope from the Americas, the southern hemisphere, or the Jesuits. He took the name Francis.",
  },
  {
    name: 'Annexation of Crimea by the Russian Federation',
    title: 'Russia annexes Crimea',
    country: 'UA',
    kind: 'conflict',
    year: 2014,
    description:
      'Unmarked Russian troops — the "little green men" — seized Crimea weeks after Ukraine\'s revolution, and Moscow annexed it after a referendum recognised almost nowhere. Europe\'s borders had been redrawn by force.',
  },
  {
    name: 'Western African Ebola virus epidemic',
    title: 'The West African Ebola epidemic',
    country: 'GN',
    kind: 'disaster',
    year: 2014,
    description:
      'From a single village in Guinea, Ebola spread through Liberia and Sierra Leone in the worst outbreak of the disease ever — over 11,000 dead before it was contained.',
  },
  {
    name: 'Paris Agreement',
    country: 'FR',
    kind: 'politics',
    year: 2015,
    description:
      "Nearly every nation on Earth agreed in Paris to keep global warming well below 2°C. Delegates wept and cheered when the gavel fell — the treaty's test has been every year since.",
  },
  {
    name: '2016 United Kingdom European Union membership referendum',
    title: 'Brexit — Britain votes to leave',
    country: 'GB',
    kind: 'politics',
    year: 2016,
    description:
      'Britain voted 52–48 to leave the European Union, the first member ever to go. The prime minister resigned the next morning; the leaving took four and a half more years.',
    // The referendum ballot paper (no date printed on it) — PD-textlogo.
    commons: '2016 EU Referendum Ballot Paper.jpg',
  },
  {
    name: 'Colombian peace agreement',
    title: 'Colombia signs peace with the FARC',
    country: 'CO',
    kind: 'politics',
    year: 2016,
    description:
      "The government and the FARC guerrillas signed an end to the western hemisphere's longest war — half a century, 260,000 dead. Voters rejected the first draft; a revised deal passed weeks later.",
  },
  {
    name: 'Notre-Dame fire',
    title: 'Notre-Dame burns',
    country: 'FR',
    kind: 'disaster',
    year: 2019,
    description:
      'Fire took the roof and spire of the 850-year-old cathedral as Paris watched from the bridges, singing hymns. The towers and the rose windows survived; it reopened in 2024.',
  },
  {
    name: 'COVID-19 pandemic',
    country: 'CN',
    kind: 'disaster',
    year: 2020,
    description:
      'A novel coronavirus first reported in Wuhan closed borders, schools and cities across the planet within months — millions dead, and vaccines developed at record speed inside a year.',
  },
  {
    name: '2020 Beirut explosion',
    title: 'The Beirut port explosion',
    country: 'LB',
    kind: 'disaster',
    year: 2020,
    description:
      'Some 2,750 tonnes of ammonium nitrate, stored for six years in a port warehouse, detonated in one of the largest non-nuclear blasts ever recorded — over 200 dead and 300,000 homeless in seconds.',
  },
  {
    name: 'Fall of Kabul',
    title: 'The Taliban retake Kabul',
    country: 'AF',
    kind: 'conflict',
    year: 2021,
    description:
      "As the twenty-year Western mission ended, the Afghan government collapsed in days and the Taliban entered Kabul without a fight. The desperate airlift from the airport closed America's longest war.",
  },
  {
    name: 'James Webb Space Telescope',
    title: 'The James Webb Space Telescope launches',
    country: 'US',
    kind: 'science',
    year: 2021,
    description:
      'The long-delayed successor to Hubble launched on Christmas Day and unfolded itself perfectly a million miles out. Its infrared eyes see the first galaxies forming.',
  },
  {
    name: 'Russian invasion of Ukraine',
    country: 'UA',
    kind: 'conflict',
    year: 2022,
    description:
      "Russia launched a full-scale invasion of Ukraine from the north, east and south, expecting Kyiv to fall in days. It did not — and Europe's largest war since 1945 began.",
  },
  {
    name: 'Death and state funeral of Elizabeth II',
    title: 'Elizabeth II dies',
    country: 'GB',
    kind: 'culture',
    year: 2022,
    description:
      "Britain's longest-reigning monarch died at Balmoral after seventy years on the throne. The queue to pass her coffin in Westminster Hall ran for kilometres along the Thames, day and night.",
  },
  {
    name: '2022 FIFA World Cup',
    title: 'The Qatar World Cup final',
    country: 'QA',
    kind: 'culture',
    year: 2022,
    description:
      "The first World Cup in the Arab world, played in winter, ended with what many call the greatest final ever — Messi's Argentina beating Mbappé's France on penalties after 3–3.",
  },
  {
    name: '2023 Turkey–Syria earthquakes',
    country: 'TR',
    kind: 'disaster',
    year: 2023,
    description:
      "Two huge earthquakes hours apart flattened cities across southern Türkiye and northern Syria in the winter cold, killing nearly 60,000 people — Türkiye's worst disaster of the modern era.",
  },
  {
    name: '1990 Mongolian revolution',
    title: 'Mongolia turns democratic',
    country: 'MN',
    kind: 'revolution',
    year: 1990,
    description:
      "Hunger strikes and mass protests in freezing Ulaanbaatar persuaded the communist politburo to resign en masse — a peaceful exit, and Asia's first post-Soviet democracy.",
    // First post-revolution State Baga Khural, parliament.mn — CC BY 4.0 (no PD image exists).
    commons: 'State Baga Khural in session, 1990.png',
  },
  {
    name: 'Kyoto Protocol',
    country: 'JP',
    kind: 'politics',
    year: 1997,
    description:
      'The first treaty binding industrialised countries to cut greenhouse-gas emissions was adopted in Kyoto — the ancestor, through years of argument, of the Paris Agreement.',
  },

  // --- Expansion: deeper antiquity to early modern ---------------------------
  {
    name: 'Battle of Zama',
    title: 'Rome breaks Carthage at Zama',
    country: 'TN',
    kind: 'conflict',
    year: -202,
    description:
      "Scipio defeated Hannibal himself on Carthage's home ground, ending the Second Punic War. Rome never again faced a rival for the western Mediterranean.",
  },
  {
    name: 'Battle of the Teutoburg Forest',
    country: 'DE',
    kind: 'conflict',
    year: 9,
    description:
      'Germanic tribes under Arminius annihilated three Roman legions in the forests east of the Rhine. Rome kept the river as its frontier for the next four centuries.',
  },
  {
    name: 'Plague of Justinian',
    country: 'TR',
    kind: 'disaster',
    year: 541,
    // The pandemic's own item is undated; the "first plague pandemic" carries it.
    qid: 'Q96377989',
    description:
      "The first recorded plague pandemic reached Constantinople along the grain routes and hollowed out Justinian's empire — a rehearsal, eight centuries early, for the Black Death.",
  },
  {
    name: 'Battle of Tours',
    country: 'FR',
    kind: 'conflict',
    year: 732,
    description:
      "Charles Martel's Franks turned back an Umayyad raiding army between Tours and Poitiers — the high-water mark of the Arab advance into Western Europe.",
  },
  {
    name: 'Baghdad',
    title: 'Baghdad is founded',
    country: 'IQ',
    kind: 'nation',
    year: 762,
    description:
      'The Abbasid caliph al-Mansur laid out a brand-new round city on the Tigris. Within a century it was the largest city in the world and the heart of a golden age of learning.',
  },
  {
    name: 'Treaty of Verdun',
    title: "Charlemagne's empire is split in three",
    country: 'FR',
    kind: 'politics',
    year: 843,
    description:
      "Charlemagne's three grandsons partitioned his empire at Verdun. The western and eastern kingdoms it drew would grow, roughly, into France and Germany.",
  },
  {
    name: 'Battle of Manzikert',
    country: 'TR',
    kind: 'conflict',
    year: 1071,
    description:
      'The Seljuk Turks captured the Byzantine emperor and broke his army in eastern Anatolia. The empire never recovered its heartland — and its call for help seeded the Crusades.',
  },
  {
    name: 'Domesday Book',
    country: 'GB',
    kind: 'politics',
    year: 1086,
    description:
      'Twenty years after Hastings, William the Conqueror had every manor, mill and pig in England surveyed and written down — a census so final the English named it after Judgement Day.',
  },
  {
    name: 'Siege of Jerusalem (1187)',
    title: 'Saladin retakes Jerusalem',
    country: 'IL',
    kind: 'conflict',
    year: 1187,
    description:
      'After crushing the crusader army at Hattin, Saladin took Jerusalem back for Islam after 88 years — and, pointedly, without the massacre that had marked its capture.',
  },
  {
    name: 'Sack of Constantinople',
    title: 'Crusaders sack Constantinople',
    country: 'TR',
    kind: 'conflict',
    year: 1204,
    description:
      'The Fourth Crusade never reached the Holy Land — diverted by debts and Venetian politics, it stormed and looted Christian Constantinople instead. Byzantium never truly recovered.',
  },
  {
    name: 'Battle of Ain Jalut',
    title: 'The Mongol advance is stopped at Ain Jalut',
    country: 'IL',
    kind: 'conflict',
    year: 1260,
    description:
      "Egypt's Mamluks met the Mongols in Galilee and beat them — the first major defeat the Mongol Empire could not avenge, and the end of its westward expansion.",
  },
  {
    name: 'Battle of Bannockburn',
    country: 'GB',
    kind: 'conflict',
    year: 1314,
    description:
      "Robert the Bruce's spearmen routed a far larger English army in the marshes below Stirling Castle, securing Scotland's independence for the next three centuries.",
  },
  {
    name: "Hundred Years' War",
    title: "The Hundred Years' War begins",
    country: 'FR',
    kind: 'conflict',
    year: 1337,
    description:
      "The English king's claim to the French crown opened a war that ran, with pauses, for 116 years — long enough to see knights give way to longbows and then to cannon.",
  },
  {
    name: 'Battle of Agincourt',
    country: 'FR',
    kind: 'conflict',
    year: 1415,
    description:
      "Henry V's exhausted, outnumbered army destroyed the flower of French chivalry in the mud of Agincourt — the longbow's most famous hour, remembered ever after via Shakespeare.",
  },
  {
    name: 'Great Stand on the Ugra River',
    title: 'Russia faces down the Horde on the Ugra',
    country: 'RU',
    kind: 'conflict',
    year: 1480,
    description:
      "Ivan III's army faced the Great Horde across the Ugra river until the Horde simply turned for home — the bloodless moment counted as the end of two and a half centuries of Mongol overlordship.",
  },
  {
    name: 'Safavid Iran',
    title: 'The Safavids take Iran',
    country: 'IR',
    kind: 'nation',
    year: 1501,
    description:
      'The young Shah Ismail took Tabriz and founded the Safavid dynasty, making Shia Islam the state religion — the decision that still shapes Iran five centuries on.',
  },
  {
    name: 'Mona Lisa',
    title: 'Leonardo begins the Mona Lisa',
    country: 'IT',
    kind: 'culture',
    year: 1503,
    description:
      "Leonardo da Vinci began a portrait of a Florentine merchant's wife and kept refining it for years, carrying it with him to France — where it never left.",
  },
  {
    name: 'Sistine Chapel ceiling',
    title: 'Michelangelo begins the Sistine ceiling',
    country: 'VA',
    kind: 'culture',
    year: 1508,
    description:
      'Michelangelo — a sculptor, protesting he was no painter — spent four years on his back over the Sistine Chapel, and produced the most famous ceiling on Earth.',
  },
  {
    name: 'Potosí',
    title: 'Silver is struck at Potosí',
    country: 'BO',
    kind: 'culture',
    year: 1545,
    description:
      "A mountain of silver discovered in the high Andes became the largest source of wealth in the Spanish Empire — mined at a terrible cost in forced labour, and minting the world's first global currency.",
  },
  {
    name: 'Gregorian calendar',
    title: 'The Gregorian calendar is introduced',
    country: 'VA',
    kind: 'science',
    year: 1582,
    description:
      'Pope Gregory XIII deleted ten days from October to fix the drifting Julian calendar. Catholic Europe switched at once; Britain held out until 1752, Russia until 1918.',
  },
  {
    name: 'Tulip mania',
    country: 'NL',
    kind: 'culture',
    year: 1637,
    description:
      'At the peak of the Dutch tulip craze single bulbs traded for the price of a canal house — then the market collapsed in weeks. It remains the byword for a speculative bubble.',
  },
  {
    name: 'Battle of Shanhai Pass',
    title: 'The Qing take Beijing',
    country: 'CN',
    kind: 'conflict',
    year: 1644,
    description:
      "A Ming general opened the Great Wall's eastern gate to the Manchus, who swept in to claim a collapsing empire. Their Qing dynasty ruled China until 1912.",
  },
  {
    name: 'Salem witch trials',
    country: 'US',
    kind: 'culture',
    year: 1692,
    description:
      'A wave of accusations in a small Massachusetts town saw twenty people executed for witchcraft before the panic burned out — and became the permanent shorthand for one.',
  },
  {
    name: "Seven Years' War",
    title: "The Seven Years' War begins",
    country: 'DE',
    kind: 'conflict',
    year: 1756,
    description:
      'Fought in Europe, the Americas, India and at sea, it has a claim to being the first world war. Britain emerged with Canada and India; France with the debts that fed its revolution.',
  },
  {
    name: 'Constitution of the United States',
    title: 'The US Constitution is signed',
    country: 'US',
    kind: 'politics',
    year: 1787,
    description:
      'A summer of closed-door argument in Philadelphia produced the oldest written national constitution still in force — beginning, boldly, "We the People".',
  },
  {
    name: 'Louisiana Purchase',
    country: 'US',
    kind: 'politics',
    year: 1803,
    description:
      "Napoleon, needing war money, sold France's vast Louisiana territory for $15 million. The United States doubled in size overnight at about three cents an acre.",
  },
  {
    name: 'Second voyage of HMS Beagle',
    title: 'The Beagle sails, Darwin aboard',
    country: 'EC',
    kind: 'science',
    year: 1831,
    description:
      'A five-year survey voyage carried the young Charles Darwin around South America and to the Galápagos Islands, whose finches and tortoises seeded the theory of evolution.',
  },
  {
    name: 'Battle of Carabobo',
    title: 'Venezuela wins its freedom at Carabobo',
    country: 'VE',
    kind: 'revolution',
    year: 1821,
    description:
      "Bolívar's decisive victory at Carabobo effectively ended Spanish rule in Venezuela — June 24 is still the army's day of days.",
  },
  {
    name: 'View from the Window at Le Gras',
    title: 'The first photograph is taken',
    country: 'FR',
    kind: 'science',
    year: 1826,
    description:
      'Nicéphore Niépce pointed a pewter plate out of his workroom window in Burgundy and exposed it for hours — the oldest surviving photograph of the real world.',
  },
  {
    name: 'Neptune',
    title: 'Neptune is discovered by mathematics',
    country: 'DE',
    kind: 'science',
    year: 1846,
    description:
      "Astronomers in Berlin found Neptune within a degree of where the Frenchman Le Verrier's calculations said an unseen planet must be — discovered by pen before telescope.",
  },
  {
    name: 'Dynamite',
    title: 'Nobel invents dynamite',
    country: 'SE',
    kind: 'science',
    year: 1867,
    description:
      'Alfred Nobel tamed nitroglycerine into a stable stick and made a fortune remaking mining, construction — and war. The prizes in his name were his answer to that legacy.',
  },
  {
    name: 'Brooklyn Bridge',
    title: 'The Brooklyn Bridge opens',
    country: 'US',
    kind: 'engineering',
    year: 1883,
    description:
      'The longest suspension bridge of its day crossed the East River on steel cables — finished by Emily Roebling, who ran the project after her engineer husband was paralysed.',
  },
  {
    name: 'Benz Patent-Motorwagen',
    title: 'Karl Benz patents the automobile',
    country: 'DE',
    kind: 'engineering',
    year: 1886,
    description:
      'Karl Benz patented a three-wheeled carriage driven by a petrol engine — the first true automobile. His wife Bertha made the first road trip in it, without telling him.',
  },
  {
    name: 'Workers Leaving the Lumière Factory',
    title: 'The Lumières screen the first films',
    country: 'FR',
    kind: 'culture',
    year: 1895,
    description:
      "The Lumière brothers filmed their own workers streaming out of the factory gates in Lyon and projected it to paying audiences — cinema's founding minute of footage.",
  },
  {
    name: 'Radium',
    title: 'The Curies discover radium',
    country: 'FR',
    kind: 'science',
    year: 1898,
    description:
      'Marie and Pierre Curie boiled down tonnes of pitchblende in a Paris shed to isolate a new, faintly glowing element. Marie became the first person to win two Nobel Prizes.',
  },

  // --- Expansion: the twentieth century ---------------------------------------
  {
    name: '1903 Tour de France',
    title: 'The first Tour de France',
    country: 'FR',
    kind: 'culture',
    year: 1903,
    description:
      'A newspaper circulation stunt sent sixty riders around France over 2,428 kilometres. The survivors made it the biggest annual sporting event on Earth.',
  },
  {
    name: 'Annus Mirabilis papers',
    title: "Einstein's miracle year",
    country: 'CH',
    kind: 'science',
    year: 1905,
    description:
      'In one year, a 26-year-old patent clerk in Bern published four papers — on light quanta, Brownian motion, special relativity and E=mc² — and physics was never the same.',
  },
  {
    name: 'Great Mosque of Djenné',
    title: 'The Great Mosque of Djenné is raised',
    country: 'ML',
    kind: 'engineering',
    year: 1907,
    description:
      'The largest mud-brick building in the world rose on the site of a 13th-century mosque in Mali. The whole town replasters it by hand at an annual festival.',
  },
  {
    name: 'Ford Model T',
    title: 'The Model T rolls out',
    country: 'US',
    kind: 'engineering',
    year: 1908,
    description:
      "Ford's simple, rugged Model T — soon built on a moving assembly line that cut its price year after year — put the world's middle class on wheels. Half the cars on Earth were once Model Ts.",
  },
  {
    name: 'African National Congress',
    title: 'The ANC is founded',
    country: 'ZA',
    kind: 'politics',
    year: 1912,
    description:
      "Chiefs, lawyers and churchmen met in Bloemfontein to resist the new Union of South Africa's colour bar — the movement that would, 82 years later, win the country's first free election.",
    // 1914 SANNC deputation studio portrait (Dube, Plaatje, Rubusana…) — PD-old.
    commons: 'ANC1914.jpg',
  },
  {
    name: 'Balfour Declaration',
    country: 'GB',
    kind: 'politics',
    year: 1917,
    description:
      'A 67-word letter from Britain\'s foreign secretary promised support for "a national home for the Jewish people" in Palestine — a sentence whose consequences are still being argued.',
  },
  {
    name: 'Prohibition in the United States',
    title: 'America goes dry',
    country: 'US',
    kind: 'politics',
    year: 1920,
    description:
      'The Eighteenth Amendment banned the making and selling of alcohol nationwide. Thirteen years of speakeasies and Al Capone later, it became the only amendment ever repealed.',
  },
  {
    name: '1924 Winter Olympics',
    title: 'The first Winter Olympics',
    country: 'FR',
    kind: 'culture',
    year: 1924,
    description:
      'Sixteen nations met at Chamonix under Mont Blanc for an "International Winter Sports Week" — retroactively crowned the first Winter Olympic Games.',
  },
  {
    name: 'Spirit of St. Louis',
    title: 'Lindbergh flies the Atlantic alone',
    country: 'US',
    kind: 'science',
    year: 1927,
    description:
      'Charles Lindbergh flew 33½ hours from New York to Paris, alone and without radio, in a single-engine plane with a fuel tank where the windscreen should be. A crowd of 100,000 mobbed the field.',
  },
  {
    name: 'Hoover Dam',
    title: 'The Hoover Dam is completed',
    country: 'US',
    kind: 'engineering',
    year: 1936,
    description:
      'A Depression mega-project higher than a 60-storey building corked the Colorado River, creating the largest reservoir in the United States and lighting the Southwest.',
  },
  {
    name: '1936 Summer Olympics',
    title: "Jesse Owens spoils Hitler's Olympics",
    country: 'DE',
    kind: 'culture',
    year: 1936,
    description:
      'The Nazis staged the Berlin Games as a showcase of Aryan supremacy — and the Black American sprinter Jesse Owens won four gold medals in front of them.',
  },
  {
    name: 'Winter War',
    title: 'Finland stands alone in the Winter War',
    country: 'FI',
    kind: 'conflict',
    year: 1939,
    description:
      'The Soviet Union invaded Finland expecting weeks; ski troops in white held the Red Army through a brutal winter for three and a half months. Finland lost territory but kept its independence.',
  },
  {
    name: 'Warsaw Ghetto Uprising',
    country: 'PL',
    kind: 'conflict',
    year: 1943,
    description:
      'Facing final deportation to the death camps, the young Jews of the Warsaw Ghetto fought the SS with smuggled pistols and petrol bombs for nearly a month — the largest Jewish revolt of the Holocaust.',
  },
  {
    name: 'Colossus computer',
    title: 'Colossus — the first electronic computer',
    country: 'GB',
    kind: 'science',
    year: 1943,
    description:
      'Built in secret at Bletchley Park to break German cipher traffic, Colossus was the first programmable electronic digital computer. Churchill ordered it smashed after the war; the secret held for 30 years.',
  },
  {
    name: 'ENIAC',
    title: 'ENIAC is unveiled',
    country: 'US',
    kind: 'science',
    year: 1946,
    description:
      'Thirty tonnes and 18,000 vacuum tubes, built for artillery tables — the first general-purpose electronic computer, programmed by six women history took decades to credit.',
  },
  {
    name: 'The Diary of a Young Girl',
    title: "Anne Frank's diary is published",
    country: 'NL',
    kind: 'culture',
    year: 1947,
    description:
      'Two years after Anne Frank died in Bergen-Belsen at fifteen, her father published the diary she kept in the Amsterdam hiding place. It has been read in some seventy languages.',
  },
  {
    name: 'Kon-Tiki expedition',
    title: 'Kon-Tiki crosses the Pacific',
    country: 'NO',
    kind: 'science',
    year: 1947,
    description:
      'Thor Heyerdahl and five companions drifted 8,000 kilometres from Peru to Polynesia on a balsa-wood raft to prove such a voyage was possible. Science disagreed; the world was enchanted.',
  },
  {
    name: 'Dominion of Ceylon',
    title: 'Ceylon becomes independent',
    country: 'LK',
    kind: 'nation',
    year: 1948,
    description:
      'The island of Ceylon took independence from Britain in the same post-war wave as India and Burma, and in 1972 renamed itself Sri Lanka.',
  },
  {
    name: 'Myanmar',
    title: 'Burma becomes independent',
    country: 'MM',
    kind: 'nation',
    year: 1948,
    description:
      'Burma left the British Empire outright — declining even Commonwealth membership — months after independence hero Aung San was assassinated with most of his cabinet.',
  },
  {
    name: 'Cambodia',
    title: 'Cambodia becomes independent',
    country: 'KH',
    kind: 'nation',
    year: 1953,
    description:
      "King Norodom Sihanouk talked France out of its protectorate without a war — his self-styled 'royal crusade for independence'.",
  },
  {
    name: 'Mau Mau rebellion',
    title: 'The Mau Mau uprising begins',
    country: 'KE',
    kind: 'revolution',
    year: 1952,
    description:
      'A land-and-freedom revolt among the Kikuyu drove Britain to declare an eight-year emergency in Kenya, detaining tens of thousands in camps. Independence followed within a decade.',
  },
  {
    name: 'Eurovision Song Contest 1956',
    title: 'The first Eurovision Song Contest',
    country: 'CH',
    kind: 'culture',
    year: 1956,
    description:
      'Seven countries sent songs to a Swiss casino theatre in a television experiment for the new European Broadcasting Union. The host nation won; the contest never stopped growing.',
  },
  {
    name: 'Laser',
    title: 'The first laser fires',
    country: 'US',
    kind: 'science',
    year: 1960,
    description:
      "Theodore Maiman coaxed a synthetic ruby into emitting the first laser light — a solution famously 'looking for a problem' that ended up in everything from surgery to supermarkets.",
  },
  {
    name: 'The Beatles',
    title: 'The Beatles form in Liverpool',
    country: 'GB',
    kind: 'culture',
    year: 1960,
    description:
      'Four Liverpool teenagers settled on a name and went to play the Hamburg clubs. Within four years they were the biggest band on Earth; popular music still lives in their wake.',
  },
  {
    name: 'Vostok 6',
    title: 'The first woman in space',
    country: 'RU',
    kind: 'science',
    year: 1963,
    description:
      'Valentina Tereshkova, a 26-year-old former textile worker and amateur parachutist, orbited the Earth 48 times — more than every American astronaut to that date combined.',
  },
  {
    name: 'Tōkaidō Shinkansen',
    title: 'The bullet train debuts',
    country: 'JP',
    kind: 'engineering',
    year: 1964,
    description:
      'Nine days before the Tokyo Olympics opened, the first Shinkansen slid out for Osaka at 210 km/h — the fastest railway on Earth, in a country written off as war-broken twenty years before.',
  },
  {
    name: 'Boeing 747',
    title: 'The 747 takes flight',
    country: 'US',
    kind: 'engineering',
    year: 1969,
    description:
      'The first jumbo jet — two and a half times bigger than anything before it — made flying cheap enough for ordinary families. It kept the "Queen of the Skies" title for half a century.',
  },
  {
    name: 'Intel 4004',
    title: 'The first microprocessor',
    country: 'US',
    kind: 'science',
    year: 1971,
    description:
      "Intel squeezed a computer's entire processor onto one fingernail-sized chip, built for a Japanese calculator. Everything with a brain today descends from that bargain.",
  },
  {
    name: 'Watergate scandal',
    title: 'The Watergate break-in',
    country: 'US',
    kind: 'politics',
    year: 1972,
    description:
      'A bungled burglary at the Democratic headquarters unravelled, over two years of reporting and tapes, into the only resignation of a US president.',
  },
  {
    name: "Rubik's Cube",
    title: "Rubik's Cube is invented",
    country: 'HU',
    kind: 'culture',
    year: 1974,
    description:
      'A Budapest architecture lecturer built a twisting cube to teach spatial thinking — then spent a month working out how to solve his own puzzle. It became the best-selling toy in history.',
  },
  {
    name: 'Apple Inc.',
    title: 'Apple is founded in a garage',
    country: 'US',
    kind: 'culture',
    year: 1976,
    description:
      "Two Steves — Jobs selling, Wozniak soldering — founded a computer company in a Silicon Valley garage on April Fools' Day. It became the most valuable company in the world.",
  },
  {
    name: 'Star Wars',
    title: 'Star Wars opens',
    country: 'US',
    kind: 'culture',
    year: 1977,
    description:
      'A space fantasy the studio barely believed in opened in 32 cinemas and rewired popular culture — the blockbuster, the franchise and the summer movie all date from it.',
  },
  {
    name: 'Premiership of Margaret Thatcher',
    title: "Britain's first woman prime minister",
    country: 'GB',
    kind: 'politics',
    year: 1979,
    description:
      "Margaret Thatcher entered Downing Street as Britain's first female prime minister and held it for eleven years, remaking — and dividing — the country.",
  },
  {
    name: 'Walkman',
    title: 'The Walkman starts the soundtrack age',
    country: 'JP',
    kind: 'culture',
    year: 1979,
    description:
      "Sony's pocket cassette player, built because a founder wanted opera on long flights, put private soundtracks into public space — the ancestor of every earbud on the street.",
  },
  {
    name: 'IBM Personal Computer',
    title: 'The IBM PC arrives',
    country: 'US',
    kind: 'science',
    year: 1981,
    description:
      "IBM's rushed, open-parts personal computer became the standard everyone cloned — and made the fortune of the small company that supplied its operating system: Microsoft.",
  },
  {
    name: 'Schengen Agreement',
    title: 'Europe agrees to drop its borders',
    country: 'LU',
    kind: 'politics',
    year: 1985,
    description:
      'Five countries signed on a river boat moored at Schengen, a Luxembourg village where France and Germany meet, to abolish their border checks — passport-free travel now spans most of Europe.',
  },
  {
    name: '1986 FIFA World Cup',
    title: "Maradona's World Cup",
    country: 'MX',
    kind: 'culture',
    year: 1986,
    description:
      'Mexico hosted at five weeks\' notice after Colombia withdrew, and Diego Maradona decided the tournament almost alone — scoring the infamous "Hand of God" and the Goal of the Century four minutes apart.',
  },

  // --- Expansion: decolonisation and the wider world --------------------------
  {
    name: 'Libya',
    title: 'Libya becomes independent',
    country: 'LY',
    kind: 'nation',
    year: 1951,
    description:
      'The first country created by the United Nations: the former Italian colony became an independent kingdom under King Idris, years before oil turned up beneath it.',
  },
  {
    name: "1954 Guatemalan coup d'état",
    title: "A CIA coup topples Guatemala's president",
    country: 'GT',
    kind: 'revolution',
    year: 1954,
    description:
      'The elected president Árbenz, whose land reform threatened the United Fruit Company, was overthrown in a CIA-organised coup — a template, and a warning, for the whole Cold War hemisphere.',
  },
  {
    name: 'Sudan',
    title: 'Sudan becomes independent',
    country: 'SD',
    kind: 'nation',
    year: 1956,
    description:
      "Africa's largest country left joint British-Egyptian rule on New Year's Day 1956 — already carrying the north–south divide that would bring two long civil wars.",
  },
  {
    name: 'Somalia',
    title: 'Somalia becomes independent',
    country: 'SO',
    kind: 'nation',
    year: 1960,
    description:
      'British Somaliland and Italian Somalia became independent within a week of each other and merged into a single Somali Republic.',
  },
  {
    name: 'Madagascar',
    title: 'Madagascar becomes independent',
    country: 'MG',
    kind: 'nation',
    year: 1960,
    description:
      "The world's fourth-largest island took its independence from France in the Year of Africa, thirteen years after a rising that French forces had crushed at terrible cost.",
  },
  {
    name: 'Tanzania',
    title: 'Tanganyika and Zanzibar become Tanzania',
    country: 'TZ',
    kind: 'nation',
    year: 1964,
    description:
      'Mainland Tanganyika and the island of Zanzibar united into one republic under Julius Nyerere — the rare African union that held.',
  },
  {
    name: 'Zambia',
    title: 'Zambia becomes independent',
    country: 'ZM',
    kind: 'nation',
    year: 1964,
    description:
      'Northern Rhodesia became Zambia under Kenneth Kaunda, taking its name from the Zambezi — and inheriting an economy built almost entirely on copper.',
  },
  {
    name: 'Botswana',
    title: 'Botswana becomes independent',
    country: 'BW',
    kind: 'nation',
    year: 1966,
    description:
      "One of the poorest countries on Earth at independence, Botswana found diamonds within a year — and managed them into one of Africa's steadiest democracies and economies.",
  },
  {
    name: 'Fiji',
    title: 'Fiji becomes independent',
    country: 'FJ',
    kind: 'nation',
    year: 1970,
    description:
      'Fiji ended 96 years as a British colony, taking independence with a population almost evenly split between indigenous Fijians and Indian-descended islanders.',
  },
  {
    name: 'Papua New Guinea',
    title: 'Papua New Guinea becomes independent',
    country: 'PG',
    kind: 'nation',
    year: 1975,
    description:
      'The most linguistically diverse country on Earth — some 840 languages — took independence from Australia peacefully, without a war of liberation.',
  },
  {
    name: 'Suriname',
    title: 'Suriname becomes independent',
    country: 'SR',
    kind: 'nation',
    year: 1975,
    description:
      "The Netherlands' South American colony became independent; within five years almost a third of its people had emigrated to the country it left.",
  },
  {
    name: 'Green March',
    country: 'MA',
    kind: 'politics',
    year: 1975,
    description:
      'Morocco sent 350,000 unarmed civilians walking into Spanish Sahara behind flags and Qurans. Spain withdrew — and the status of Western Sahara has been disputed ever since.',
  },
  {
    name: 'Nicaraguan Revolution',
    title: 'The Sandinistas take Managua',
    country: 'NI',
    kind: 'revolution',
    year: 1979,
    description:
      "The Sandinista guerrillas toppled the Somoza family after 43 years of dynastic rule. The US-backed Contra war against the new government defined the region's next decade.",
  },
  {
    name: 'Dakar Rally',
    title: 'The first Paris–Dakar rally sets off',
    country: 'SN',
    kind: 'culture',
    year: 1978,
    description:
      'A racer who had gotten lost in the Libyan desert decided everyone should: some 180 vehicles left Paris for Dakar across the Sahara. Fewer than half arrived.',
  },
  {
    name: "1989 Paraguayan coup d'état",
    title: 'Stroessner falls after 35 years',
    country: 'PY',
    kind: 'revolution',
    year: 1989,
    description:
      "General Stroessner — the hemisphere's longest-ruling dictator — was toppled by his own son-in-law's faction in a night of fighting in Asunción, opening Paraguay's slow turn to elections.",
    // 1954 official portrait, Casa Fotográfica Resck — PD-Paraguay.
    commons: 'Alfredo Stroessner en 1954.jpg',
  },
  {
    name: 'Kazakhstan',
    title: 'Kazakhstan becomes independent',
    country: 'KZ',
    kind: 'nation',
    year: 1991,
    description:
      "The last Soviet republic to declare independence — five days before the USSR itself dissolved — inherited the world's ninth-largest territory and its main spaceport, Baikonur.",
  },
  {
    name: 'Chapultepec Peace Accords',
    title: "El Salvador's war ends at Chapultepec",
    country: 'SV',
    kind: 'politics',
    year: 1992,
    // The accords item is undated; the war's end time carries the year.
    qid: 'Q1783607',
    description:
      "Government and FMLN guerrillas signed away twelve years of civil war — 75,000 dead — in Mexico City's Chapultepec Castle, folding the guerrillas into electoral politics.",
  },
  {
    name: 'Barbados',
    title: 'Barbados becomes independent',
    country: 'BB',
    kind: 'nation',
    year: 1966,
    description:
      'Barbados took independence from Britain after three centuries as a sugar colony — and in 2021 completed the journey, replacing the Queen with a Barbadian president.',
  },
  {
    name: '2008 Bhutanese National Assembly election',
    title: 'Bhutan votes for the first time',
    country: 'BT',
    kind: 'politics',
    year: 2008,
    qid: 'Q864684',
    description:
      "The Himalayan kingdom famous for measuring Gross National Happiness held its first general election — a democracy introduced from the throne, at the king's own insistence.",
    // Bhutan's CEC preparing the first election, Election Commission of India photo — GODL-India (no PD image exists).
    commons:
      'The Chief Election Commissioner, Shri B.B Tandon and the Chief Election Commissioner of Bhutan, Mr. Kunzan Wangdi signing an MoU for cooperation in Electoral Management in Thimpu, Bhutan on May 24, 2006.jpg',
  },

  // --- Expansion: the digital age and the present ------------------------------
  {
    name: 'PlayStation',
    title: 'The PlayStation launches',
    country: 'JP',
    kind: 'culture',
    year: 1994,
    // Bare name search finds the brand, not the 1994 console.
    qid: 'Q10677',
    description:
      "Born from a Nintendo partnership that collapsed, Sony's grey box took video games from the children's bedroom to the living room — the first console to sell 100 million.",
  },
  {
    name: 'Deep Blue versus Garry Kasparov',
    title: 'Deep Blue beats the world champion',
    country: 'US',
    kind: 'science',
    year: 1997,
    // The match item is undated; the deciding sixth game carries the year.
    qid: 'Q2631085',
    description:
      "IBM's chess machine beat world champion Garry Kasparov over six games — the first defeat of a reigning champion by a computer, and a line quietly crossed for everyone.",
  },
  {
    name: 'Google',
    title: 'Google is founded',
    country: 'US',
    kind: 'culture',
    year: 1998,
    description:
      'Two Stanford students incorporated their search project in a rented garage. Its name became the verb for finding anything out.',
  },
  {
    name: 'Shenzhou 5',
    title: 'China puts a person in space',
    country: 'CN',
    kind: 'science',
    year: 2003,
    description:
      'Yang Liwei orbited the Earth fourteen times aboard Shenzhou 5, making China the third nation — forty-two years after the first two — to launch a human into space on its own.',
  },
  {
    name: 'Facebook',
    title: 'Facebook goes online',
    country: 'US',
    kind: 'culture',
    year: 2004,
    description:
      "A student directory coded in a Harvard dorm room grew into the network holding a third of humanity — and into the era's hardest arguments about privacy and truth.",
  },
  {
    name: 'IAU definition of planet',
    title: 'Pluto is demoted',
    country: 'CZ',
    kind: 'science',
    year: 2006,
    description:
      'Astronomers meeting in Prague voted a formal definition of "planet" — and Pluto, beloved ninth planet for 76 years, became a dwarf planet by show of hands.',
  },
  {
    name: '2010 eruptions of Eyjafjallajökull',
    title: 'An Icelandic volcano grounds Europe',
    country: 'IS',
    kind: 'disaster',
    year: 2010,
    description:
      "Ash from an unpronounceable Icelandic volcano closed most of Europe's airspace for nearly a week — the largest air-traffic shutdown since the Second World War, without a single casualty.",
  },
  {
    name: '2010 Copiapó mining accident',
    title: 'The 33 Chilean miners surface',
    country: 'CL',
    kind: 'disaster',
    year: 2010,
    description:
      'Thirty-three miners survived 69 days seven hundred metres underground in the Atacama, and a billion people watched the capsule winch every one of them back to daylight.',
  },
  {
    name: 'First observation of gravitational waves',
    title: 'Gravitational waves are heard',
    country: 'US',
    kind: 'science',
    year: 2015,
    description:
      'Twin LIGO detectors caught the spacetime ripple of two black holes colliding a billion light-years away — the confirmation Einstein predicted but thought undetectable.',
  },
  {
    name: 'AlphaGo versus Lee Sedol',
    title: 'AlphaGo beats Lee Sedol',
    country: 'KR',
    kind: 'science',
    year: 2016,
    description:
      'DeepMind\'s AlphaGo beat the great Lee Sedol four games to one at Go, a game thought safe from machines for decades — its "move 37" was so alien commentators assumed a mistake.',
  },
  {
    name: 'Tham Luang cave rescue',
    title: 'The Thai cave rescue',
    country: 'TH',
    kind: 'culture',
    year: 2018,
    description:
      'Twelve boys and their football coach, trapped ten days deep in a flooding cave, were sedated and dived out one by one by an improvised international team — all thirteen survived.',
  },
  {
    name: 'School Strike for Climate',
    title: 'A school strike goes global',
    country: 'SE',
    kind: 'culture',
    year: 2018,
    description:
      "Fifteen-year-old Greta Thunberg sat down outside Sweden's parliament with a hand-painted sign instead of going to school. Within a year, millions were striking with her.",
  },
  {
    name: '2021 Suez Canal obstruction',
    title: 'One ship blocks world trade',
    country: 'EG',
    kind: 'culture',
    year: 2021,
    description:
      "The 400-metre container ship Ever Given wedged itself across the Suez Canal for six days, holding up billions in trade daily — and becoming the internet's favourite metaphor.",
  },
  {
    name: 'Chandrayaan-3',
    title: 'India lands at the lunar south pole',
    country: 'IN',
    kind: 'science',
    year: 2023,
    description:
      'India became the fourth country to soft-land on the Moon and the first to reach its south polar region — days after a Russian attempt crashed, and on a famously lean budget.',
  },
]
