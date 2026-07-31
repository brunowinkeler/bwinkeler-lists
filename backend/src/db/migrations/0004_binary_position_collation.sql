-- fractional-indexing keys rely on binary/ASCII lexical ordering. Locale-aware
-- collations can sort `a0` before `Zz`, reversing valid key order and causing
-- reorder requests to be rejected or rendered in the wrong position.
ALTER TABLE "categories"
	ALTER COLUMN "position" TYPE text COLLATE "C"
	USING "position"::text;
--> statement-breakpoint
ALTER TABLE "items"
	ALTER COLUMN "position" TYPE text COLLATE "C"
	USING "position"::text;