CREATE TYPE "public"."asset_source" AS ENUM('uploaded', 'generated');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer,
	"checksum" text,
	"source" "asset_source" NOT NULL,
	"purpose" text,
	"filename" text,
	"uploaded_by_user_id" uuid,
	"job" jsonb,
	"processing_status" text NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"processing_last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_origin_check" CHECK (("assets"."source" = 'uploaded') = ("assets"."purpose" IS NOT NULL AND "assets"."job" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_organization_id_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "assets_processing_status_updated_at_idx" ON "assets" USING btree ("processing_status","updated_at");