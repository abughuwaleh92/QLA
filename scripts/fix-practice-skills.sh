#!/bin/bash
# Fix script for Teacher Practice Skills creation issue

echo "====================================="
echo "QLA Practice Skills Fix Script"
echo "====================================="

# 1. Apply database migration
echo ""
echo "Step 1: Applying database migration..."
echo "Running migration to fix skills table..."

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
    echo "Creating migrations directory..."
    mkdir -p migrations
fi

# Copy the migration file if not exists
if [ ! -f "migrations/011_fix_skills_table.sql" ]; then
    echo "Creating migration file..."
    cat > migrations/011_fix_skills_table.sql << 'EOF'
-- Migration to fix skills and practice_banks tables
BEGIN;

-- Add missing columns to skills table if they don't exist
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure practice_banks table exists with correct structure
CREATE TABLE IF NOT EXISTS practice_banks (
  id SERIAL PRIMARY KEY,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  difficulty VARCHAR(20) DEFAULT 'medium',
  created_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add name column if only title exists
ALTER TABLE practice_banks ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE practice_banks SET name = COALESCE(title, 'Untitled Bank') WHERE name IS NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_skills_grade ON skills(grade);
CREATE INDEX IF NOT EXISTS idx_skills_unit ON skills(unit);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active);
CREATE INDEX IF NOT EXISTS idx_practice_banks_skill ON practice_banks(skill_id);
CREATE INDEX IF NOT EXISTS idx_practice_banks_active ON practice_banks(is_active);

COMMIT;
EOF
fi

# 2. Replace the backend route file
echo ""
echo "Step 2: Updating backend route..."
if [ -f "routes/teacher-practice.js" ]; then
    echo "Backing up existing teacher-practice.js..."
    cp routes/teacher-practice.js routes/teacher-practice.js.backup
fi

echo "Copying fixed teacher-practice.js..."
if [ -f "routes/teacher-practice-fixed.js" ]; then
    cp routes/teacher-practice-fixed.js routes/teacher-practice.js
    echo "✓ Backend route updated"
else
    echo "⚠ Fixed route file not found, please update manually"
fi

# 3. Update the frontend UI file
echo ""
echo "Step 3: Updating frontend UI..."
if [ -f "public/js/teacher-practice-ui.js" ]; then
    echo "Backing up existing teacher-practice-ui.js..."
    cp public/js/teacher-practice-ui.js public/js/teacher-practice-ui.js.backup
fi

echo "Copying fixed teacher-practice-ui.js..."
if [ -f "public/js/teacher-practice-ui-fixed.js" ]; then
    cp public/js/teacher-practice-ui-fixed.js public/js/teacher-practice-ui.js
    echo "✓ Frontend UI updated"
else
    echo "⚠ Fixed UI file not found, please update manually"
fi

# 4. Restart instructions
echo ""
echo "====================================="
echo "Fix Applied Successfully!"
echo "====================================="
echo ""
echo "Next steps:"
echo "1. Restart your Node.js server"
echo "2. The migration will run automatically on startup"
echo "3. Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)"
echo "4. Try creating a skill again"
echo ""
echo "If issues persist:"
echo "1. Check the server console for error messages"
echo "2. Open browser DevTools console (F12) and look for errors"
echo "3. Manually run the migration:"
echo "   psql \$DATABASE_URL < migrations/011_fix_skills_table.sql"
echo ""
echo "Backup files created:"
echo "- routes/teacher-practice.js.backup"
echo "- public/js/teacher-practice-ui.js.backup"
echo ""
