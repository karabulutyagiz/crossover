// Seed clubs for the Wikidata ingest.
//
// Strategy: for each seed club we pull every player who ever played there, plus
// each of those players' FULL club history. That naturally builds dense
// cross-links between clubs. The more seeds, the more players + teams we cover.
//
// `qid` is optional: if omitted, the ingester resolves it from the name via
// wbsearchentities (preferring entries described as football clubs). A few
// seeds may mis-resolve, but searchClubs ranks by member count at query time,
// so the canonical club still wins.

export interface SeedClub {
  name: string;
  qid?: string;
}

export const SEED_CLUBS: SeedClub[] = [
  // ---- Türkiye ----
  { name: 'Galatasaray S.K.', qid: 'Q495299' },
  { name: 'Fenerbahçe S.K.' },
  { name: 'Beşiktaş J.K.' },
  { name: 'Trabzonspor' },
  { name: 'İstanbul Başakşehir F.K.' },
  { name: 'Antalyaspor' },
  { name: 'Konyaspor' },
  { name: 'Sivasspor' },
  { name: 'Kayserispor' },
  { name: 'Bursaspor' },
  { name: 'Gaziantep FK' },
  { name: 'Alanyaspor' },

  // ---- England ----
  { name: 'Manchester United F.C.' },
  { name: 'Manchester City F.C.' },
  { name: 'Liverpool F.C.' },
  { name: 'Arsenal F.C.' },
  { name: 'Chelsea F.C.' },
  { name: 'Tottenham Hotspur F.C.' },
  { name: 'Newcastle United F.C.' },
  { name: 'Aston Villa F.C.' },
  { name: 'Everton F.C.' },
  { name: 'West Ham United F.C.' },
  { name: 'Leeds United F.C.' },
  { name: 'Leicester City F.C.' },
  { name: 'Nottingham Forest F.C.' },
  { name: 'Southampton F.C.' },
  { name: 'Wolverhampton Wanderers F.C.' },
  { name: 'Sunderland A.F.C.' },
  { name: 'Derby County F.C.' },

  // ---- Scotland ----
  { name: 'Celtic F.C.' },
  { name: 'Rangers F.C.' },
  { name: 'Aberdeen F.C.' },

  // ---- Spain ----
  { name: 'Real Madrid CF' },
  { name: 'FC Barcelona' },
  { name: 'Atlético Madrid' },
  { name: 'Valencia CF' },
  { name: 'Sevilla FC' },
  { name: 'Real Betis' },
  { name: 'Real Sociedad' },
  { name: 'Athletic Bilbao' },
  { name: 'Villarreal CF' },
  { name: 'Celta de Vigo' },
  { name: 'Real Zaragoza' },

  // ---- Italy ----
  { name: 'Inter Milan' },
  { name: 'AC Milan' },
  { name: 'Juventus FC' },
  { name: 'AS Roma' },
  { name: 'SSC Napoli' },
  { name: 'SS Lazio' },
  { name: 'ACF Fiorentina' },
  { name: 'Atalanta BC' },
  { name: 'Torino FC' },
  { name: 'UC Sampdoria' },
  { name: 'Bologna FC' },
  { name: 'Genoa CFC' },
  { name: 'Parma Calcio' },

  // ---- Germany ----
  { name: 'FC Bayern Munich' },
  { name: 'Borussia Dortmund' },
  { name: 'Bayer 04 Leverkusen' },
  { name: 'FC Schalke 04' },
  { name: 'RB Leipzig' },
  { name: 'Eintracht Frankfurt' },
  { name: 'Borussia Mönchengladbach' },
  { name: 'VfB Stuttgart' },
  { name: 'Werder Bremen' },
  { name: 'VfL Wolfsburg' },
  { name: 'Hamburger SV' },
  { name: '1. FC Köln' },

  // ---- France ----
  { name: 'Paris Saint-Germain F.C.' },
  { name: 'Olympique de Marseille' },
  { name: 'Olympique Lyonnais' },
  { name: 'AS Monaco FC' },
  { name: 'LOSC Lille' },
  { name: 'OGC Nice' },
  { name: 'FC Girondins de Bordeaux' },
  { name: 'AS Saint-Étienne' },
  { name: 'FC Nantes' },
  { name: 'RC Lens' },

  // ---- Netherlands / Belgium / Portugal ----
  { name: 'AFC Ajax' },
  { name: 'PSV Eindhoven' },
  { name: 'Feyenoord' },
  { name: 'AZ Alkmaar' },
  { name: 'FC Twente' },
  { name: 'RSC Anderlecht' },
  { name: 'Club Brugge KV' },
  { name: 'Standard Liège' },
  { name: 'FC Porto' },
  { name: 'SL Benfica' },
  { name: 'Sporting CP' },
  { name: 'SC Braga' },

  // ---- Greece / Russia / Ukraine ----
  { name: 'Olympiacos F.C.' },
  { name: 'Panathinaikos F.C.' },
  { name: 'AEK Athens F.C.' },
  { name: 'PAOK FC' },
  { name: 'FC Zenit Saint Petersburg' },
  { name: 'PFC CSKA Moscow' },
  { name: 'FC Spartak Moscow' },
  { name: 'FC Shakhtar Donetsk' },
  { name: 'FC Dynamo Kyiv' },

  // ---- Brazil ----
  { name: 'CR Flamengo' },
  { name: 'SE Palmeiras' },
  { name: 'Sport Club Corinthians Paulista' },
  { name: 'São Paulo FC' },
  { name: 'Santos FC' },
  { name: 'Grêmio' },
  { name: 'SC Internacional' },
  { name: 'Cruzeiro EC' },
  { name: 'CR Vasco da Gama' },
  { name: 'Fluminense FC' },
  { name: 'Botafogo de Futebol e Regatas' },
  { name: 'Clube Atlético Mineiro' },

  // ---- Argentina ----
  { name: 'Boca Juniors' },
  { name: 'River Plate' },
  { name: 'Club Atlético Independiente' },
  { name: 'Racing Club de Avellaneda' },
  { name: 'San Lorenzo de Almagro' },
  { name: 'Estudiantes de La Plata' },
  { name: 'Vélez Sarsfield' },

  // ---- Mexico / USA ----
  { name: 'Club América' },
  { name: 'C.D. Guadalajara' },
  { name: 'Cruz Azul' },
  { name: 'Tigres UANL' },
  { name: 'C.F. Monterrey' },
  { name: 'LA Galaxy' },
  { name: 'Inter Miami CF' },
  { name: 'Seattle Sounders FC' },

  // ---- Saudi Arabia ----
  { name: 'Al-Hilal SFC' },
  { name: 'Al-Nassr FC' },
  { name: 'Al-Ittihad Club' },
  { name: 'Al-Ahli Saudi FC' },
];
