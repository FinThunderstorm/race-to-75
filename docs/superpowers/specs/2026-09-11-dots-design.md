# DOTS-mittari ja Ihmisarvon pisteytys

Tila: toteutettu ja tarkistettu käyttäjän hyväksymän suunnitelman pohjalta.

## Käyttö

- Kisaprofiiliin lisätään sukupuoli: Mies / Nainen. Vanhoille käyttäjille
  ei oleteta arvoa. Valinta tarvitaan DOTS-laskentaan.
- Asetuksiin lisätään SBD-tuloksen kirjaus: kyykky, penkkipunnerrus ja
  maastaveto kilogrammoina, tuloksen päivämäärä sekä kehonpaino.
- Kehonpaino esitäytetään viimeisimmästä punnituksesta tulospäivänä tai
  sitä ennen. Käyttäjä voi korjata painon. Päivämäärän vaihtuessa esitäyttö
  päivitetään, ellei käyttäjä ole itse muuttanut painoa.
- Kehonpaino tallennetaan tuloksen yhteyteen. Myöhemmät punnitukset eivät
  muuta aiempia DOTS-tuloksia. Puuttuva paino pyydetään syöttämään.
- Kaikki kolme nostoa ovat pakollisia, positiivisia arvoja. Lomake näyttää
  yhteistuloksen ja DOTS-esikatselun. Tallennettuja omia tuloksia voi poistaa
  ja kirjata uudelleen muiden mittareiden käytännön mukaisesti.

## Näkymä ja tasot

DOTS lisätään omaksi mittarikseen ennen Ihmisarvoa. Se näkyy historiassa,
tulostaulukossa, esimerkkidatassa, automaattisessa kierrossa ja yhteisnäytössä.
Suurempi DOTS on parempi. Näytetään yksi desimaali sekä saavutettu taso;
taso ratkaistaan pyöristämättömästä luvusta. Tasorajat ovat käyttäjän antamat
sovelluksen vertailurajat:

| Taso | Mies | Nainen |
| --- | --- | --- |
| Novice | 200 | 150 |
| Intermediate | 300 | 250 |
| Advanced | 400 | 325 |
| Elite / National Level | 500 | 400 |

Ensimmäisen rajan alla näytetään “Alle Novice-tason”. Näkymässä on molempien
sukupuolten rajataulukko. DOTS ei vaadi pituutta. Puuttuvan sukupuolen kohdalla
näytetään ohje täydentää profiili. Ihmisarvo on neljän tasapainotetun osapisteen aritmeettinen keskiarvo:
`(5 × hauisindeksi + BMI-indeksi + verenpaineindeksi + DOTS-osapisteet) / 4`.
DOTS-osapisteet = `100 × DOTS / Novice-raja` (200 miehillä, 150 naisilla).
Hauiksen kiinteä perustaso on ympärys 20 % pituudesta (hauisindeksi 20),
BMI:n ja verenpaineen nykyinen täysien pisteiden alue tuottaa 100 pistettä.
Kaikkien neljän perustasolla Ihmisarvo on 100 kp. Kullakin mittarilla on 25 %
paino; kymmenen osapisteen muutos muuttaa kokonaisarvoa 2,5 kp. Tämä kiinteä
pelillinen perustaso ei väitä olevansa väestön tai käyttäjäryhmän tilastollinen
keskiarvo. Pisteitä ei rajata sataan. DOTS Novicea alempana laskee ja ylempänä
nostaa pisteitä suhteessa perustasoon.

Uusi kaava korvaa aiemman tulokaavan myös historiassa. Kaikki neljä mittaria,
pituus ja sukupuoli tarvitaan; puuttuvista tiedoista ei muodosteta osittaista
tulosta. DOTS:n viimeisin päiväkeskiarvo kulkee mukana samoin kuin muut
komponentit, eikä tulevaisuuden mittauksia käytetä aiempien päivien laskentaan.
Yhteenvedossa näytetään normalisoidut osapisteet ja lähdemittausten päivät.
Muiden mittareiden omien näkymien yksiköt ja indeksit säilyvät.

## Laskenta ja tietorakenne

DOTS = (kyykky + penkki + maastaveto) × sukupuolen ja kehonpainon DOTS-kerroin.
Kaava ja painon rajaus noudattavat
[OpenPowerliftingin toteutusta](https://gitlab.com/openpowerlifting/opl-data/blob/main/crates/coefficients/src/dots.rs).
Laskentaa varten paino rajataan miehillä 40–210 kg ja naisilla 40–150 kg;
alkuperäinen syötetty paino säilytetään. Rajauksesta kerrotaan esikatselussa.

Lisätään migraatiolla käyttäjän nullable-sukupuoli ja `sbd_measurement`-taulu:
käyttäjä, päivämäärä, kolme nostoa, kehonpaino ja luontiaika. Profiilin valinnan
korjaaminen laskee DOTS-historian uudelleen. Nostot hyväksytään väliltä
0,1–1000 kg ja paino väliltä 1–500 kg, enintään yhden desimaalin tarkkuudella.
Päivämäärä ei saa olla tulevaisuudessa (UTC).

Omat listaus-, lisäys- ja poistorajapinnat käyttävät nykyistä aktiivisen
käyttäjän ja omistajuuden tarkistusta. Ryhmän ja yhteisnäytön rajapintoihin
lisätään laskennan tarvitsemat tiedot. DOTS lasketaan jokaiselle tulokselle
ennen nykyistä päivä- ja viikkokeskiarvojen muodostamista.

Vaihtoehtona painon tallentamiselle olisi aina johtaa paino historiasta.
Se vähentäisi tallennettavaa tietoa, mutta historian tuonnit ja poistot
muuttaisivat vanhoja DOTS-lukuja. Tuloksen yhteyteen tallennettava,
esitäytetty paino on suositus.

## Tarkistus toteutuksessa

Testataan molempien sukupuolten tunnetut laskentaesimerkit, painon rajaus,
tasorajojen tasan-arvot ja pyöristys, puuttuva sukupuoli, syötteiden validointi,
omistajuus, historian aikajärjestys ja päivä-/viikkokoosteet. Selaintesteillä
varmistetaan profiilin tallennus, SBD-kirjaus, painon esitäyttö, poisto ja
DOTS-näkymä. Lopuksi ajetaan projektin buildit ja asiaankuuluvat tarkistukset.
