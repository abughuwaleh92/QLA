// routes/lesson-plan-generator.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } 
});

// Lesson plan template structure based on QLA format
const generateLessonPlan = (topic, learningOutcomes, grade, duration = 55, teacherName = '') => {
  const currentDate = new Date();
  const formattedDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
  
  // Parse learning outcomes if provided as string
  const outcomes = typeof learningOutcomes === 'string' 
    ? learningOutcomes.split('\n').filter(o => o.trim())
    : learningOutcomes;

  // Generate activities based on topic
  const activities = generateActivities(topic, grade);
  const vocabulary = generateVocabulary(topic);
  const resources = generateResources(topic, grade);
  
  const lessonPlan = {
    // Header Information
    subject: 'Mathematics',
    teacher: teacherName,
    lessonTitle: topic,
    schemeOfWork: `Unit: ${determineUnit(topic)}`,
    date: formattedDate,
    grade: `Grade ${grade}`,
    block: '2',
    duration: duration,
    
    // Learning Objectives
    learningObjectives: outcomes.length > 0 ? outcomes : [
      `Understand the key concepts of ${topic.toLowerCase()}`,
      `Apply ${topic.toLowerCase()} concepts to solve problems`,
      `Analyze and evaluate solutions using ${topic.toLowerCase()}`,
      `Create connections between ${topic.toLowerCase()} and real-world applications`
    ],
    
    // Lesson Sections with Timing
    sections: [
      {
        timing: '2 mins',
        title: 'Organisation',
        studentActivity: 'Students will settle down at their designated places and get ready with their laptops for starter activity.',
        teacherActivity: 'Attendance will be taken, and initial instructions will be given to students.'
      },
      {
        timing: '3 mins',
        title: 'Recall',
        studentActivity: 'Students will answer the questions and will come to board when asked.',
        teacherActivity: `Teacher will ask students to recall key terms and concepts related to ${topic}. Teacher will call students on board to answer some of the questions asked.`
      },
      {
        timing: '10 mins',
        title: 'Starter',
        studentActivity: activities.starter.student,
        teacherActivity: activities.starter.teacher
      },
      {
        timing: '10 mins',
        title: 'Inquiry Question',
        studentActivity: activities.inquiry.student,
        teacherActivity: activities.inquiry.teacher
      },
      {
        timing: '20 mins',
        title: 'Main',
        studentActivity: activities.main.student,
        teacherActivity: activities.main.teacher
      },
      {
        timing: '10 mins',
        title: 'Plenary: Feedback and Reflection',
        studentActivity: 'Students will listen to the instructions by teacher. Students will ask their doubts if any. Students will complete the feedback and reflection form independently.',
        teacherActivity: 'Teacher will distribute reflection and feedback form based on the concepts taught in the topic. Teacher will explain the expectations to the students. Teacher will collect back the responses and will discuss with the students.'
      }
    ],
    
    // Differentiation
    differentiation: {
      lowMedium: [
        `Meaning of key words discussed and explained with the help of pictures`,
        `Given individual attention when needed`,
        `Visuals are used in the delivery and worksheet to make it easier to understand`,
        `Scaffolded questions with increasing difficulty`
      ],
      highAbility: [
        `Worksheet will have challenging questions for high ability students`,
        `Extension problems that require critical thinking`,
        `Opportunities to peer-teach and mentor other students`,
        `Open-ended investigation tasks`
      ]
    },
    
    // Assessment Focus
    assessmentFocus: [
      'Question answer',
      'Observation',
      'Discussion',
      'Reflection',
      'Participation',
      'Work in pairs',
      'Math Software (IXL/GeoGebra)',
      'Mini whiteboard activities'
    ],
    
    // Resources
    resources: resources,
    
    // Key Vocabulary
    keyVocabulary: vocabulary,
    
    // Homework
    homework: `Complete practice problems ${Math.floor(Math.random() * 10) + 1}-${Math.floor(Math.random() * 10) + 15} from the worksheet. Research one real-world application of ${topic} and prepare a short presentation.`
  };
  
  return lessonPlan;
};

// Helper function to generate activities based on topic
function generateActivities(topic, grade) {
  const topicLower = topic.toLowerCase();
  
  return {
    starter: {
      student: `Students will participate in online IXL activity on ${topic}. Students will write answers of IXL questions on mini white board and will show when asked. The team with highest questions answered will be declared the winner.`,
      teacher: `Teacher will explain the expectations of the activity. Teacher will start activity using math software IXL on ${topic}. Teacher will display question on board and students will work in pairs and will write answer on white board.`
    },
    inquiry: {
      student: `Students will listen to the instructions from teacher. Students will work in pairs to solve the problem related to ${topic}. Students will ask relevant questions. Students will answer questions when asked by teacher. Students will complete the solution of the real-life problem.`,
      teacher: `Teacher will distribute a handout with inquiry question to ignite curiosity and connect the topic to real-life situations. Teacher will allow students to work in pairs to solve the problem. Teacher will ask targeted questions from students and will solve problem with the help of answers from students.`
    },
    main: {
      student: `Students will ask relevant questions about ${topic}. Students will answer the questions from the worksheet. Students will come to board and solve the questions when asked. Students will work collaboratively to explore ${topic} concepts through hands-on activities and problem-solving.`,
      teacher: `Teacher will explain the approach to solve application type questions on ${topic} with the help of 2 questions from the worksheet. Teacher will give opportunity to students to solve questions from the worksheet in pairs. Teacher will facilitate group discussions and provide guided practice. Teacher will ask students to solve 2 more questions on their worksheet independently.`
    }
  };
}

// Helper function to determine unit based on topic
function determineUnit(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('number') || topicLower.includes('integer') || topicLower.includes('fraction')) {
    return 'Number Systems';
  } else if (topicLower.includes('algebra') || topicLower.includes('equation') || topicLower.includes('expression')) {
    return 'Algebra';
  } else if (topicLower.includes('geometry') || topicLower.includes('angle') || topicLower.includes('shape') || topicLower.includes('area')) {
    return 'Geometry';
  } else if (topicLower.includes('statistics') || topicLower.includes('data') || topicLower.includes('probability')) {
    return 'Statistics and Probability';
  } else if (topicLower.includes('trigonometry') || topicLower.includes('sine') || topicLower.includes('cosine')) {
    return 'Trigonometry';
  } else {
    return 'Mathematical Concepts';
  }
}

// Helper function to generate vocabulary
function generateVocabulary(topic) {
  const baseVocab = ['Calculate', 'Analyze', 'Evaluate', 'Apply', 'Compare', 'Solution', 'Method', 'Formula'];
  const topicLower = topic.toLowerCase();
  const specificVocab = [];
  
  if (topicLower.includes('fraction')) {
    specificVocab.push('Numerator', 'Denominator', 'Simplify', 'Mixed Number', 'Improper Fraction');
  } else if (topicLower.includes('geometry') || topicLower.includes('angle')) {
    specificVocab.push('Angle', 'Perpendicular', 'Parallel', 'Vertex', 'Polygon', 'Congruent');
  } else if (topicLower.includes('algebra')) {
    specificVocab.push('Variable', 'Coefficient', 'Expression', 'Equation', 'Term', 'Constant');
  } else if (topicLower.includes('trigonometry')) {
    specificVocab.push('Sine', 'Cosine', 'Tangent', 'Hypotenuse', 'Adjacent', 'Opposite', 'Radian', 'Degree');
  } else if (topicLower.includes('statistics')) {
    specificVocab.push('Mean', 'Median', 'Mode', 'Range', 'Frequency', 'Data Set');
  }
  
  // Add topic-specific terms
  const topicWords = topic.split(' ').filter(word => word.length > 3);
  specificVocab.push(...topicWords);
  
  return [...new Set([...specificVocab, ...baseVocab.slice(0, 5)])];
}

// Helper function to generate resources
function generateResources(topic, grade) {
  return [
    'Worksheets',
    'Visual aids',
    'Online platform (IXL/Khan Academy)',
    'Mini whiteboards',
    'Manipulatives',
    `Grade ${grade} textbook`,
    'Calculator (if needed)',
    'Graph paper',
    'Interactive presentations'
  ];
}

// API endpoint to generate lesson plan
router.post('/generate', express.json(), async (req, res) => {
  try {
    const { topic, learningOutcomes, grade, duration, teacherName } = req.body;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    
    const lessonPlan = generateLessonPlan(
      topic, 
      learningOutcomes || [], 
      grade || 7,
      duration || 55,
      teacherName || req.user?.email || 'Teacher'
    );
    
    // Store in database for future reference
    try {
      await pool.query(
        `INSERT INTO generated_lesson_plans 
         (topic, grade, learning_outcomes, plan_data, created_by, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [topic, grade || 7, JSON.stringify(learningOutcomes), JSON.stringify(lessonPlan), req.user?.email]
      );
    } catch (dbError) {
      // Table might not exist yet, continue anyway
      console.log('Could not store lesson plan:', dbError.message);
    }
    
    res.json({ success: true, lessonPlan });
    
  } catch (error) {
    console.error('Error generating lesson plan:', error);
    res.status(500).json({ error: 'Failed to generate lesson plan' });
  }
});

// Get previous lesson plans
router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, topic, grade, created_at 
       FROM generated_lesson_plans 
       WHERE created_by = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.user?.email]
    );
    res.json(rows);
  } catch (error) {
    // Table might not exist
    res.json([]);
  }
});

// Get specific lesson plan
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM generated_lesson_plans WHERE id = $1 AND created_by = $2`,
      [req.params.id, req.user?.email]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lesson plan not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lesson plan' });
  }
});

module.exports = router;
