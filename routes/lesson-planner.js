// routes/lesson-planner.js
const express = require('express');
const router = express.Router();
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel, convertInchesToTwip } = require('docx');
const path = require('path');
const fs = require('fs').promises;

// Generate a comprehensive lesson plan based on topic and learning outcomes
router.post('/generate', express.json(), async (req, res) => {
  try {
    const { 
      topic, 
      learningOutcomes, 
      grade, 
      duration = 45,
      teacherName,
      classCode,
      unit,
      date
    } = req.body;

    if (!topic || !learningOutcomes) {
      return res.status(400).json({ error: 'Topic and learning outcomes are required' });
    }

    // Generate lesson plan structure based on the topic and outcomes
    const lessonPlan = generateLessonPlanContent(topic, learningOutcomes, grade, duration);
    
    // Create Word document
    const doc = createLessonPlanDocument({
      ...lessonPlan,
      teacherName: teacherName || req.user?.name || 'Teacher',
      classCode: classCode || `Grade ${grade || '7'}`,
      unit: unit || 'Trigonometric Identities',
      date: date || new Date().toLocaleDateString('en-GB'),
      teacherEmail: req.user?.email || ''
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    
    // Save to outputs folder with unique name
    const filename = `lesson-plan-${Date.now()}.docx`;
    const outputPath = path.join('/mnt/user-data/outputs', filename);
    await fs.writeFile(outputPath, buffer);

    res.json({
      success: true,
      filename,
      url: `computer:///mnt/user-data/outputs/${filename}`,
      lessonPlan
    });

  } catch (error) {
    console.error('Error generating lesson plan:', error);
    res.status(500).json({ error: 'Failed to generate lesson plan' });
  }
});

// Function to generate lesson plan content based on input
function generateLessonPlanContent(topic, learningOutcomes, grade, duration) {
  // Parse learning outcomes if it's a string
  const outcomes = typeof learningOutcomes === 'string' 
    ? learningOutcomes.split('\n').filter(o => o.trim())
    : learningOutcomes;

  // Generate activities based on topic and grade level
  const activities = generateActivities(topic, grade, duration);
  
  return {
    topic,
    objectives: outcomes.map(outcome => 
      outcome.startsWith('-') || outcome.startsWith('•') 
        ? outcome.slice(1).trim() 
        : outcome.trim()
    ),
    activities,
    differentiation: generateDifferentiation(topic, grade),
    assessment: generateAssessment(topic),
    keyVocabulary: generateKeyVocabulary(topic),
    homework: generateHomework(topic, grade),
    resources: generateResources(topic)
  };
}

// Generate student-centered activities
function generateActivities(topic, grade, duration) {
  const activities = [];
  let timeUsed = 0;
  
  // Organization (2-3 mins)
  activities.push({
    time: 3,
    studentActivity: 'Students settle down at their designated places and prepare materials for the lesson.',
    teacherActivity: 'Take attendance and provide initial instructions.'
  });
  timeUsed += 3;

  // Recall/Warm-up (5 mins)
  activities.push({
    time: 5,
    studentActivity: 'Students participate in quick mental math or recall previous concepts through think-pair-share activity.',
    teacherActivity: 'Facilitate recall activity using questioning techniques and invite students to share their answers.'
  });
  timeUsed += 5;

  // Starter Activity (10 mins)
  activities.push({
    time: 10,
    studentActivity: `Students work in pairs on an engaging starter activity related to ${topic}. They discuss approaches and write solutions on mini whiteboards.`,
    teacherActivity: 'Present the starter problem, circulate to observe student thinking, and facilitate peer discussion.'
  });
  timeUsed += 10;

  // Inquiry/Exploration (10-15 mins)
  const inquiryTime = Math.min(15, (duration - timeUsed - 20));
  activities.push({
    time: inquiryTime,
    studentActivity: `Students explore ${topic} through hands-on investigation or problem-solving. They ask questions, make conjectures, and test their ideas collaboratively.`,
    teacherActivity: 'Guide exploration with strategic questions, provide scaffolding as needed, and encourage mathematical discourse.'
  });
  timeUsed += inquiryTime;

  // Main Activity (remaining time - 10 for plenary)
  const mainTime = duration - timeUsed - 10;
  if (mainTime > 0) {
    activities.push({
      time: mainTime,
      studentActivity: `Students apply their understanding of ${topic} through differentiated practice problems. They work independently and in groups, presenting solutions to the class.`,
      teacherActivity: 'Differentiate instruction, provide targeted support, facilitate student presentations, and assess understanding.'
    });
    timeUsed += mainTime;
  }

  // Plenary/Reflection (10 mins)
  activities.push({
    time: 10,
    studentActivity: 'Students complete exit tickets, self-assess their learning, and reflect on key concepts learned.',
    teacherActivity: 'Lead whole-class discussion, clarify misconceptions, and collect formative assessment data.'
  });

  return activities;
}

// Generate differentiation strategies
function generateDifferentiation(topic, grade) {
  return {
    lowAbility: [
      'Provide visual aids and manipulatives',
      'Break down complex problems into smaller steps',
      'Offer sentence starters and worked examples',
      'Pair with supportive peer for collaborative work',
      'Use concrete examples before abstract concepts'
    ],
    highAbility: [
      'Provide extension problems with real-world applications',
      'Encourage alternative solution methods',
      'Challenge with open-ended investigations',
      'Assign peer tutoring responsibilities',
      'Introduce connections to advanced topics'
    ]
  };
}

// Generate assessment strategies
function generateAssessment(topic) {
  return [
    'Questioning and observation during activities',
    'Mini whiteboard responses for quick checks',
    'Peer assessment during group work',
    'Exit tickets with key concept questions',
    'Student presentations of solutions',
    'Self-assessment reflection forms'
  ];
}

// Generate key vocabulary
function generateKeyVocabulary(topic) {
  const baseVocab = ['equation', 'solution', 'variable', 'expression', 'evaluate'];
  
  // Add topic-specific vocabulary
  const topicLower = topic.toLowerCase();
  if (topicLower.includes('fraction')) {
    baseVocab.push('numerator', 'denominator', 'simplify', 'equivalent', 'mixed number');
  } else if (topicLower.includes('geometry') || topicLower.includes('angle')) {
    baseVocab.push('angle', 'vertex', 'perpendicular', 'parallel', 'congruent');
  } else if (topicLower.includes('algebra')) {
    baseVocab.push('coefficient', 'constant', 'term', 'factor', 'expand');
  } else if (topicLower.includes('trigono')) {
    baseVocab.push('sine', 'cosine', 'tangent', 'hypotenuse', 'adjacent', 'opposite');
  } else if (topicLower.includes('statistic') || topicLower.includes('data')) {
    baseVocab.push('mean', 'median', 'mode', 'range', 'frequency');
  }
  
  return baseVocab;
}

// Generate homework
function generateHomework(topic, grade) {
  return `Complete practice problems ${grade}-${Math.floor(Math.random() * 20) + 1} to ${grade}-${Math.floor(Math.random() * 20) + 25} from the textbook focusing on ${topic}. Additionally, create one real-world problem that uses the concepts learned today and be prepared to share it next class.`;
}

// Generate resources
function generateResources(topic) {
  return [
    'Interactive whiteboard/projector',
    'Mini whiteboards and markers',
    'Worksheets (differentiated)',
    'Graphing calculators (if applicable)',
    'Online platform (IXL/Khan Academy)',
    'Manipulatives/visual aids',
    'Student notebooks'
  ];
}

// Create Word document with the lesson plan
function createLessonPlanDocument(data) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          text: "LESSON PLANNING SHEET",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        // Header information table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Subject: ", bold: true }), new TextRun("Mathematics")] 
                  })],
                  width: { size: 25, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Teacher: ", bold: true }), new TextRun(data.teacherName)] 
                  })],
                  width: { size: 25, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Date: ", bold: true }), new TextRun(data.date)] 
                  })],
                  width: { size: 25, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Class: ", bold: true }), new TextRun(data.classCode)] 
                  })],
                  width: { size: 25, type: WidthType.PERCENTAGE }
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Lesson Title: ", bold: true }), new TextRun(data.topic)] 
                  })],
                  columnSpan: 2
                }),
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: "Unit: ", bold: true }), new TextRun(data.unit)] 
                  })],
                  columnSpan: 2
                })
              ]
            })
          ]
        }),

        // Learning Objectives
        new Paragraph({
          text: "Learning Objectives",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({
          text: "By the end of this lesson, students will be able to:",
          spacing: { after: 100 }
        }),
        ...data.objectives.map(obj => new Paragraph({
          text: `• ${obj}`,
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) }
        })),

        // Activities Table
        new Paragraph({
          text: "Lesson Activities",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header row
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: "Time", bold: true, alignment: AlignmentType.CENTER })],
                  width: { size: 10, type: WidthType.PERCENTAGE },
                  shading: { fill: "E0E0E0" }
                }),
                new TableCell({
                  children: [new Paragraph({ text: "Student Activity", bold: true, alignment: AlignmentType.CENTER })],
                  width: { size: 45, type: WidthType.PERCENTAGE },
                  shading: { fill: "E0E0E0" }
                }),
                new TableCell({
                  children: [new Paragraph({ text: "Teacher Activity", bold: true, alignment: AlignmentType.CENTER })],
                  width: { size: 45, type: WidthType.PERCENTAGE },
                  shading: { fill: "E0E0E0" }
                })
              ]
            }),
            // Activity rows
            ...data.activities.map(activity => new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: `${activity.time} min`, alignment: AlignmentType.CENTER })]
                }),
                new TableCell({
                  children: [new Paragraph({ text: activity.studentActivity })]
                }),
                new TableCell({
                  children: [new Paragraph({ text: activity.teacherActivity })]
                })
              ]
            }))
          ]
        }),

        // Differentiation
        new Paragraph({
          text: "Differentiation Strategies",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({ text: "For Lower Ability Students:", bold: true })]
        }),
        ...data.differentiation.lowAbility.map(strategy => new Paragraph({
          text: `• ${strategy}`,
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 50 }
        })),
        new Paragraph({
          children: [new TextRun({ text: "For Higher Ability Students:", bold: true })],
          spacing: { before: 200 }
        }),
        ...data.differentiation.highAbility.map(strategy => new Paragraph({
          text: `• ${strategy}`,
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 50 }
        })),

        // Assessment
        new Paragraph({
          text: "Assessment Focus",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        ...data.assessment.map(method => new Paragraph({
          text: `• ${method}`,
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 50 }
        })),

        // Resources
        new Paragraph({
          text: "Resources",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        ...data.resources.map(resource => new Paragraph({
          text: `• ${resource}`,
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 50 }
        })),

        // Key Vocabulary
        new Paragraph({
          text: "Key Vocabulary",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({
          text: data.keyVocabulary.join(', '),
          spacing: { after: 200 }
        }),

        // Homework
        new Paragraph({
          text: "Homework",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({
          text: data.homework,
          spacing: { after: 200 }
        })
      ]
    }]
  });

  return doc;
}

module.exports = router;
