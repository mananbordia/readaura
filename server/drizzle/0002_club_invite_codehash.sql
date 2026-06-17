ALTER TABLE "invites" ADD COLUMN "code_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_code_hash_unique" UNIQUE("code_hash");--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "locator";--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "secret_hash";
