# QLA Mathematics Platform - Lesson Plan Generator

## Overview
The Lesson Plan Generator is a powerful new feature that allows teachers to create comprehensive, student-centered lesson plans in seconds. Simply enter your topic and learning outcomes, and the system generates a complete lesson plan following Qatar Leadership Academy's pedagogical standards.

## Features

### 🎯 Smart Generation
- **Automatic Structure**: Creates a complete 55-minute lesson plan with proper timing
- **Student-Centered Approach**: Focuses on active learning and student engagement
- **QLA Format Compliance**: Follows the standard QLA lesson planning template

### 📝 Comprehensive Components
Each generated lesson plan includes:
- **Header Information**: Subject, teacher, date, grade, duration
- **Learning Objectives**: Clear, measurable outcomes
- **Lesson Structure**: 
  - Organisation (2 mins)
  - Recall (3 mins)
  - Starter Activity (10 mins)
  - Inquiry Question (10 mins)
  - Main Activity (20 mins)
  - Plenary & Reflection (10 mins)
- **Differentiation Strategies**: For both low/medium and high-ability students
- **Assessment Focus**: Multiple assessment methods
- **Resources**: Complete list of required materials
- **Key Vocabulary**: Subject-specific terms
- **Homework**: Relevant practice and extension activities

### 💾 Export Options
- **Download as Word Document**: Professional .docx format with proper formatting
- **Copy to Clipboard**: Quick text copy for other applications
- **Save History**: Automatic saving of all generated plans

## How to Use

### For Teachers

1. **Access the Feature**
   - Log in to the Teacher Portal
   - Click on "Lesson Plan Generator" tab

2. **Enter Details**
   - **Topic**: Enter your lesson topic (e.g., "Arc Length and Sector Area")
   - **Learning Outcomes**: List what students should achieve (optional - AI will generate if blank)
   - **Grade**: Select the appropriate grade level
   - **Duration**: Adjust if needed (default: 55 minutes)
   - **Teacher Name**: Add your name for the plan header

3. **Generate Plan**
   - Click "Generate Lesson Plan"
   - Wait a few seconds while the AI creates your plan

4. **Review and Export**
   - Review the generated plan
   - Make any manual adjustments if needed
   - Download as Word document for editing
   - Or copy to clipboard for quick use

### Example Topics
- Fractions and Decimals
- Solving Linear Equations
- Pythagorean Theorem
- Area and Perimeter of Complex Shapes
- Trigonometric Ratios
- Statistical Analysis
- Algebraic Expressions

## Technical Implementation

### Backend Architecture
```javascript
// Core generation logic
- Topic analysis and unit determination
- Activity generation based on topic and grade
- Vocabulary extraction and enhancement
- Resource recommendation engine
```

### Database Schema
```sql
-- Stores all generated lesson plans
generated_lesson_plans
├── id (Primary Key)
├── topic
├── grade
├── learning_outcomes (JSON)
├── plan_data (JSON)
├── created_by
└── created_at

-- Templates for customization
lesson_plan_templates
├── id
├── name
├── template_structure (JSON)
└── is_default
```

### API Endpoints
- `POST /api/lesson-plan-generator/generate` - Generate new plan
- `GET /api/lesson-plan-generator/history` - Get user's plan history
- `GET /api/lesson-plan-generator/:id` - Get specific plan
- `POST /api/lesson-plan-export/export-docx` - Export as Word document

## Installation

1. **Copy Files to Your Project**
   ```bash
   cp routes/lesson-plan-generator.js YOUR_PROJECT/routes/
   cp routes/lesson-plan-export.js YOUR_PROJECT/routes/
   cp public/portal-teacher-enhanced.html YOUR_PROJECT/public/portal-teacher.html
   cp migrations/008_lesson_plan_generator.sql YOUR_PROJECT/migrations/
   ```

2. **Install Dependencies**
   ```bash
   npm install docx
   ```

3. **Update server.js**
   ```javascript
   // Add imports
   const lessonPlanGeneratorRouter = require('./routes/lesson-plan-generator');
   const lessonPlanExportRouter = require('./routes/lesson-plan-export');
   
   // Add routes (after authentication)
   app.use('/api/lesson-plan-generator', requireAuth, requireTeacher, lessonPlanGeneratorRouter);
   app.use('/api/lesson-plan-export', requireAuth, requireTeacher, lessonPlanExportRouter);
   ```

4. **Run Migration**
   ```bash
   node scripts/run-migrations.js
   ```

## Customization

### Modify Generation Logic
Edit `routes/lesson-plan-generator.js`:
- `generateActivities()` - Customize activity suggestions
- `generateVocabulary()` - Add subject-specific terms
- `generateResources()` - Update resource lists

### Adjust Timing
Modify the sections array in `generateLessonPlan()`:
```javascript
sections: [
  { timing: '2 mins', title: 'Organisation', ... },
  { timing: '5 mins', title: 'Warm-up', ... }, // Custom section
  // Add or modify sections as needed
]
```

### Add Templates
Create custom templates in the database:
```sql
INSERT INTO lesson_plan_templates (name, template_structure, grade_level)
VALUES ('STEM Focus Template', '{...}', 8);
```

## Benefits

### For Teachers
- ⏱️ **Save Time**: Generate plans in seconds instead of hours
- 📊 **Consistency**: Ensure all plans follow school standards
- 🎨 **Creativity**: More time for creative teaching, less on paperwork
- 📈 **Quality**: AI-powered suggestions based on best practices

### For Students
- 🎯 **Engagement**: Student-centered activities in every lesson
- 🔄 **Differentiation**: Plans adapted for all ability levels
- 📚 **Structure**: Consistent, predictable lesson flow
- 🤝 **Interaction**: Emphasis on collaborative learning

### For Administration
- 📋 **Standardization**: All plans follow QLA format
- 📊 **Analytics**: Track what topics are being taught
- 🔍 **Quality Control**: Ensure pedagogical standards
- 💾 **Documentation**: Automatic record keeping

## Future Enhancements

### Planned Features
- **AI Improvements**: Enhanced topic understanding and activity generation
- **Collaboration**: Share plans between teachers
- **Student Feedback Integration**: Adapt plans based on student performance
- **Multi-language Support**: Generate plans in Arabic
- **Assessment Integration**: Auto-generate quizzes for each plan
- **Calendar Integration**: Sync with school calendar
- **Mobile App**: Generate plans on the go

### Customization Options
- Custom templates per department
- School-specific vocabulary lists
- Integration with textbook chapters
- Video lesson recommendations
- Interactive activity builders

## Support

### Common Issues

**Problem**: Word document won't download
**Solution**: Ensure `docx` package is installed and path permissions are correct

**Problem**: Generation takes too long
**Solution**: Check database connection and ensure migrations have run

**Problem**: Plans don't match our format
**Solution**: Customize the template in `generateLessonPlan()` function

### Contact
For support or feature requests, contact the QLA IT Department.

## License
Proprietary - Qatar Leadership Academy

## Credits
Developed for Qatar Leadership Academy Mathematics Department
Part of the QLA Digital Transformation Initiative 2024-2025
