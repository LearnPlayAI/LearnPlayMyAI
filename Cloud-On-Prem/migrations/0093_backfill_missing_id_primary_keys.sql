DO $$
DECLARE
  tbl record;
  null_count bigint;
  dup_count bigint;
  constraint_name text;
BEGIN
  FOR tbl IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema
     AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'id'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint pc
        JOIN pg_class cls ON cls.oid = pc.conrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = t.table_name
          AND pc.contype = 'p'
      )
    ORDER BY t.table_name
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I.%I WHERE id IS NULL', 'public', tbl.table_name) INTO null_count;
    IF null_count > 0 THEN
      RAISE NOTICE 'Skipping %.% primary key backfill: % NULL id row(s)', 'public', tbl.table_name, null_count;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT COUNT(*) FROM (SELECT id FROM %I.%I GROUP BY id HAVING COUNT(*) > 1) d',
      'public',
      tbl.table_name
    ) INTO dup_count;

    IF dup_count > 0 THEN
      RAISE NOTICE 'Skipping %.% primary key backfill: % duplicate id value(s)', 'public', tbl.table_name, dup_count;
      CONTINUE;
    END IF;

    constraint_name := format('%s_pkey', tbl.table_name);
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I PRIMARY KEY (id)',
      'public',
      tbl.table_name,
      constraint_name
    );

    RAISE NOTICE 'Added primary key constraint % on %.%', constraint_name, 'public', tbl.table_name;
  END LOOP;
END $$;
