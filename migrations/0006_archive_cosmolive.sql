-- COSMO Live Stats has returned the GitHub Pages 404 page since cosmolivestats.html
-- was removed from henryyyzzz98/henryyyzzz98.github.io (last change 2026-10-05).
-- Keep its listing and saved screenshot in the archive. No web archive snapshot
-- exists, so archive_url stays empty. Descriptions change only if still the
-- original seeded text.
UPDATE projects
SET status = 'archived', archived_at = '2026-11-15', archive_reason = 'unavailable',
    updated_at = unixepoch() * 1000, version = version + 1
WHERE id = 'cosmolive' AND status = 'active';

UPDATE project_translations
SET description = 'A fan-made list of tripleS COSMO Live videos that compared stream counts and total airtime on leaderboards.'
WHERE project_id = 'cosmolive' AND lang = 'en'
  AND description = 'Browse tripleS COSMO Live videos and compare stream counts and total airtime on fan-made leaderboards.';

UPDATE project_translations
SET description = '팬이 만든 tripleS COSMO Live 영상 목록과 통계였습니다. 방송 횟수와 누적 방송 시간에 따른 순위표를 볼 수 있었습니다.'
WHERE project_id = 'cosmolive' AND lang = 'ko'
  AND description = '팬이 만든 tripleS COSMO Live 영상 목록과 통계입니다. 방송 횟수와 누적 방송 시간에 따른 순위표를 볼 수 있습니다.';
