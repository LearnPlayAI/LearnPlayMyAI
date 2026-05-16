-- 1. Enum types (may already exist from fresh install)
DO $$ BEGIN
  CREATE TYPE "courseAssignmentScope" AS ENUM ('organization', 'department', 'unit', 'team', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "courseAssignmentAudience" AS ENUM ('learner', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 2. courseAssignments table (may already exist from fresh install)
CREATE TABLE IF NOT EXISTS "courseAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "assignedBy" character varying NOT NULL,
    "userId" character varying,
    "unitId" character varying,
    "subUnitId" character varying,
    audience "courseAssignmentAudience" DEFAULT 'learner'::"courseAssignmentAudience" NOT NULL,
    "dueDate" timestamp without time zone,
    "assignedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    mandatory boolean DEFAULT false NOT NULL,
    "assignmentScope" "courseAssignmentScope" DEFAULT 'user'::"courseAssignmentScope" NOT NULL,
    "teamId" character varying,
    CONSTRAINT "courseAssignments_pkey" PRIMARY KEY (id)
);
--> statement-breakpoint

-- 3. Add missing columns to courseLessons (may already exist)
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "primaryQuizId" character varying;
--> statement-breakpoint
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "lessonType" character varying;
--> statement-breakpoint
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "learningObjectives" text[];
--> statement-breakpoint
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "lessonDetail" text;
--> statement-breakpoint
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "realWorldExample" text;
--> statement-breakpoint
ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "contentHealth" jsonb;
--> statement-breakpoint

-- 4. Add missing columns to courseAssignments (may already exist if table was freshly created)
ALTER TABLE "courseAssignments" ADD COLUMN IF NOT EXISTS "assignmentScope" "courseAssignmentScope" DEFAULT 'user'::"courseAssignmentScope" NOT NULL;
--> statement-breakpoint
ALTER TABLE "courseAssignments" ADD COLUMN IF NOT EXISTS "teamId" character varying;
--> statement-breakpoint

-- 5. Create indexes safely
CREATE INDEX IF NOT EXISTS "IDX_course_lessons_quiz" ON "courseLessons" ("primaryQuizId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_course" ON "courseAssignments" ("courseId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_org" ON "courseAssignments" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_user" ON "courseAssignments" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_unit" ON "courseAssignments" ("unitId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_subunit" ON "courseAssignments" ("subUnitId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_team" ON "courseAssignments" ("teamId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_scope" ON "courseAssignments" ("assignmentScope");
--> statement-breakpoint

-- 6. Foreign keys (safe - skip if already exists)
DO $$ BEGIN
  ALTER TABLE "courseLessons" ADD CONSTRAINT "courseLessons_primaryQuizId_quizCollections_id_fk"
    FOREIGN KEY ("primaryQuizId") REFERENCES "quizCollections"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_courseId_courses_id_fk"
    FOREIGN KEY ("courseId") REFERENCES "courses"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_organizationId_organizations_id_fk"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_assignedBy_users_id_fk"
    FOREIGN KEY ("assignedBy") REFERENCES "users"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "users"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_unitId_organizationUnits_id_fk"
    FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_subUnitId_organizationSubUnits_id_fk"
    FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "courseAssignments_teamId_organizationTeams_id_fk"
    FOREIGN KEY ("teamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 7. Unique constraints (safe)
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "UNQ_course_assignment_user"
    UNIQUE NULLS NOT DISTINCT ("courseId", "userId", "organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "courseAssignments" ADD CONSTRAINT "UNQ_course_assignment_scope"
    UNIQUE NULLS NOT DISTINCT ("courseId", "organizationId", "audience", "unitId", "subUnitId", "teamId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
