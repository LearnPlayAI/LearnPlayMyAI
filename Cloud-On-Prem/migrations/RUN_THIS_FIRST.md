# Production Database Migration Instructions

## Important: Run This Before Deploying

If you're deploying to production for the first time or upgrading from an older version, you need to manually run this migration.

## The Problem

The production database has `player1Answer` and `player2Answer` columns as `integer` type, but the new schema requires them to be `jsonb` to support all question types (multiple choice, true/false, matching, fill-in-blank).

PostgreSQL cannot automatically convert integer to jsonb, so you'll see this error:

```
column "player1Answer" cannot be cast automatically to type jsonb
```

## The Solution

Run the migration script manually against your production database:

### Option 1: Using the TypeScript Migration Script (Easiest)

We've created a Node.js script that safely handles the migration:

```bash
# Set your production database URL
export DATABASE_URL="your-production-database-url"

# Run the migration script
npx tsx scripts/migrate-answer-columns.ts
```

This script will:
- Check if the migration is needed
- Show you the current column types
- Safely convert the columns to jsonb
- Verify the migration succeeded

### Option 2: Using psql

```bash
# Set your production database URL
export DATABASE_URL="your-production-database-url"

# Run the migration SQL
psql $DATABASE_URL < migrations/0001_convert_answer_columns_to_jsonb.sql
```

### Option 3: Using Drizzle Push with Force

If you don't have any production data yet (first deployment):

```bash
# This will force the schema change
npm run db:push -- --force
```

**⚠️ Warning**: Using `--force` will drop and recreate the columns, losing any existing quiz game data. Only use this if you don't have production data.

### Option 4: Using Replit Database Console

If you're using Replit's database:

1. Go to the Database tab in Replit
2. Switch to your production database
3. Open the SQL console
4. Copy and paste the contents of `migrations/0001_convert_answer_columns_to_jsonb.sql`
5. Execute the SQL

## What This Migration Does

It converts existing integer answer values to jsonb format:
- `NULL` stays as `NULL`
- Integer `0` becomes jsonb `0`
- Integer `1` becomes jsonb `1`
- Integer `2` becomes jsonb `2`
- And so on...

This maintains backward compatibility with any existing quiz data.

## After Running the Migration

Once you've successfully run the migration:

1. Your production database schema will match the application schema
2. You can deploy normally with `npm start`
3. The server will start successfully with all gamification features

## Verify Migration Success

After running the migration, verify it worked:

```sql
-- Check the column types
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'activeQuizGames' 
AND column_name IN ('player1Answer', 'player2Answer');
```

You should see both columns as `jsonb`.

## Need Help?

If you encounter issues:

1. Check your database URL is correct
2. Ensure you have the necessary database permissions
3. Review the error message - it will tell you what went wrong
4. Contact support if the issue persists
