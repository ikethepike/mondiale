# Hand-traced empire keyframes

WGS84 FeatureCollections for keyframes that neither historical-basemaps nor
CShapes 2.0 can supply (polities that lived entirely between snapshot years,
and wartime occupation extents that were never de jure borders). Referenced
from `generators/data/empire-seeds.ts` via `{ source: 'handmade', file }`.

Geometry is deliberately coarse — these render as ghost-opacity blobs behind
a blur, not as authoritative borders. Aim for the recognisable outline, not
the treaty line. Keep rings counter-clockwise, no holes unless essential.

GeoJSON carries no comments, so provenance lives here — add a line per file:

| file | basis |
|---|---|
| abbasid-caliphate-762.geojson | Consolidation under al-Mansur, Baghdad founded: Ifriqiya through Egypt, the Levant, Arabia, Mesopotamia, Persia, Khurasan and Transoxiana to Sindh; al-Andalus and the Maghreb west of Ifriqiya already gone. |
| abbasid-caliphate-1200.geojson | The rump caliphate restored around Baghdad under al-Nasir — central Mesopotamia only, half a century before the Mongol sack. |
| gran-colombia-1819.geojson | Patriot-held interior after Boyacá (Aug 1819): eastern New Granada highlands, the llanos and Guayana up to the Orinoco delta; Caracas, the Caribbean ports, Panama and Quito still royalist. Traced from the Congress of Angostura literature. |
| gran-colombia-1822.geojson | After Carabobo (1821) and Pichincha (May 1822): all Venezuela and New Granada, Panama (adhered Nov 1821), Quito and Guayaquil. |
| gran-colombia-1826.geojson | Peak extent: modern Colombia, Venezuela, Ecuador and Panama, with the contested Guayaquil–Tumbes littoral held after 1822. |
| gran-colombia-1830.geojson | Dissolution: Venezuela (Jan 1830) and Ecuador (May 1830) gone; the rump New Granada with Panama. |
| inca-empire-1438.geojson | Cusco heartland at Pachacuti's accession: the Vilcanota/Apurímac valleys south to Lake Titicaca's northwest shore. |
| inca-empire-1572.geojson | Neo-Inca state at Vilcabamba, the montane pocket northwest of Cusco, in its final year. |
| portuguese-brazil-1560.geojson | Coastal captaincies from Paraíba to São Vicente, a settled littoral strip roughly 100–200 km deep; the interior still unentered. |
| aztec-empire-1428.geojson | Triple Alliance at its founding: the Valley of Mexico basin. |
| aztec-empire-1440.geojson | Early expansion under Moctezuma I: the Valley with Morelos and southern Hidalgo. |
| toltec-empire-1150.geojson | Shrunken hinterland of Tula at the city's mid-12th-century burning. |
| new-france-1608.geojson | St Lawrence valley strip at Quebec's founding, plus the Port Royal toehold in Acadia. |
| new-france-1712.geojson | Pre-Utrecht maximum: Canada, Acadia, the pays d'en haut and Louisiana to the Gulf; Hudson Bay drainage claims left off. |
| zulu-kingdom-1830.geojson | Post-Shaka height: the country between the Pongola and the Mzimkhulu, coast to the Drakensberg escarpment. |
| zulu-kingdom-1870.geojson | Zululand under Mpande/Cetshwayo: between the Tugela–Buffalo line and the Pongola. |
| almoravid-almohad-1150.geojson | Almohads under Abd al-Mu'min: Morocco and the western Maghreb to about Algiers, plus the Seville–lower Guadalquivir toehold taken 1147. |
| almoravid-almohad-1250.geojson | Almohad rump around Marrakesh and the High Atlas; Fez already Marinid. |
| sokoto-caliphate-1804.geojson | Opening years of the jihad: Gobir, Zamfara and Kebbi in northwest Hausaland. |
| akkadian-empire-bc2330.geojson | Sargon's union of Sumer and Akkad: the Tigris–Euphrates alluvium from the Gulf to the Kish region. |
| akkadian-empire-bc2250.geojson | Peak under Naram-Sin: both rivers from the Gulf through Upper Mesopotamia to the Ebla region, east into Susiana. |
| akkadian-empire-bc2200.geojson | Contraction under Shar-kali-sharri: the Mesopotamian core without the far west or Elam. |
| akkadian-empire-bc2150.geojson | Rump around Akkad and Kish under Gutian pressure. |
| neo-assyrian-empire-bc650.geojson | Ashurbanipal's maximum: Fertile Crescent plus the Nile to Thebes and the Elamite foothills. |
| neo-assyrian-empire-bc615.geojson | The heartland triangle (Assur–Nineveh–Harran) in the final years before Nineveh's fall. |
| neo-babylonian-empire-bc620.geojson | Nabopolassar's Babylonia proper at the revolt against Assyria. |
| neo-babylonian-empire-bc600.geojson | After Carchemish (605): Mesopotamia and the northern Levant; the south still contested. |
| neo-babylonian-empire-bc580.geojson | Peak under Nebuchadnezzar II: the Fertile Crescent to the Egyptian frontier after Jerusalem's fall. |
| neo-babylonian-empire-bc540.geojson | Eve of Cyrus, with Nabonidus's Arabian oasis corridor to Tayma. |
| achaemenid-empire-bc550.geojson | Cyrus after the conquest of Media: the Iranian plateau from Persis to the Halys approaches. |
| achaemenid-empire-bc335.geojson | The empire on the eve of Alexander's crossing: Egypt and Thrace-less Anatolia to Sogdiana and the Indus satrapies. |
| seleucid-empire-bc312.geojson | Seleucus's return to Babylon: Babylonia with the eastern satrapies to Bactria; Syria and Anatolia still Antigonid. |
| sasanian-empire-240.geojson | Ardashir I's realm: Iran and Mesopotamia at the overthrow of the Arsacids. |
| umayyad-caliphate-632.geojson | The Arabian peninsula under Medina at Muhammad's death. |
| umayyad-caliphate-661.geojson | Mu'awiya's accession: Arabia, the Levant, Egypt with Cyrenaica, Mesopotamia and Iran to Khorasan. |
| umayyad-caliphate-720.geojson | Near-maximum: the Maghreb to the Atlantic, al-Andalus (minus the Asturian fringe), Transoxiana and Sindh. |
| hittite-empire-bc1300.geojson | Peak after Qadesh: Anatolia with the Syrian corridor to Ugarit and the Qadesh region. |
| hittite-empire-bc1200.geojson | The central plateau core on the eve of the Bronze Age collapse. |
| seljuk-empire-1040.geojson | Khorasan after Dandanaqan, the victory that took the province from the Ghaznavids. |
| seljuk-empire-1080.geojson | Malik-Shah's empire: post-Manzikert Anatolia through Iran to the Transoxiana frontier, Damascus taken. |
| seljuk-empire-1180.geojson | The remnants: the Sultanate of Rum in Anatolia and the Iraq–Hamadan sultanate. |
| maurya-empire-bc250.geojson | Ashoka's extent per the edict distribution: the subcontinent and eastern Afghanistan, minus the Tamil far south. |
| gupta-empire-550.geojson | The last Guptas' Magadha–Bengal rump after the Huna wars. |
| timurid-empire-1370.geojson | Transoxiana consolidated at Timur's enthronement at Balkh. |
| tang-dynasty-618.geojson | The founding year: Guanzhong and the North China Plain. |
| empire-of-japan-1910.geojson | The empire at Korea's annexation: home islands, Korea, Taiwan (1895), Karafuto (1905). CShapes' Japan polygon never changes, hence hand-traced. |
| empire-of-japan-1933.geojson | The 1910 holdings plus occupied Manchuria (Manchukuo). |
| empire-of-japan-1942.geojson | Occupation high-water: plus coastal China, mainland Southeast Asia, the Philippines, Indonesia and the New Guinea north coast. |
| majapahit-1293.geojson | The founding kingdom in eastern Java. Absent from every basemap snapshot, hence a fully hand-traced arc. |
| majapahit-1365.geojson | The Nagarakretagama claims under Hayam Wuruk: Java, southeast Sumatra, the south Borneo coast, Bali and the western Lesser Sundas. |
| majapahit-1450.geojson | Java alone, the coastal sultanates rising. |
| majapahit-1520.geojson | The eastern Java remnant shortly before Demak ended the line. |
| macedonian-empire-bc336.geojson | Philip II's Macedon with Thrace and the League of Corinth hegemony at his death. |
| macedonian-empire-bc334.geojson | The same, plus western Anatolia after the Granicus. |
| macedonian-empire-bc330.geojson | After Gaugamela and Persepolis: Greece plus the conquered Achaemenid west to Persis. |
| kalmar-union-1520.geojson | Christian II's brief full reunion: Denmark, Norway, resubdued Sweden with Finland. |
| napoleonic-france-1807.geojson | The empire proper after Tilsit: France, Belgium, the left bank of the Rhine, Piedmont–Liguria. |
| napoleonic-france-1812.geojson | The 130 departments: to the Hanseatic coast, Tuscany and Rome, annexed Catalonia, the Illyrian Provinces. |
| third-reich-1942.geojson | Axis-held continent at the autumn 1942 high-water: Atlantic coast to the Volga bend and the Caucasus front, Norway, the Balkans; neutral Iberia, Sweden and Switzerland's pocket are outside the intent but the coarse ring swallows Switzerland. |
| third-reich-1946.geojson | Occupied Germany in its four zones, the lands east of the Oder–Neisse gone. |
