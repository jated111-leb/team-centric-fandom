-- Add unique constraint to team_translations to prevent duplicates
ALTER TABLE team_translations 
ADD CONSTRAINT team_translations_team_name_unique UNIQUE (team_name);