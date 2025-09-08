#!/usr/bin/env node
// scripts/fix-lessons.js - Restore and fix lessons in database
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

// Default lesson templates
const DEFAULT_LESSONS = {
  7: [
    { title: 'Introduction to Grade 7 Mathematics', unit: 1, order: 1, description: 'Welcome to Grade 7 Mathematics' },
    { title: 'Number Systems', unit: 1, order: 2, description: 'Understanding different number systems' },
    { title: 'Operations with Integers', unit: 1, order: 3, description: 'Adding, subtracting, multiplying, and dividing integers' },
    { title: 'Fractions and Decimals', unit: 1, order: 4, description: 'Working with fractions and decimal numbers' },
    { title: 'Ratios and Proportions', unit: 1, order: 5, description: 'Understanding ratios and solving proportions' },
    { title: 'Introduction to Algebra', unit: 2, order: 1, description: 'Basic algebraic concepts and expressions' },
    { title: 'Solving Linear Equations', unit: 2, order: 2, description: 'Methods for solving linear equations' },
    { title: 'Geometry Basics', unit: 2, order: 3, description: 'Introduction to geometric shapes and properties' },
    { title: 'Area and Perimeter', unit: 2, order: 4, description: 'Calculating area and perimeter of shapes' },
    { title: 'Data and Statistics', unit: 2, order: 5, description: 'Collecting and analyzing data' }
  ],
  8: [
    { title: 'Advanced Number Theory', unit: 1, order: 1, description: 'Exploring advanced number concepts' },
    { title: 'Exponents and Powers', unit: 1, order: 2, description: 'Working with exponents and scientific notation' },
    { title: 'Square Roots and Radicals', unit: 1, order: 3, description: 'Understanding square roots and radical expressions' },
    { title: 'Polynomials', unit: 1, order: 4, description: 'Introduction to polynomial expressions' },
    { title: 'Factoring', unit: 1, order: 5, description: 'Factoring techniques and applications' },
    { title: 'Linear Functions', unit: 2, order: 1, description: 'Understanding linear functions and graphs' },
    { title: 'Systems of Equations', unit: 2, order: 2, description: 'Solving systems of linear equations' },
    { title: 'Pythagorean Theorem', unit: 2, order: 3, description: 'Applying the Pythagorean theorem' },
    { title: 'Volume and Surface Area', unit: 2, order: 4, description: 'Calculating volume and surface area of 3D shapes' },
    { title: 'Probability', unit: 2, order: 5, description: 'Introduction to probability concepts' }
  ]
};

async function fixLessons() {
  console.log('📚 Lesson Restoration Script');
  console.log('============================\n');
  
  try {
    // Test connection
    console.log('📡 Connecting to database...');
    const { rows: dbTest } = await pool.query('SELECT NOW() as time');
    console.log(`✅ Database connected at ${dbTest[0].time}\n`);
    
    // Check current lessons
    console.log('🔍 Checking existing lessons...');
    const { rows: existing } = await pool.query(`
      SELECT grade, COUNT(*) as count 
      FROM lessons 
      GROUP BY grade 
      ORDER BY grade
    `);
    
    const lessonCounts = new Map();
    existing.forEach(row => {
      lessonCounts.set(row.grade, parseInt(row.count));
      console.log(`   Grade ${row.grade}: ${row.count} lessons`);
    });
    
    if (existing.length === 0) {
      console.log('   No lessons found in database');
    }
    
    console.log('\n📂 Checking filesystem...');
    const grades = [7, 8];
    const fileSystem = new Map();
    
    for (const grade of grades) {
      const dir = path.join(process.cwd(), `grade${grade}`);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        console.log(`   Creating grade${grade} directory...`);
        fs.mkdirSync(dir, { recursive: true });
        
        // Create welcome file
        const welcomeContent = createWelcomeHTML(grade);
        fs.writeFileSync(path.join(dir, 'welcome.html'), welcomeContent);
        console.log(`   Created welcome.html for grade ${grade}`);
        
        // Create lesson files from templates
        const lessons = DEFAULT_LESSONS[grade];
        for (let i = 0; i < Math.min(5, lessons.length); i++) {
          const lesson = lessons[i];
          const filename = `lesson-${lesson.unit}-${lesson.order}.html`;
          const content = createLessonHTML(grade, lesson);
          fs.writeFileSync(path.join(dir, filename), content);
          console.log(`   Created ${filename}`);
        }
      }
      
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      fileSystem.set(grade, files);
      console.log(`   Grade ${grade}: ${files.length} HTML files`);
    }
    
    // Begin transaction
    console.log('\n🔄 Synchronizing lessons to database...');
    await pool.query('BEGIN');
    
    try {
      // Process each grade
      for (const grade of grades) {
        const files = fileSystem.get(grade) || [];
        const lessons = DEFAULT_LESSONS[grade];
        
        if (files.length === 0 && lessons) {
          // No files, use default lessons
          console.log(`\n   Adding default lessons for grade ${grade}...`);
          
          for (const lesson of lessons) {
            const slug = `${grade}-${lesson.unit}-${lesson.order}`;
            const htmlPath = `/lessons/grade${grade}/lesson-${lesson.unit}-${lesson.order}.html`;
            
            await pool.query(`
              INSERT INTO lessons (
                slug, grade, unit, lesson_order, title, description, 
                html_path, is_public, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
              ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                html_path = EXCLUDED.html_path,
                updated_at = NOW()
            `, [slug, grade, lesson.unit, lesson.order, lesson.title, lesson.description, htmlPath]);
            
            console.log(`      ✅ ${lesson.title}`);
          }
        } else {
          // Sync files to database
          console.log(`\n   Syncing ${files.length} files for grade ${grade}...`);
          
          for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            const htmlPath = `/lessons/grade${grade}/${filename}`;
            
            // Try to parse unit and order from filename
            let unit = Math.floor(i / 5) + 1;
            let order = (i % 5) + 1;
            
            const match = filename.match(/lesson-(\d+)-(\d+)\.html/i);
            if (match) {
              unit = parseInt(match[1]);
              order = parseInt(match[2]);
            } else {
              const singleMatch = filename.match(/lesson-(\d+)\.html/i);
              if (singleMatch) {
                order = parseInt(singleMatch[1]);
              }
            }
            
            // Find matching template or create title from filename
            let title = filename.replace('.html', '').replace(/[-_]/g, ' ');
            let description = '';
            
            const template = lessons?.find(l => l.unit === unit && l.order === order);
            if (template) {
              title = template.title;
              description = template.description;
            }
            
            // Try to extract title from HTML file
            try {
              const content = fs.readFileSync(path.join(process.cwd(), `grade${grade}`, filename), 'utf8');
              const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
              if (titleMatch) {
                const extractedTitle = titleMatch[1]
                  .replace(/QLA|Grade \d+|Mathematics|[•·\-–—]|^\s+|\s+$/g, ' ')
                  .trim();
                if (extractedTitle && extractedTitle.length > 3) {
                  title = extractedTitle;
                }
              }
            } catch (e) {
              // Use default title
            }
            
            const slug = `${grade}-${unit}-${order}`;
            
            await pool.query(`
              INSERT INTO lessons (
                slug, grade, unit, lesson_order, title, description,
                html_path, is_public, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
              ON CONFLICT (slug) DO UPDATE SET
                title = CASE 
                  WHEN lessons.title IS NULL OR lessons.title = '' 
                  THEN EXCLUDED.title 
                  ELSE lessons.title 
                END,
                html_path = EXCLUDED.html_path,
                updated_at = NOW()
            `, [slug, grade, unit, order, title, description, htmlPath]);
            
            console.log(`      ✅ ${title}`);
          }
        }
      }
      
      // Create assessments for lessons without them
      console.log('\n📝 Creating missing assessments...');
      const { rows: lessonsNeedingAssessments } = await pool.query(`
        SELECT l.id, l.title 
        FROM lessons l
        LEFT JOIN assessments a ON a.lesson_id = l.id
        WHERE a.id IS NULL
        LIMIT 10
      `);
      
      for (const lesson of lessonsNeedingAssessments) {
        // Create question bank
        const { rows: bank } = await pool.query(
          'INSERT INTO question_banks (title, created_by) VALUES ($1, $2) RETURNING id',
          [`${lesson.title} - Quiz`, 'system']
        );
        
        // Add sample questions
        const questions = [
          {
            type: 'mcq',
            prompt: 'Which of the following best describes this lesson?',
            options: ['Very Easy', 'Easy', 'Moderate', 'Challenging'],
            answer: 2,
            points: 1
          },
          {
            type: 'tf',
            prompt: 'Did you understand the main concepts?',
            options: ['True', 'False'],
            answer: 0,
            points: 1
          },
          {
            type: 'num',
            prompt: 'What is 10 + 10?',
            answer: { value: 20, tolerance: 0 },
            points: 1
          }
        ];
        
        for (const q of questions) {
          await pool.query(
            'INSERT INTO questions (bank_id, type, prompt, options, answer, points) VALUES ($1, $2, $3, $4, $5, $6)',
            [bank[0].id, q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.points]
          );
        }
        
        // Create assessment
        await pool.query(
          'INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1, $2, $3, $4, $5)',
          [lesson.id, bank[0].id, `${lesson.title} - Quiz`, 70, 'system']
        );
        
        console.log(`   ✅ Created assessment for: ${lesson.title}`);
      }
      
      await pool.query('COMMIT');
      console.log('\n✅ Database transaction committed');
      
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
    
    // Verify results
    console.log('\n📊 Final Status:');
    const { rows: final } = await pool.query(`
      SELECT 
        grade,
        COUNT(*) as lesson_count,
        COUNT(DISTINCT unit) as unit_count,
        MIN(lesson_order) as min_order,
        MAX(lesson_order) as max_order
      FROM lessons
      GROUP BY grade
      ORDER BY grade
    `);
    
    final.forEach(row => {
      console.log(`   Grade ${row.grade}: ${row.lesson_count} lessons across ${row.unit_count} units`);
    });
    
    const { rows: totals } = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM lessons) as lessons,
        (SELECT COUNT(*) FROM assessments) as assessments,
        (SELECT COUNT(*) FROM question_banks) as banks,
        (SELECT COUNT(*) FROM questions) as questions
    `);
    
    const t = totals[0];
    console.log(`\n   Total Lessons: ${t.lessons}`);
    console.log(`   Total Assessments: ${t.assessments}`);
    console.log(`   Total Question Banks: ${t.banks}`);
    console.log(`   Total Questions: ${t.questions}`);
    
    console.log('\n✨ Lesson restoration completed successfully!');
    console.log('   Your lessons should now appear in the portal.\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify DATABASE_URL is set correctly');
    console.error('2. Ensure grade7/ and grade8/ directories exist');
    console.error('3. Check file permissions');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Helper function to create welcome HTML
function createWelcomeHTML(grade) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Welcome to Grade ${grade} Mathematics</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen p-8">
  <div class="max-w-4xl mx-auto">
    <div class="bg-white rounded-2xl shadow-xl p-8">
      <h1 class="text-4xl font-bold text-purple-900 mb-4">
        <i class="fas fa-graduation-cap mr-3"></i>
        Welcome to Grade ${grade} Mathematics
      </h1>
      <p class="text-lg text-gray-700 mb-6">
        Get ready to explore the exciting world of mathematics! 
        This course will help you build strong foundations in mathematical concepts.
      </p>
      
      <div class="grid md:grid-cols-2 gap-6 mt-8">
        <div class="bg-blue-50 p-6 rounded-xl">
          <h2 class="text-xl font-semibold text-blue-900 mb-3">
            <i class="fas fa-book mr-2"></i>What You'll Learn
          </h2>
          <ul class="space-y-2 text-gray-700">
            <li><i class="fas fa-check text-green-500 mr-2"></i>Number Systems</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i>Algebra Basics</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i>Geometry Concepts</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i>Problem Solving</li>
          </ul>
        </div>
        
        <div class="bg-purple-50 p-6 rounded-xl">
          <h2 class="text-xl font-semibold text-purple-900 mb-3">
            <i class="fas fa-rocket mr-2"></i>How to Succeed
          </h2>
          <ul class="space-y-2 text-gray-700">
            <li><i class="fas fa-star text-yellow-500 mr-2"></i>Watch all videos</li>
            <li><i class="fas fa-star text-yellow-500 mr-2"></i>Complete activities</li>
            <li><i class="fas fa-star text-yellow-500 mr-2"></i>Practice regularly</li>
            <li><i class="fas fa-star text-yellow-500 mr-2"></i>Ask questions</li>
          </ul>
        </div>
      </div>
      
      <div class="mt-8 text-center">
        <button onclick="window.parent.postMessage({type:'lesson-complete'}, '*')" 
                class="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">
          <i class="fas fa-play mr-2"></i>Start Learning
        </button>
      </div>
    </div>
  </div>
  <script src="/js/lesson-bridge.js"></script>
</body>
</html>`;
}

// Helper function to create lesson HTML
function createLessonHTML(grade, lesson) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${lesson.title} - Grade ${grade}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-gray-50 min-h-screen p-8">
  <div class="max-w-4xl mx-auto">
    <div class="bg-white rounded-2xl shadow-lg p-8">
      <div class="mb-6">
        <span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
          Grade ${grade} • Unit ${lesson.unit} • Lesson ${lesson.order}
        </span>
      </div>
      
      <h1 class="text-3xl font-bold text-gray-900 mb-4">${lesson.title}</h1>
      <p class="text-lg text-gray-600 mb-8">${lesson.description}</p>
      
      <div class="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
        <h2 class="text-xl font-semibold text-blue-900 mb-3">
          <i class="fas fa-lightbulb mr-2"></i>Learning Objectives
        </h2>
        <ul class="space-y-2 text-gray-700">
          <li>• Understand the key concepts of ${lesson.title.toLowerCase()}</li>
          <li>• Apply knowledge through practice problems</li>
          <li>• Build foundation for advanced topics</li>
        </ul>
      </div>
      
      <div class="prose max-w-none">
        <h2 class="text-2xl font-bold mb-4">Introduction</h2>
        <p class="text-gray-700 mb-4">
          Welcome to this lesson on ${lesson.title}. ${lesson.description}
          Let's explore these concepts together through interactive examples and exercises.
        </p>
        
        <h2 class="text-2xl font-bold mb-4 mt-8">Key Concepts</h2>
        <div class="bg-gray-50 p-6 rounded-lg mb-6">
          <p class="text-gray-700">
            This lesson covers important mathematical concepts that will help you 
            understand more complex topics in the future. Pay attention to the 
            examples and try to solve the practice problems on your own.
          </p>
        </div>
        
        <h2 class="text-2xl font-bold mb-4 mt-8">Practice</h2>
        <div class="bg-yellow-50 p-6 rounded-lg">
          <p class="text-gray-700 mb-4">
            Try solving these practice problems to reinforce your understanding:
          </p>
          <ol class="list-decimal list-inside space-y-2 text-gray-700">
            <li>Practice problem 1</li>
            <li>Practice problem 2</li>
            <li>Practice problem 3</li>
          </ol>
        </div>
      </div>
      
      <div class="mt-8 flex justify-between">
        <button onclick="window.history.back()" 
                class="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300">
          <i class="fas fa-arrow-left mr-2"></i>Previous
        </button>
        <button onclick="window.parent.postMessage({type:'lesson-complete'}, '*')" 
                class="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700">
          <i class="fas fa-check mr-2"></i>Complete Lesson
        </button>
      </div>
    </div>
  </div>
  <script src="/js/lesson-bridge.js"></script>
</body>
</html>`;
}

// Run if called directly
if (require.main === module) {
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('\nUsage:');
    console.error('  DATABASE_URL=your_database_url node scripts/fix-lessons.js');
    process.exit(1);
  }
  
  fixLessons().catch(console.error);
}

module.exports = { fixLessons };
