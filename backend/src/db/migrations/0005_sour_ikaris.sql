ALTER TABLE "lists" ADD COLUMN "last_activity_kind" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "last_activity_detail" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "last_activity_by" uuid;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_last_activity_by_users_id_fk" FOREIGN KEY ("last_activity_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_updated_idx" ON "lists" USING btree ("updated_at");