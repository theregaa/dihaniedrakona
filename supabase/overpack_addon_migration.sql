-- v95: move overpack filling from the menu into hookah add-ons
-- Run once in an existing Supabase database.

-- Remove the old standalone menu item. Existing historical order_items are preserved.
delete from public.menu_items
where name = 'Забивка оверпаком';

-- No new DB columns are required: the overpack selection is stored in
-- the existing order_items.details JSON together with other hookah options.
