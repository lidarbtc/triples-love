-- Give unclaimed listings a light default; preserve every owner's selected theme.
UPDATE projects SET theme = 'light'
WHERE theme = 'auto'
  AND NOT EXISTS (SELECT 1 FROM project_owners WHERE project_id = projects.id);
