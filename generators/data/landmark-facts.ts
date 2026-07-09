/**
 * One or two lines about each landmark, shown on the pin-round reveal.
 *
 * Hand-written, but not from memory. `bun run generators/fetch-landmark-facts.ts`
 * pulls each landmark's English Wikipedia lead into
 * generators/data/landmark-facts-review.txt (gitignored), and every line below
 * is condensed from its entry there. Nothing is asserted that the lead does not
 * say — the point of the review file is that each claim can be checked against
 * the paragraph it came from.
 *
 * Aim for the detail a player would actually remember rather than the taxonomy:
 * "the world's largest Buddhist temple" earns its place, "a 9th-century
 * Mahayana Buddhist temple in Central Java" does not.
 *
 * Keyed by the landmark's slug (see `slugify` in create-landmarks-file). A
 * missing key is fine — the reveal simply shows no description.
 */
export const LANDMARK_FACTS: Record<string, string> = {
  'eiffel-tower':
    "Built as the centrepiece of the 1889 World's Fair, on the centenary of the French Revolution. France's leading artists denounced the design; it is now the country's defining silhouette.",
  'arc-de-triomphe':
    'Raised to honour those who fought and died for France in the Revolutionary and Napoleonic wars. Twelve avenues radiate from the square around it.',
  'mont-saint-michel':
    'An abbey on a tidal island a few hundred metres offshore — reachable on foot at low tide, cut off and defensible the rest of the day. Twenty-three people live there.',
  'louvre-pyramid': "I. M. Pei's glass-and-steel pyramid, the entrance and skylight of the Louvre.",
  'palace-of-versailles':
    'The French court lived here permanently from 1682, under Louis XIV, XV and XVI — until October 1789, when the Revolution took the king back to Paris.',
  'notre-dame-de-paris':
    'A medieval cathedral on an island in the Seine, and among the finest surviving examples of French Gothic.',
  'pont-du-gard':
    'A first-century Roman aqueduct bridge that carried water more than 50km to the colony of Nîmes. One of the best preserved anywhere.',

  colosseum:
    'The largest amphitheatre the Romans ever built, and still the largest standing. Begun under Vespasian in 72 AD and finished by his son Titus in 80.',
  'leaning-tower-of-pisa':
    "The bell tower of Pisa Cathedral, leaning nearly four degrees on a foundation that could not hold it. The flaw made it one of the world's most visited buildings.",
  'trevi-fountain':
    "Rome's largest Baroque fountain, 26 metres high, finished in 1762 after two architects and decades of work.",
  'st-peter-s-basilica':
    "An Italian Renaissance church raised to replace the fourth-century basilica Constantine built over the apostle's grave.",
  'florence-cathedral':
    'Begun in 1296 and left open to the sky for over a century — nobody knew how to roof it. Brunelleschi engineered the dome, finished in 1436.',
  'grand-canal-venice':
    "Venice's main thoroughfare: a reverse-S of water, 3.8km long, threading the old sestieri from the lagoon to San Marco.",
  pompeii:
    'A Roman town of up to 20,000 people, buried under metres of ash by Vesuvius in 79 AD. The ash preserved it — a city frozen at the moment it died.',
  'sagrada-familia':
    "Gaudí's basilica, begun in 1882 and still unfinished. Already the tallest church in the world.",
  alhambra:
    'A palace-fortress begun in 1238 by the first emir of Granada, the last Muslim state in Spain. The only well-preserved palace of the medieval Islamic world.',
  'park-guell':
    'Gardens and architecture on a Barcelona hillside, commissioned from Gaudí by the industrialist Eusebi Güell.',
  'guggenheim-museum-bilbao':
    "Frank Gehry's titanium museum, opened in 1997, credited with remaking a declining industrial city.",
  'mezquita-of-cordoba':
    'A great mosque of the Andalusian caliphs, converted into a cathedral after the Christian reconquest. It is still called the Mezquita.',
  'elizabeth-tower':
    'Big Ben is the bell, not the tower. The Perpendicular Gothic clock tower was completed in 1859 and renamed for Elizabeth II in 2012.',
  'tower-bridge':
    "Built 1886–94 to serve the 39% of London's population living east of London Bridge.",
  stonehenge:
    'Sarsen uprights of some 25 tons each, capped by lintels locked in place with mortise-and-tenon joints — a technique used at no other prehistoric monument.',
  'london-eye':
    "The world's tallest cantilevered observation wheel, 135 metres high, and the most visited paid attraction in the United Kingdom.",
  'buckingham-palace':
    'A townhouse built for the Duke of Buckingham in 1703, grown into the London residence and headquarters of the British monarch.',
  'edinburgh-castle':
    'Castle Rock has been occupied since the Iron Age. A royal castle has stood on it since the 11th century; by the 17th it was a garrison.',
  'giant-s-causeway':
    'Roughly 40,000 interlocking basalt columns, left by a volcanic fissure eruption tens of millions of years ago.',
  'brandenburg-gate':
    'A neoclassical gate raised in 1788–91 by Frederick William II, on the spot where the old road to Brandenburg began.',
  'neuschwanstein-castle':
    'A 19th-century fantasy of a medieval palace, built on a crag above a gorge in the Bavarian Alps.',
  'cologne-cathedral':
    "Germany's most visited landmark, and one of the great works of Gothic architecture — about six million people a year.",
  'reichstag-building':
    'Built 1884–94 for the parliament of the German Empire, then the Weimar Republic. It is again the seat of the Bundestag.',
  'acropolis-of-athens':
    'A citadel on a rock above Athens. The word simply means "high city" — Greece has many; this is the one.',
  parthenon:
    "A temple to Athena raised in the 5th century BC to thank her for the defeat of Persia. It doubled as the city's treasury.",
  meteora:
    'Twenty-four Orthodox monasteries raised from the 14th century on top of giant natural stone pillars. Locally, second in importance only to Mount Athos.',
  santorini:
    'The largest island of a small circular archipelago — the rim of the drowned Santorini caldera, in the southern Aegean.',
  'windmills-of-kinderdijk':
    'Nineteen windmills built in 1738–40 to pump water out of the polder. The largest concentration of old mills in the Netherlands.',
  rijksmuseum:
    'The Dutch national museum of art and history, founded in 1798 and in Amsterdam since 1808.',
  atomium:
    "Built for the 1958 Brussels World's Fair as a tribute to scientific progress, and to Belgian engineering.",
  'grand-place-brussels':
    'A square ringed by the Baroque guildhalls of Brussels, begun in the 11th century and largely finished by the 17th.',
  'little-mermaid-statue':
    "A small bronze on a rock in Copenhagen harbour, from Hans Christian Andersen's 1837 fairy tale. Just 1.25 metres tall.",
  nyhavn:
    'A 17th-century Copenhagen canal lined with brightly painted townhouses, its water still full of historic wooden ships.',
  matterhorn:
    'A near-symmetric pyramid on the Swiss–Italian border, 4,478 metres high. The emblem of the Alps.',
  'chapel-bridge-lucerne':
    "Europe's oldest wooden covered bridge, hung with 17th-century paintings. Fire destroyed much of it in 1993; it was rebuilt.",
  jungfraujoch:
    'A glacier saddle at 3,463 metres between the Jungfrau and the Mönch — reachable by railway since 1912.',
  'belem-tower':
    "The ceremonial gateway to Lisbon, where Portugal's explorers embarked. Built at the height of the Manueline age.",
  'pena-palace':
    'A Romanticist palace on a Sintra hilltop, visible from Lisbon on a clear day. One of the Seven Wonders of Portugal.',
  'saint-basil-s-cathedral':
    "Built 1555–61 on Ivan the Terrible's orders to mark the capture of Kazan and Astrakhan. Now a museum.",
  'red-square':
    "Moscow's oldest and largest square, running along the eastern wall of the Kremlin.",
  'hermitage-museum':
    "Holds the largest collection of paintings in the world. Founded in 1764, when Catherine the Great acquired a Berlin merchant's collection.",
  'peterhof-palace':
    "Peter the Great's answer to Versailles, expanded after he visited the French court in 1717. They call it the Russian Versailles.",
  'charles-bridge':
    'Begun in 1357 under Charles IV to replace a bridge a flood had wrecked. It took until the 15th century to finish.',
  'prague-castle':
    'A 9th-century castle complex that has housed the kings of Bohemia, Holy Roman emperors, and the presidents of Czechoslovakia.',
  'hungarian-parliament-building':
    'The seat of the National Assembly, on Kossuth Square by the Danube — a neo-Gothic pile designed by Imre Steindl.',
  'fisherman-s-bastion':
    'Neo-Romanesque lookout terraces above Buda Castle, giving the panorama of Budapest.',
  'blue-mosque':
    'The Sultan Ahmed Mosque, raised in Istanbul between 1609 and 1617, and one of the great monuments of Ottoman architecture.',
  'hagia-sophia':
    'A church from 360, a mosque from 1453, a museum from 1935, and a mosque again. On completion in 537 it held the largest interior space in the world.',
  cappadocia:
    'A historical region of Central Anatolia. Herodotus knew its people by name at the time of the Ionian Revolt, in 499 BC.',
  pamukkale:
    '"Cotton castle" in Turkish — white terraces of carbonate mineral left by thermal springs flowing down the hillside.',
  'chernobyl-nuclear-power-plant':
    'Now being decommissioned, beside the abandoned city of Pripyat and 100km north of Kyiv.',
  'saint-sophia-cathedral-kyiv':
    "A monument of Kyivan Rus', and the first site in Ukraine inscribed on the World Heritage List.",
  'wawel-castle':
    'A fortified royal residence on the Vistula, ordered by Casimir III the Great and enlarged for centuries after — the most significant site in Poland.',
  'main-market-square-krakow':
    "Kraków's 13th-century market square, at 3.79 hectares among the largest medieval town squares in Europe.",
  'bran-castle':
    'Built by Saxons in 1377 by grant of Louis I of Hungary, on the Transylvanian side of the old border with Wallachia.',
  'palace-of-the-parliament':
    "Ceaușescu's People's House, now the seat of Romania's Parliament. It runs 92 metres underground.",
  'rila-monastery':
    "Bulgaria's largest Orthodox monastery, deep in the Rila Mountains, 117km south of Sofia.",
  'kravice-falls':
    'A tufa cascade on the Trebižat, 25 metres high, spilling into a pool 120 metres across in the karst of Herzegovina.',
  'stari-most':
    'A 16th-century Ottoman bridge over the Neretva, kept by the *mostari* who gave Mostar its name. Destroyed in war, rebuilt.',
  'plitvice-lakes':
    'A chain of tufa lakes, caves and linked waterfalls in the Croatian karst. A national park since 1949.',
  'diocletian-s-palace':
    'Emperor Diocletian built it at the end of the third century as his retirement home. Half was his; the rest housed the garrison.',
  'bled-island': 'An island in a lake of the Julian Alps, an hour from Ljubljana.',
  'cliffs-of-moher':
    "Fourteen kilometres of sea cliff on the Atlantic, rising to 214 metres just north of O'Brien's Tower.",
  'trinity-college-dublin':
    'The sole constituent college of the University of Dublin, chartered under Elizabeth I.',
  'blue-lagoon-iceland':
    'A geothermal spa in a lava field on the Reykjanes Peninsula, fed by water from the Svartsengi power station.',
  gullfoss:
    'A waterfall in the canyon of the Hvítá, and a stop on the Golden Circle out of Reykjavík.',
  geirangerfjord:
    'A 15-kilometre branch of the Sunnylvsfjorden, in the Sunnmøre region of western Norway.',
  bryggen:
    'The old Hanseatic wharf of Bergen — the German dock — lining the eastern side of the Vågen harbour.',
  'vasa-museum':
    'Built around the Vasa, a 64-gun warship that sank on her maiden voyage in 1628 and was raised almost intact.',
  suomenlinna:
    'A sea fortress spread across eight islands, four kilometres from the centre of Helsinki.',
  'gate-of-the-sun-toledo':
    'A city gate raised by the Knights Hospitaller, in the Mudéjar style — Romanesque and Islamic at once.',
  'schonbrunn-palace':
    "The Habsburgs' summer residence in Vienna: 1,441 rooms, named for a spring the court once drank from.",
  hallstatt:
    'A lakeside town in the Salzkammergut, pressed between the water and the slopes of the Dachstein.',
  'great-pyramid-of-giza':
    'The tomb of Pharaoh Khufu, the oldest of the Seven Wonders of the Ancient World — and the only one still standing.',
  'great-sphinx-of-giza':
    'A reclining lion with a human head, carved from the limestone bedrock of the Giza plateau, facing east.',
  karnak:
    'A vast complex of temples, pylons and chapels near Luxor. Building began under Senusret I in the Middle Kingdom and went on into the Ptolemaic Kingdom.',
  'abu-simbel-temples':
    'Two temples cut into rock on the bank of Lake Nasser, in Upper Egypt near the border with Sudan.',
  'table-mountain':
    'The flat-topped mountain over Cape Town. It carries 2,285 plant species, some four-fifths of them fynbos.',
  'cape-of-good-hope':
    'A rocky headland on the Atlantic coast of the Cape Peninsula. It is not, despite the belief, the southern tip of Africa.',
  'robben-island':
    'Seal Island, in Dutch. It lies in Table Bay, seven kilometres off the coast north of Cape Town.',
  'victoria-falls':
    'A curtain of water 1,708 metres wide, where the Zambezi drops along the border of Zambia and Zimbabwe.',
  'mount-kilimanjaro':
    "Africa's highest mountain at 5,895 metres, and the tallest free-standing mountain in the world. A dormant volcano.",
  'serengeti-national-park':
    'Nearly 15,000 square kilometres of savanna in northern Tanzania, a park since 1940.',
  'stone-town':
    "The old quarter of Zanzibar City, on the western coast of Unguja. The rest of the city is simply Ng'ambo — the other side.",
  'hassan-ii-mosque':
    "The second largest mosque in Africa, finished in Casablanca in 1993. Its minaret, 210 metres, is the world's second tallest.",
  'jemaa-el-fnaa': 'The main square and marketplace of the Marrakesh medina.',
  chefchaouen:
    'The Blue City: a town in the mountains of northern Morocco, founded in 1471, painted in shades of blue.',

  'church-of-saint-george-lalibela':
    'One of eleven churches at Lalibela hewn downward out of solid rock, named for the Zagwe king who ordered them.',
  'simien-mountains':
    'Plateaus cut apart by valleys in the Ethiopian Highlands, northeast of Gondar.',
  'great-mosque-of-djenne':
    'The largest adobe brick building in the world, standing on the flood plain of the Bani. A mosque has been on the site since the 13th century.',
  'maasai-mara':
    'A game reserve in Narok County that runs straight into the Serengeti across the border. Named for the Maasai, who have always lived here.',
  'mount-kenya':
    "Africa's second highest mountain, 16 kilometres south of the equator. Its peaks are Batian, Nelion and Point Lenana.",
  'pyramids-of-meroe':
    'Nubian pyramids in three cemeteries by the ancient city of Meroë, 200km northeast of Khartoum.',
  sossusvlei: 'A salt and clay pan ringed by high red dunes, in the southern reaches of the Namib.',
  'okavango-delta':
    'A river that never reaches the sea: the Okavango spreads into a vast inland delta and evaporates in the Kalahari.',
  'bwindi-impenetrable-forest':
    'Rainforest on the edge of the Albertine Rift in southwestern Uganda, along the border with the Democratic Republic of the Congo.',
  'volcanoes-national-park':
    'A hundred and sixty square kilometres of Rwandan rainforest, taking in five of the eight Virunga volcanoes.',
  kirstenbosch:
    "A botanical garden at the eastern foot of Table Mountain, covering five of South Africa's six biomes.",
  carthage:
    'Founded, by legend, by Queen Dido. It became one of the great trading hubs and one of the wealthiest cities of the classical Mediterranean.',
  'el-djem-amphitheatre':
    'A Tunisian town built over Roman remains — chief among them its amphitheatre.',
  timgad:
    'A Roman city in the Aurès Mountains, founded by Trajan around 100 AD and named for his mother and his eldest sister.',
  'elmina-castle':
    'Raised by the Portuguese in 1482 on the Gold Coast as St. George of the Mine Castle.',
  'taj-mahal':
    'An ivory-white marble mausoleum on the Yamuna, commissioned in 1631 by Shah Jahan for the tomb of his wife Mumtaz Mahal.',
  'india-gate':
    'A war memorial in New Delhi bearing the names of more than 13,516 British and Indian soldiers.',
  'golden-temple':
    'The gurdwara at Amritsar: the holiest site of Sikhism, its sanctum ringed by the sarovar, the sacred pool.',
  'hawa-mahal':
    'The Palace of Winds, built in 1799 of red and pink sandstone, on the edge of the Jaipur City Palace.',
  'gateway-of-india':
    "An arch on the Mumbai waterfront, finished in 1924 to mark George V's landing for his coronation as Emperor of India.",
  'great-wall-of-china':
    'Not one wall but many, raised along the northern frontier against the steppe. The first date to the 7th century BC.',
  'forbidden-city':
    'The imperial palace at the centre of Beijing, home to 24 Ming and Qing emperors and the seat of power for 500 years.',
  'terracotta-army':
    'Funerary sculpture buried with the first emperor of China in 210–209 BC, to guard him in the afterlife.',
  'temple-of-heaven':
    'Where the Ming and Qing emperors prayed each year for a good harvest, in the southeast of central Beijing.',
  'leshan-giant-buddha':
    'A Buddha 71 metres tall, cut from a red sandstone cliff between 712 and 804, where the Min meets the Dadu.',
  zhangjiajie:
    'A city in northwestern Hunan, holding the forest park and the Wulingyuan scenic area.',
  'potala-palace':
    "The winter palace of the Dalai Lamas on Lhasa's Red Mountain, their residence from 1649 until 1959.",
  'mount-fuji': "Japan's highest mountain at 3,776 metres, and an active stratovolcano.",
  'tokyo-tower':
    'Finished in 1958 and 332.9 metres tall — the tallest tower in Japan until the Skytree.',
  'fushimi-inari-taisha':
    'The head shrine of the kami Inari, with trails of torii climbing four kilometres up the mountain behind it.',
  'kinkaku-ji':
    'Officially Rokuon-ji: a Zen temple among the seventeen Historic Monuments of Ancient Kyoto.',
  'itsukushima-shrine':
    'A Shinto shrine on Miyajima, known for the torii that appears to float on the water at high tide.',
  'himeji-castle':
    'Eighty-three structures of interlocking defence, and the finest surviving example of Japanese castle architecture.',
  'petronas-towers':
    'Twin 88-storey towers of 451.9 metres. From 1998 to 2004 they were the tallest buildings in the world.',
  'batu-caves':
    'Limestone caves in a 325-metre mogote north of Kuala Lumpur, holding Hindu temples and shrines.',
  'marina-bay-sands':
    "At its opening in 2010, the world's most expensive standalone casino property — S$8 billion.",
  merlion:
    'The official mascot of Singapore: a creature with the head of a lion and the body of a fish.',
  'gardens-by-the-bay':
    'An urban park of 105 hectares on the Marina Reservoir, in three waterfront gardens.',
  'angkor-wat':
    'The largest religious complex in the world, raised between 1113 and 1150 in the old Khmer capital of Angkor.',
  bayon: 'The state temple of Jayavarman VII, at the centre of his capital Angkor Thom.',
  'grand-palace-bangkok':
    'The official residence of the kings of Siam since 1782. The court governed from its grounds until 1925.',
  'wat-arun': 'The Temple of Dawn, on the west bank of the Chao Phraya in Bangkok.',
  'wat-rong-khun':
    'The White Temple: not a temple at all, but a privately owned art exhibit in the shape of one, outside Chiang Rai.',
  borobudur:
    'A 9th-century Buddhist temple of grey andesite, built as nine stacked platforms near Yogyakarta.',
  prambanan:
    'A 9th-century Hindu compound in Java dedicated to the Trimūrti — Brahma the creator, Vishnu the preserver, Shiva the destroyer.',
  'mount-bromo':
    'Not the highest of the Tengger massif, but the most active — and a Hindu pilgrimage site.',
  gyeongbokgung: 'The first royal palace of the Joseon dynasty, established in Seoul in 1395.',
  'n-seoul-tower':
    "A 236-metre tower on the summit of Namsan, and the nation's first to carry multiple broadcasters.",
  bulguksa:
    'A head temple of the Jogye Order on Tohamsan, holding six National Treasures, among them the Dabotap and Seokgatap pagodas.',
  'burj-khalifa': 'The tallest structure in the world, 829.8 metres — just over half a mile.',

  'sheikh-zayed-grand-mosque':
    "The largest mosque in the United Arab Emirates, and the country's chief place of daily prayer.",
  'burj-al-arab':
    'One of the tallest hotels in the world, though 39% of its height is space nobody can occupy.',
  'palm-jumeirah': 'An archipelago of artificial islands raised out of the Persian Gulf off Dubai.',
  petra:
    "The Rose City: an ancient Nabataean capital cut into southern Jordan's rock, famed for its rock-cut architecture and its water conduits.",
  'wadi-rum':
    'The largest valley in Jordan, 720 square kilometres cut into sandstone and granite. Prehistoric peoples left their marks in it.',
  'ha-long-bay':
    'Thousands of limestone karsts and islets in a northeastern Vietnamese bay. The name means "descending dragon".',
  'hoi-an-ancient-town':
    'A trading post where foreign merchants met Vietnam from the 15th century to the 19th.',
  'shwedagon-pagoda': 'A gilded stupa in Yangon, and the most sacred Buddhist pagoda in Myanmar.',
  bagan:
    'Capital of the Pagan Kingdom from the 9th to the 13th century — the first kingdom to unite the lands that became Myanmar.',
  sigiriya:
    'A rock fortress on a column of granite about 180 metres high, in the Central Province of Sri Lanka.',
  'temple-of-the-tooth':
    "In the royal palace complex of the old Kingdom of Kandy, holding a relic of the Buddha's tooth.",
  'taipei-101':
    'A 101-storey tower of 508 metres. On opening it was classified the tallest building in the world.',
  'masjid-al-haram': 'The Great Mosque of Mecca, holiest in Islam. It encloses the Kaaba.',
  'al-masjid-an-nabawi':
    "The Prophet's Mosque at Medina, the second Muhammad built and the second holiest site in Islam.",
  kaaba:
    'The stone building at the centre of the Masjid al-Haram, and the point every Muslim turns to in prayer.',
  'museum-of-islamic-art-doha':
    "I. M. Pei set it on its own artificial peninsula, near the old dhow harbour at one end of Doha's Corniche.",
  'naghsh-e-jahan-square':
    'Built between 1598 and 1629 at the centre of Isfahan, and known before 1979 as the Shah Square.',
  persepolis:
    'The ceremonial capital of the Achaemenid Empire, on the plains of Marvdasht under the Zagros.',
  'registan-of-samarkand':
    'A public square in Samarkand framed by three madrasas — the Ulugh Beg of Timurid days, the Sherdar and Tilakari from later.',
  boudhanath: 'A stupa in Kathmandu, held to embody the enlightened mind of all the Buddhas.',
  'mount-everest':
    'The highest mountain on Earth above sea level, its summit marking part of the border between China and Nepal.',
  baiterek:
    'A monument and observation tower in Astana, which became the capital of Kazakhstan in 1997.',
  'song-kol-lake':
    'An alpine lake in northern Kyrgyzstan, 3,016 metres up and 270 square kilometres across.',
  'sydney-opera-house':
    'A performing arts centre on Sydney Harbour, and a masterpiece of 20th-century architecture.',
  uluru: 'A sandstone monolith near the centre of Australia, sacred to the Pitjantjatjara.',
  'sydney-harbour-bridge':
    'A steel through arch carrying the city across the harbour from the business district to the North Shore.',
  'great-barrier-reef':
    "The world's largest coral reef system: over 2,900 reefs and 900 islands strung across 2,300 kilometres.",
  'hobbiton-movie-set':
    'The Shire of the Lord of the Rings and Hobbit films, on a family farm in the Waikato.',
  'milford-sound':
    "A fiord in Fiordland, on the South Island. An international survey once judged it the world's top travel destination.",
  'sky-tower-auckland':
    'A telecommunications and observation tower of 328 metres, in the Auckland business district.',
  'statue-of-liberty':
    'A colossal copper-clad figure on Liberty Island, given to the United States by the people of France.',
  'golden-gate-bridge':
    'A suspension bridge across the mile-wide strait where San Francisco Bay meets the Pacific.',
  'grand-canyon':
    'Carved by the Colorado through Arizona: 446 kilometres long, up to 29 wide, and over a mile deep.',
  'mount-rushmore':
    'A colossal sculpture cut into the granite of the Black Hills — a mountain the Lakota call the Six Grandfathers.',
  'times-square':
    'Where Broadway, Seventh Avenue and 42nd Street meet: one of the busiest pedestrian intersections in the world.',
  'yellowstone-national-park':
    'Established by an act of the 42nd Congress, mostly in Wyoming but spilling into Montana and Idaho.',
  'cn-tower':
    'A 553.3-metre tower finished in 1976, named for Canadian National, the railway that built it.',
  'niagara-falls':
    'Three waterfalls on the Ontario–New York border. The largest, Horseshoe Falls, straddles the line itself.',
  'banff-national-park':
    "Canada's first national park, established in 1885 as Rocky Mountains Park.",
  'chateau-frontenac': 'A historic hotel in the Upper Town of Old Quebec.',
  'chichen-itza':
    'A great Maya city of the Terminal Classic, and the focal point of the northern Maya lowlands.',
  teotihuacan:
    'An ancient Mesoamerican city 40 kilometres northeast of modern Mexico City, holding some of the most architecturally significant buildings of the Americas.',
  palenque:
    'A Maya city-state that perished in the 8th century. Its ruins run from about 226 BC to 799 AD.',
  'cenote-ik-kil':
    'A cenote near Chichen Itza, in the northern Yucatán. It is open to the public for swimming.',
  'panama-canal':
    'Eighty-two kilometres of artificial waterway across the narrowest point of the isthmus, joining the Caribbean to the Pacific.',
  tikal:
    'The ruin of a Maya city in the Guatemalan rainforest — likely called Yax Mutal — and one of the largest urban centres of the pre-Columbian Maya.',
  'antigua-guatemala':
    'Capital of the Captaincy General of Guatemala from 1543 to 1773. Much of its Baroque architecture dates from then.',
  'arenal-volcano': 'A recently active stratovolcano of 1,633 metres, in northwestern Costa Rica.',

  'old-havana': 'The downtown of Havana, holding the core of the original walled city.',
  copan:
    'A Maya archaeological site in western Honduras, near the Guatemalan border, unexcavated until the 19th century.',
  'machu-picchu':
    'A 15th-century Inca citadel on a mountain ridge at 2,430 metres, 80 kilometres northwest of Cusco.',
  'nazca-lines':
    'Geoglyphs scraped into the desert floor between 500 BC and 500 AD, by lifting the pebbles to show the lighter dirt beneath.',
  'rainbow-mountain-peru':
    'Vinicunca, the mountain of seven colours: an Andean peak of 5,036 metres, striped by its own mineral bands.',
  'christ-the-redeemer':
    'An Art Deco Jesus above Rio, sculpted by Paul Landowski and engineered by Heitor da Silva Costa.',
  'sugarloaf-mountain':
    'A peak of 396 metres at the mouth of Guanabara Bay, named for its likeness to a loaf of refined sugar.',
  'iguazu-falls':
    'The largest waterfall system in the world, on the Iguazu River where Argentina meets Brazil.',
  'perito-moreno-glacier':
    'A glacier in Los Glaciares National Park, in the southwest of Argentine Patagonia.',
  'obelisco-de-buenos-aires':
    'Raised in 1936 in the Plaza de la República, where Corrientes crosses 9 de Julio.',
  'salar-de-uyuni':
    'The largest salt flat in the world — 10,582 square kilometres of it, near the crest of the Andes.',
  'angel-falls':
    "The world's tallest uninterrupted waterfall: 979 metres, dropping off the edge of Auyán-tepui.",
  'easter-island':
    'A Chilean island at the southeastern corner of the Polynesian Triangle, bearing nearly 1,000 moai.',
  'torres-del-paine':
    'Mountains, glaciers, lakes and rivers in southern Chilean Patagonia, around the Cordillera del Paine.',
  'valle-de-la-luna-chile':
    'Stone and sand carved by wind and water in the Atacama, west of San Pedro.',
  'ciudad-perdida':
    'A city in the Sierra Nevada de Santa Marta, thought founded around 800 AD — older than Machu Picchu.',
  'galapagos-islands':
    'Volcanic islands on the equator, 898 kilometres west of South America, forming a province of Ecuador.',
  'fish-river-canyon':
    'The largest canyon in Africa: a ravine 160 kilometres long and up to 27 wide, in southern Namibia.',
  'bandiagara-escarpment':
    'A sandstone cliff 150 kilometres long, rising 500 metres over the flats. The Dogon live along it.',
  'larabanga-mosque':
    'The oldest mosque in Ghana and among the oldest in West Africa — the "Mecca of West Africa".',
  nyiragongo:
    'An active stratovolcano of 3,470 metres in the Virunga Mountains, inside Virunga National Park.',
  'lake-malawi':
    'The southernmost lake of the East African Rift, shared by Malawi, Mozambique and Tanzania.',
  'avenue-of-the-baobabs':
    "Grandidier's baobabs lining an unpaved road through the Menabe region of western Madagascar.",
  'kasubi-tombs':
    'The burial ground of four kabakas — kings of Buganda — and a spiritual and political centre for the Ganda.',
  'basilica-of-our-lady-of-peace':
    'Guinness lists it as the largest church in the world. It stands in Yamoussoukro, the administrative capital.',
  aldabra: "The world's second-largest coral atoll, 1,120 kilometres from the Seychelles capital.",
  'erg-chebbi': 'A sea of wind-blown dunes on the far western edge of the Sahara.',
  'debre-damo':
    'A 6th-century monastery on a flat-topped mountain — an amba — in the Tigray Region.',
  'loango-national-park':
    'Coastal habitats in western Gabon, taking in the Iguéla Lagoon — the only protected example of a typical West African lagoon system.',
  'dome-of-the-rock':
    'An octagonal shrine on the Temple Mount, and the oldest surviving work of Islamic architecture.',
  baalbek:
    "A city in Lebanon's Beqaa Valley, east of the Litani and 67 kilometres northeast of Beirut.",
  'jeita-grotto':
    'Two interconnected limestone caves running nearly nine kilometres through the Nahr al-Kalb valley.',
  'umayyad-mosque':
    'The Great Mosque of Damascus: among the largest and oldest mosques in the world.',
  'sheikh-lotfollah-mosque':
    'Built on the eastern side of Naqsh-e Jahan Square between 1602 and 1619.',
  'gates-of-hell-darvaza':
    'A collapsed natural gas field near Darvaza. Hundreds of fires light its floor and rim.',
  'gergeti-trinity-church':
    'A church at 2,170 metres above the Chkheri, near the village of Stepantsminda.',
  'tatev-monastery': 'A 9th-century Armenian Apostolic monastery on a basalt plateau in Syunik.',
  'maiden-tower-baku':
    "A 12th-century monument in the Old City, listed with the Shirvanshahs' Palace in 2001.",
  'bagrati-cathedral': 'An 11th-century cathedral at Kutaisi, in the Imereti region.',
  'ark-of-bukhara':
    'A fortress first occupied around the 5th century AD; the structure standing today grew under the Shaybanids.',
  'charyn-canyon':
    'A canyon 154 kilometres long on the Charyn River, 200 kilometres east of Almaty.',
  'banaue-rice-terraces':
    'Terraces cut into the mountains of Ifugao by the ancestors of the Igorot, largely by hand.',
  'chocolate-hills':
    'At least 1,260 hills across more than 50 square kilometres of Bohol, their grass turning brown in the dry season.',
  'kuang-si-falls': 'A multi-tiered waterfall 29 kilometres south of Luang Prabang.',
  'pha-that-luang':
    'A gold-covered Buddhist stupa in Vientiane, held to date from the 3rd century AD and rebuilt many times since.',
  'sultan-omar-ali-saifuddin-mosque':
    'One of the two state mosques of Brunei, in the capital Bandar Seri Begawan.',
  'nan-madol': 'The capital of the Saudeleur dynasty, built on the eastern shore of Pohnpei.',
  'rock-islands':
    'Between 250 and 300 limestone and coral uprises in the Southern Lagoon of Palau.',

  kotor:
    'A walled Mediterranean port, historically Cattaro, tucked into a secluded arm of its bay.',
  ohrid: 'The largest city on Lake Ohrid, once said to have 365 churches — one for every day.',
  gjirokaster:
    'A city at 300 metres in a valley between the Gjerë mountains and the Drino. Its old town is a World Heritage Site.',
  'cesky-krumlov': 'A town on a bend of the Vltava, in the foothills of the Bohemian Forest.',
  'trakai-island-castle':
    'A stone castle on an island in Lake Galvė, begun by Kęstutis and finished around 1409 by his son Vytautas the Great.',
  'rundale-palace':
    'One of two great Baroque palaces built for the Dukes of Courland, raised in two spells between 1736 and 1768.',
  'tallinn-old-town': 'A 13th-century city plan preserved whole, medieval and Hanseatic in origin.',
  'mir-castle': 'A fortified castle in Grodno Oblast, 29 kilometres from the castle at Nesvizh.',
  'palace-of-culture-and-science':
    'A 237-metre high-rise in central Warsaw, the second tallest building in Poland.',
  'saint-tropez': 'A commune of the French Riviera, in the Var, between Nice and Marseille.',
  'rock-of-gibraltar':
    'A limestone monolith 426 metres high, standing over the western entrance to the Mediterranean.',
  valletta:
    'The capital of Malta, set between the Grand Harbour and Marsamxett Harbour. Its population is 5,157.',
  'casa-batllo':
    "One of Gaudí's masterpieces: a Barcelona house he redesigned in 1904 rather than built from nothing.",
  cotopaxi:
    'An active stratovolcano and the second highest summit in Ecuador, 50 kilometres south of Quito.',
  'los-roques':
    'About 350 islands, cays and islets, 128 kilometres north of the port of La Guaira.',
  'kaieteur-falls':
    'One of the most powerful single-drop waterfalls in the world — 226 metres over a sandstone lip on the Potaro.',
  'jesuit-missions-of-the-guaranis':
    'Settlements for the Guaraní straddling what are now the borders of Argentina, Brazil and Paraguay.',
  'colonia-del-sacramento':
    'One of the oldest towns in Uruguay, on the Río de la Plata, facing Buenos Aires across the water.',
  'death-road-bolivia':
    'The Yungas Road: 64 kilometres from La Paz into the Yungas, cut by the Bolivian government in the 1930s.',
  'casa-de-la-vall': 'The seat of the General Council of Andorra until 2011.',
  vallnord: 'A ski and snowboard resort in the Pyrenees, close to the border with Spain.',
  'st-peter-s-square':
    'The plaza before the basilica, both named for the apostle. It lies west of the Borgo.',
  'sistine-chapel':
    'The Cappella Magna, built between 1473 and 1481 for Pope Sixtus IV, who gave it his name.',
  'vaduz-castle':
    'The residence of the Prince of Liechtenstein, on a hilltop above the town it named.',
  'cricova-winery':
    'A Moldovan winery 15 kilometres north of Chișinău, famous for its wine cellars.',
  'monte-carlo-casino':
    'A casino, the Opéra de Monte-Carlo, and the offices of Les Ballets de Monte-Carlo, under one roof.',
  'prince-s-palace-of-monaco':
    'Built in 1191 as a Genoese fortress, and bombarded and besieged by foreign powers ever since.',
  guaita:
    'One of three towered peaks above the city of San Marino. The others are Cesta and Montale.',
  'three-towers-of-san-marino':
    'Three towers on the three peaks of Monte Titano, drawn on both the flag and the coat of arms.',
  'church-of-saint-sava':
    'The fourth largest Eastern Orthodox church in the world, and among the largest anywhere by volume.',
  'petrovaradin-fortress':
    "The Gibraltar of the Danube: a bastion fortress on the river's right bank at Novi Sad.",
  'bratislava-castle':
    'A rectangular castle with four corner towers, on a rocky hill of the Little Carpathians above the Danube.',
  'spis-castle':
    'One of the six largest castle sites in Slovakia, ruined above the town of Spišské Podhradie.',
  'rugova-canyon':
    'A river canyon in the Albanian Alps of western Kosovo, near the Montenegrin border.',
  'gracanica-monastery': 'A Serbian Orthodox monastery built by King Stefan Milutin in 1321.',
  'dead-sea':
    'A landlocked salt lake in the Jordan Rift Valley, fed by the Jordan River and with no way out.',
  'wave-rock':
    'A granite formation shaped like a breaking wave, 15 metres high and 110 long, on the side of Hyden Rock.',
  'pink-lake-hillier':
    'A saline lake on Middle Island, in the Recherche Archipelago off the south coast of Western Australia.',
  'zhangye-danxia':
    'A geopark of 322 square kilometres in Gansu, its rock laid down in coloured bands.',
  'jiuzhaigou-valley':
    'A long valley running north to south in northern Sichuan, a Biosphere Reserve and a World Heritage Site.',
  'reed-flute-cave':
    'The Palace of Natural Arts, at Guilin — named for the reeds outside, which make good flutes.',
  trolltunga:
    'A cliff at 1,126 metres that juts straight out from the mountain, some 700 metres above the water.',
  preikestolen:
    'A steep cliff rising 604 metres above the Lysefjorden, flat on top for about 25 metres square.',
  vatnajokull:
    'The largest ice cap in Iceland, covering roughly 8% of the country, and the second largest in Europe.',
  skogafoss:
    'A waterfall on the Skógá, dropping over cliffs that were the coastline until the sea drew back five kilometres.',
  'antelope-canyon':
    'A slot canyon on Navajo land east of Lechee, its upper section known as The Crack.',
  dettifoss:
    'On the Jökulsá á Fjöllum, and reputed to be the second most powerful waterfall in Europe after the Rhine Falls.',
  'marble-caves-chile-chico':
    'On General Carrera Lake, a deep Patagonian water shared by Chile and Argentina. Its own name is Chelenko — storm.',
  'mount-roraima':
    'The highest of the Pacaraima tepuis, where Brazil, Guyana and Venezuela meet. Cliffs of 400 to 1,000 metres ring its flat top.',
  'cano-cristales':
    'A river in the Serranía de la Macarena, a tributary of the Guayabero and part of the Orinoco basin.',
  'sahara-desert':
    'The largest hot desert in the world at 9,200,000 square kilometres — outsized only by Antarctica and the Arctic.',
  'lake-baikal':
    'The deepest lake in the world, in southern Siberia, and a rift lake still pulling itself apart.',
  'valley-of-geysers':
    'A six-kilometre basin on Kamchatka holding some ninety geysers — the second-largest concentration in the world.',
  'ngorongoro-crater':
    'A protected area in the Crater Highlands of northeastern Tanzania, 180 kilometres west of Arusha.',

  sundarbans:
    'Mangrove forest in the Ganges Delta, where the Ganges, Brahmaputra and Meghna meet the Bay of Bengal.',
  'phang-nga-bay':
    'Four hundred square kilometres of the Andaman Sea between Phuket and the mainland, much of it a national park since 1981.',
  'waitomo-glowworm-caves':
    'Chambers lit by Arachnocampa luminosa, a glowworm found nowhere but New Zealand.',
  'franz-josef-glacier':
    'A temperate maritime glacier 12 kilometres long, on the West Coast of the South Island.',
  aogashima:
    'A volcanic island, the southernmost and most isolated inhabited island of the Izu chain.',
  'verdon-gorge':
    'A canyon 25 kilometres long and up to 700 metres deep, cut by the Verdon — a river named for its turquoise water.',
  'saxon-switzerland':
    'A climbing area and national park in the Elbe Sandstone Mountains, southeast of Dresden.',
  durmitor:
    'A massif of the Dinaric Alps, its highest peak Bobotov Kuk at 2,523 metres, hemmed by the Tara and Piva canyons.',
  'aggtelek-caves':
    'Over a thousand karst caves spread across 55,800 hectares along the border of Hungary and Slovakia.',
  'paro-taktsang':
    "One of thirteen Tiger's Nest caves where Padmasambhava practised and taught, clinging to a cliff of the upper Paro valley.",
  'ziggurat-of-ur':
    'A Neo-Sumerian ziggurat named Etemenniguru — "the house whose foundation creates terror" — near Nasiriyah.',
  'western-wall': 'An ancient retaining wall of the Temple Mount. Jews call it the Kotel.',
  'badshahi-mosque':
    'An imperial Mughal mosque raised in Lahore between 1671 and 1673 under Aurangzeb, facing the Lahore Fort.',
  'erdene-zuu-monastery':
    'Probably the earliest surviving Buddhist monastery in Mongolia, built in 1585 at Kharkhorin.',
  kourion:
    'A Greek city-state on the southwest coast of Cyprus, settled from Argos after the Mycenaean palaces fell.',
  shibam:
    'Some 7,000 people live in mudbrick high-rises inside the old walls, in a valley of eastern Yemen.',
  'male-friday-mosque': 'Completed in 1658, and the oldest mosque in the Maldives.',
  'qal-at-al-bahrain':
    'Excavations since 1954 have dug antiquities out of an artificial mound 12 metres high.',
  'kuwait-towers':
    'Three towers on a promontory into the Persian Gulf — the last of a 34-tower water system.',
  'fann-mountains': 'Part of the western Pamir-Alay, between the Zarafshan Range and the Gissar.',
  'mount-kumgang':
    'A mountain of the Taebaek range, lying across counties in both North and South Korea.',
  'cristo-rei-of-dili': 'A Christ 27 metres high, standing on a globe at Cape Fatucama.',
  'matobo-hills':
    'Granite kopjes and wooded valleys south of Bulawayo, the rock forced to the surface over two billion years ago.',
  'mount-cameroon':
    'An active stratovolcano by the Gulf of Guinea. Its higher peak is called Fako.',
  'ennedi-massif':
    'A plateau in the northeast of Chad, part of the mountains known as the Ennedi Massif.',
  massawa:
    'A Red Sea port at the northern end of the Gulf of Zula, beside the Dahlak Archipelago, and important for centuries.',
  'lake-assal':
    'A crater lake at the top of the Great Rift Valley, 120 kilometres west of Djibouti city.',
  'maletsunyane-falls':
    'A single drop of 192 metres, by the town of Semonkong — the place of smoke, named for the falls.',
  'basilique-sainte-anne-du-congo': 'A monumental Catholic church in Brazzaville.',
  'chutes-de-la-karera':
    'Six branches of falling water on three landings, spread over 142 hectares of southeastern Burundi.',
  'mount-karthala':
    'An active shield volcano and the highest point of the Comoros, at 2,361 metres.',
  'pico-cao-grande':
    'A needle of volcanic rock, its summit 663 metres up and rising 370 metres clear of the forest.',
  'pico-basile':
    'The tallest mountain in Equatorial Guinea, 3,011 metres, the highest of three shield volcanoes that made Bioko.',
  'le-morne-brabant':
    'A basaltic monolith 556 metres high, on a peninsula at the southwestern tip of Mauritius.',
  chinguetti:
    'A ksar on the Adrar Plateau, founded in the 13th century where several trans-Saharan trade routes crossed.',
  'leptis-magna':
    'A Punic settlement before 500 BC, then a great city of Carthage and of Roman Libya, at the mouth of the Wadi Lebda.',
  'kalandula-falls':
    'On the Lucala: 105 metres high and 400 wide, among the largest waterfalls in Africa.',
  ganvie:
    'A village of some 20,000 people standing in Lake Nokoué — probably the largest lake village in Africa.',
  'ruins-of-loropeni':
    "A medieval site in southern Burkina Faso, and the country's first World Heritage listing.",
  'stone-circles-of-senegambia':
    'Megalithic circles scattered across 30,000 square kilometres of the Gambia and central Senegal.',
  koutammakou:
    'The Land of the Batammariba, on the Togo–Benin border, and its traditional mud tower-houses.',
  'island-of-mozambique':
    'Capital of Portuguese East Africa until 1898, lying between the Mozambique Channel and Mossuril Bay.',
  'olumo-rock':
    'A natural fortress in the inter-tribal wars of the 19th century, at Abeokuta. Its patron spirit is an orisha.',
  agadez:
    'The fifth largest city in Niger, out in the Sahara, and the capital of the Sultanate of Agadez.',
  bangui: 'Founded as a French outpost in 1889, on the northern bank of the Ubangi that named it.',
  'cidade-velha':
    'Founded by Portuguese traders in 1462: the oldest settlement in Cape Verde, and its former capital.',
  'house-of-slaves':
    'A museum and memorial to the Atlantic slave trade on Gorée Island, three kilometres off Dakar. Its Door of No Return faces the sea.',
  'freetown-cotton-tree':
    'A kapok tree that mattered from 1792, when formerly enslaved African Americans who had won freedom fighting for the British settled beneath it.',
  lobamba: 'A town between the two main cities of Eswatini, Mbabane and Manzini.',
  'mogadishu-cathedral':
    'Seat of the Diocese of Mogadiscio from 1928 to 1991. Built by Italian colonial authorities, and largely destroyed in 2008.',
  monrovia: 'The capital of Liberia, on the Atlantic at Cape Mesurado.',
  juba: 'The capital of South Sudan, on the White Nile — the most recently declared national capital in the world.',
  'nelson-s-dockyard':
    'The only continuously working Georgian dockyard anywhere, in English Harbour.',

  'molinere-underwater-sculpture-park':
    'Contemporary sculpture sunk into the Caribbean off western Grenada, by Jason deCaires Taylor.',
  'brimstone-hill-fortress':
    'A well-preserved fortress on a hill of St. Kitts, in the eastern Caribbean.',
  'dunn-s-river-falls': 'A waterfall near Ocho Rios.',
  'citadelle-laferriere':
    "An early-19th-century fortress on the Bonnet à l'Evêque mountaintop, above Milot in the north of Haiti.",
  'colonial-city-of-santo-domingo':
    'The oldest continuously inhabited European settlement in the Americas.',
  'joya-de-ceren':
    'A Maya farming village 36 kilometres northwest of San Salvador, buried and preserved — the Pompeii of the Americas.',
  'granada-nicaragua':
    "One of Nicaragua's most historically important cities, and the capital of its department.",
  xunantunich:
    'A Maya site on a ridge above the Mopan, 110 kilometres west of Belize City and within sight of Guatemala.',
  'nassau-bahamas':
    'The capital, on New Providence — an island holding nearly three quarters of the entire population.',
  'morne-trois-pitons-national-park':
    "Dominica's first national park, established in 1975 and named for its highest mountain.",
  'bathsheba-barbados':
    'The main fishing village of Saint Joseph parish, on the east coast, with some 5,000 people.',
  'mount-yasur':
    'An active volcano 361 metres high on the coast of Tanna Island, its cone almost bare of plants.',
  'kokoda-track':
    'Ninety-six kilometres of single-file path through the Owen Stanley Range — sixty as the crow flies. The 1942 campaign was fought along it.',
  'ha-amonga-a-maui':
    'A stone trilithon on Tongatapu, raised in the 13th century by King Tuʻitātui in honour of his two sons.',
  'yasawa-islands': 'About twenty volcanic islands in the Western Division of Fiji.',
  'kennedy-island':
    'An uninhabited island of 1.17 hectares, named for John F. Kennedy after an incident in his wartime naval career.',
  bubaque: 'One of the Bijagós Islands, and the name of its main town.',
  kiritimati:
    'A Pacific atoll of the northern Line Islands. The name is simply "Christmas", written in Gilbertese.',
  'buada-lagoon':
    'A landlocked, slightly brackish lake of 3.8 hectares — an endorheic lake, with no way out to the sea.',
  'central-suriname-nature-reserve': 'Tropical rainforest, preserved in pristine condition.',
  funafuti:
    'The capital atoll of Tuvalu. More people live here than in all the rest of the country combined.',

  // These eight needed a `qid` pin on their seed: the name search was finding a
  // person, a cricket team, a climbing spike, a university, the wrong Cartagena.
  'grand-duke-s-palace-luxembourg':
    'The official residence of the grand duke, where he performs most of his duties as head of state. He actually lives at Berg Castle.',
  'twelve-apostles':
    'Limestone stacks off Port Campbell, by the Great Ocean Road. Despite the name, there may never have been twelve.',
  'el-castillo-san-salvador': 'A fortress at the entrance to the bay of Havana.',
  'cartagena-walled-city':
    'A major port on the Caribbean coast of Colombia, and once a link in the route to the West Indies.',
  'band-e-amir':
    "Afghanistan's first national park, declared in 2009 to protect a chain of six intensely blue lakes, dammed by nature high in the Hindu Kush.",
  'sultan-qaboos-grand-mosque':
    'Completed in Muscat in 2001, the largest mosque in Oman. Twenty thousand worshippers fit inside.',
  pitons:
    'Two volcanic spires linked by the Piton Mitan ridge — Gros Piton at 798 metres, Petit Piton at 743.',
  'mount-nimba':
    "A strict nature reserve of 175.4 square kilometres, straddling Guinea and Côte d'Ivoire.",
}
