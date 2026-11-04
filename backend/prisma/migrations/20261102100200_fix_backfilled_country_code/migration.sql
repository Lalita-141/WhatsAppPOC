-- Data fix only: no schema change, and no row is added or removed.
-- 20261102100100 took the country from the newest validated OTP, so Indian
-- numbers verified a few times with the wrong country selected got that country.
-- Moves a user to India only when the number was verified with India, has the
-- 10 digits of an Indian mobile number, and no other account already holds it.
UPDATE `user_master` u
JOIN `country_master` india ON india.`iso_code` = 'IN'
LEFT JOIN `user_master` existing
    ON existing.`country_code` = india.`country_code`
    AND existing.`mobile_no` = u.`mobile_no`
SET u.`country_code` = india.`country_code`
WHERE u.`country_code` <> india.`country_code`
    AND CHAR_LENGTH(u.`mobile_no`) = 10
    AND existing.`user_id` IS NULL
    AND EXISTS (
        SELECT 1
        FROM `register_otp` r
        WHERE r.`mobile_no` = u.`mobile_no`
            AND r.`country_code` = india.`country_code`
            AND r.`is_validated` = 1
    );
