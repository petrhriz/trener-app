-- 12. 11. 2026: hodnocení náročnosti tréninku (RPE 1–10, stupnice Borg CR10 / Foster; 0 = přeskočeno).
-- V activity_tags, ať ho synchronizace z Garminu nepřepíše.
ALTER TABLE activity_tags ADD COLUMN rpe INTEGER;
