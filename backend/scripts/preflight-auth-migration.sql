-- Read-only checks to run before applying the Phase 2 migrations.
--   mysql -u <user> -p <database> < scripts/preflight-auth-migration.sql
-- Every "must be 0" row has to return 0 before migrating.
SET SESSION TRANSACTION READ ONLY;

-- Migrations Prisma has recorded. 0_init must be listed and finished. If it is
-- missing, or this table does not exist, do NOT run migrate deploy: it would
-- try to run the baseline against existing tables.
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;

SELECT 'must be 0: organizations sharing an org_code' AS check_name, COUNT(*) AS result
FROM (SELECT org_code FROM organization_master GROUP BY org_code HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'must be 0: users who cannot be given a country (no OTP history, no IN row)', COUNT(*)
FROM user_master u
WHERE NOT EXISTS (SELECT 1 FROM register_otp r WHERE r.mobile_no = u.mobile_no)
  AND NOT EXISTS (SELECT 1 FROM country_master c WHERE c.iso_code = 'IN')
UNION ALL
SELECT 'must be 0: phone numbers that would collide', COUNT(*)
FROM (
    SELECT resolved_country, mobile_no
    FROM (
        SELECT COALESCE(
            (SELECT r.country_code FROM register_otp r WHERE r.mobile_no = u.mobile_no
             ORDER BY r.is_validated DESC, r.created_at DESC, r.register_otp_id DESC LIMIT 1),
            (SELECT c.country_code FROM country_master c WHERE c.iso_code = 'IN' LIMIT 1)
        ) AS resolved_country, u.mobile_no
        FROM user_master u
    ) resolved
    GROUP BY resolved_country, mobile_no
    HAVING COUNT(*) > 1
) collisions;

-- Information only: rows the migrations will keep, for comparing afterwards.
SELECT 'user_master' AS table_name, COUNT(*) AS row_count FROM user_master
UNION ALL SELECT 'user_organization', COUNT(*) FROM user_organization
UNION ALL SELECT 'personal_chat_history', COUNT(*) FROM personal_chat_history
UNION ALL SELECT 'user_device', COUNT(*) FROM user_device
UNION ALL SELECT 'register_otp', COUNT(*) FROM register_otp;
