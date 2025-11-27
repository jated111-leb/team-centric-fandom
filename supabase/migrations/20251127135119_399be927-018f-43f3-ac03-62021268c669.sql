-- Add column to store exact Braze attribute values
ALTER TABLE featured_teams 
ADD COLUMN braze_attribute_value TEXT;

-- Populate with exact Braze values (10 teams total)
UPDATE featured_teams SET braze_attribute_value = 'Real Madrid' WHERE team_name = 'Real Madrid CF';
UPDATE featured_teams SET braze_attribute_value = 'FC Barcelona' WHERE team_name = 'FC Barcelona';
UPDATE featured_teams SET braze_attribute_value = 'Manchester City' WHERE team_name = 'Manchester City FC';
UPDATE featured_teams SET braze_attribute_value = 'Manchester United' WHERE team_name = 'Manchester United FC';
UPDATE featured_teams SET braze_attribute_value = 'Liverpool' WHERE team_name = 'Liverpool FC';
UPDATE featured_teams SET braze_attribute_value = 'Arsenal' WHERE team_name = 'Arsenal FC';
UPDATE featured_teams SET braze_attribute_value = 'Bayern Munich' WHERE team_name = 'FC Bayern München';
UPDATE featured_teams SET braze_attribute_value = 'Paris Saint-Germain' WHERE team_name = 'Paris Saint-Germain FC';
UPDATE featured_teams SET braze_attribute_value = 'Juventus' WHERE team_name = 'Juventus FC';
UPDATE featured_teams SET braze_attribute_value = 'Inter Milan' WHERE team_name = 'Inter Milan';