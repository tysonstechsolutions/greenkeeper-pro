-- Add grub_damage, mulch_pile, sticks_around_tree, sticks_on_ground, felled_tree to hole_issue_type enum
-- Add grub_damage to green_issue_type enum
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'mulch_pile' AFTER 'grub_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_around_tree' AFTER 'mulch_pile';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_on_ground' AFTER 'sticks_around_tree';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'felled_tree' AFTER 'sticks_on_ground';
ALTER TYPE green_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';
