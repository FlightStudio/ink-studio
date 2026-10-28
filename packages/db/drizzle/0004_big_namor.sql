CREATE TABLE "drawings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"source" jsonb NOT NULL,
	"mask_asset_id" uuid NOT NULL,
	"aspect" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "drawings_kind_check" CHECK ("drawings"."kind" in ('doodle', 'signature')),
	CONSTRAINT "drawings_aspect_check" CHECK ("drawings"."aspect" > 0)
);
--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_mask_asset_id_assets_id_fk" FOREIGN KEY ("mask_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawings_organization_id_kind_created_at_idx" ON "drawings" USING btree ("organization_id","kind","created_at");