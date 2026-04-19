CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"preset_id" text NOT NULL,
	"template_id" text NOT NULL,
	"preset_params" jsonb NOT NULL,
	"execution_snapshot" jsonb,
	"prompt_request" jsonb,
	"prompt_response" jsonb,
	"queued_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
