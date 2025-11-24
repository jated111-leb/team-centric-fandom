export const FEATURED_TEAMS = [
  // Spanish Teams
  'Real Madrid CF',
  'FC Barcelona',
  'Atlético de Madrid',
  'Sevilla FC',
  
  // English Teams
  'Manchester City FC',
  'Liverpool FC',
  'Arsenal FC',
  'Manchester United FC',
  'Chelsea FC',
  'Tottenham Hotspur FC',
  
  // Italian Teams
  'Juventus FC',
  'AC Milan',
  'Inter Milan',
  'SSC Napoli',
  'AS Roma',
  
  // German Teams
  'FC Bayern München',
  'Borussia Dortmund',
  'RB Leipzig',
  
  // French Teams
  'Paris Saint-Germain FC',
  'Olympique de Marseille',
  'Olympique Lyonnais',
  
  // Other Notable Teams
  'AFC Ajax',
  'SL Benfica',
] as const;

export type FeaturedTeam = typeof FEATURED_TEAMS[number];
