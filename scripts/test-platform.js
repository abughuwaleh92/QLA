#!/usr/bin/env node

/**
 * QLA Mathematics Platform - Comprehensive Testing Script
 * Run with: node scripts/test-platform.js
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.magenta}══════════════════════════════════════════${colors.reset}\n${colors.magenta}${msg}${colors.reset}\n${colors.magenta}══════════════════════════════════════════${colors.reset}`)
};

class PlatformTester {
  constructor() {
    this.baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
    });
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  async runAllTests() {
    console.log('\n🔬 QLA Mathematics Platform - System Testing\n');
    
    try {
      // 1. Environment Tests
      await this.testEnvironment();
      
      // 2. Database Tests
      await this.testDatabase();
      
      // 3. File System Tests
      await this.testFileSystem();
      
      // 4. API Endpoint Tests
      await this.testApiEndpoints();
      
      // 5. Authentication Tests
      await this.testAuthentication();
      
      // 6. Data Integrity Tests
      await this.testDataIntegrity();
      
      // 7. Performance Tests
      await this.testPerformance();
      
      // 8. Report
      this.generateReport();
      
    } catch (error) {
      log.error(`Fatal error during testing: ${error.message}`);
    } finally {
      await this.pool.end();
    }
  }

  async testEnvironment() {
    log.section('ENVIRONMENT CONFIGURATION');
    
    const requiredVars = [
      'DATABASE_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OAUTH_CALLBACK_URL',
      'ALLOWED_GOOGLE_DOMAIN',
      'COOKIE_SECRET',
      'TEACHER_EMAILS',
      'ADMIN_EMAILS'
    ];
    
    const optionalVars = [
      'GC_SERVICE_ACCOUNT',
      'GC_IMPERSONATE_USER',
      'NODE_ENV',
      'PORT'
    ];
    
    // Check required variables
    for (const varName of requiredVars) {
      if (process.env[varName]) {
        log.success(`${varName} is set`);
        this.testResults.passed++;
      } else {
        log.error(`${varName} is NOT set (REQUIRED)`);
        this.testResults.failed++;
      }
    }
    
    // Check optional variables
    for (const varName of optionalVars) {
      if (process.env[varName]) {
        log.info(`${varName} is set (optional)`);
      } else {
        log.warning(`${varName} is not set (optional)`);
        this.testResults.warnings++;
      }
    }
    
    // Validate specific formats
    if (process.env.COOKIE_SECRET && process.env.COOKIE_SECRET.length < 32) {
      log.warning('COOKIE_SECRET should be at least 32 characters');
      this.testResults.warnings++;
    }
    
    if (process.env.ALLOWED_GOOGLE_DOMAIN && !process.env.ALLOWED_GOOGLE_DOMAIN.includes('.')) {
      log.warning('ALLOWED_GOOGLE_DOMAIN might be invalid');
      this.testResults.warnings++;
    }
  }

  async testDatabase() {
    log.section('DATABASE CONNECTIVITY & STRUCTURE');
    
    try {
      // Test connection
      await this.pool.query('SELECT 1');
      log.success('Database connection successful');
      this.testResults.passed++;
      
      // Check tables exist
      const tables = [
        'lessons',
        'assignments',
        'assessments',
        'question_banks',
        'questions',
        'assessment_attempts',
        'progress',
        'progress_events',
        'classes',
        'teacher_classes',
        'enrollments'
      ];
      
      for (const table of tables) {
        const result = await this.pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table]
        );
        
        if (result.rows[0].exists) {
          log.success(`Table '${table}' exists`);
          this.testResults.passed++;
        } else {
          log.error(`Table '${table}' is missing`);
          this.testResults.failed++;
        }
      }
      
      // Check data seeding
      const checks = [
        { table: 'lessons', min: 1, name: 'Lessons' },
        { table: 'classes', min: 1, name: 'Classes' },
        { table: 'question_banks', min: 1, name: 'Question Banks' },
        { table: 'assessments', min: 1, name: 'Assessments' }
      ];
      
      for (const check of checks) {
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM ${check.table}`);
        const count = parseInt(result.rows[0].count);
        
        if (count >= check.min) {
          log.success(`${check.name}: ${count} records found`);
          this.testResults.passed++;
        } else {
          log.warning(`${check.name}: Only ${count} records (expected >= ${check.min})`);
          this.testResults.warnings++;
        }
      }
      
    } catch (error) {
      log.error(`Database test failed: ${error.message}`);
      this.testResults.failed++;
    }
  }

  async testFileSystem() {
    log.section('FILE SYSTEM & LESSON FILES');
    
    const dirs = [
      { path: 'public', required: true },
      { path: 'grade7', required: true },
      { path: 'grade8', required: true },
      { path: 'routes', required: true },
      { path: 'migrations', required: true },
      { path: 'uploads', required: false }
    ];
    
    for (const dir of dirs) {
      const fullPath = path.join(process.cwd(), dir.path);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(fullPath);
          log.success(`Directory '${dir.path}' exists (${files.length} items)`);
          this.testResults.passed++;
          
          // Check for lesson HTML files
          if (dir.path.startsWith('grade')) {
            const htmlFiles = files.filter(f => f.endsWith('.html'));
            if (htmlFiles.length > 0) {
              log.success(`  Found ${htmlFiles.length} HTML lessons`);
              this.testResults.passed++;
            } else {
              log.warning(`  No HTML lessons found in ${dir.path}`);
              this.testResults.warnings++;
            }
          }
        }
      } else if (dir.required) {
        log.error(`Required directory '${dir.path}' is missing`);
        this.testResults.failed++;
      } else {
        log.warning(`Optional directory '${dir.path}' is missing`);
        this.testResults.warnings++;
      }
    }
    
    // Check critical files
    const criticalFiles = [
      'server.js',
      'package.json',
      'auth/index.js',
      'public/portal-student.html',
      'public/portal-teacher.html',
      'public/portal-admin.html'
    ];
    
    for (const file of criticalFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        log.success(`Critical file '${file}' exists`);
        this.testResults.passed++;
      } else {
        log.error(`Critical file '${file}' is missing`);
        this.testResults.failed++;
      }
    }
  }

  async testApiEndpoints() {
    log.section('API ENDPOINT AVAILABILITY');
    
    const endpoints = [
      { path: '/api/health', method: 'GET', auth: false },
      { path: '/login', method: 'GET', auth: false },
      { path: '/', method: 'GET', auth: false }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.status < 500) {
          log.success(`${endpoint.method} ${endpoint.path} - Status: ${response.status}`);
          this.testResults.passed++;
        } else {
          log.error(`${endpoint.method} ${endpoint.path} - Server Error: ${response.status}`);
          this.testResults.failed++;
        }
      } catch (error) {
        log.error(`${endpoint.method} ${endpoint.path} - Failed: ${error.message}`);
        this.testResults.failed++;
      }
    }
  }

  async testAuthentication() {
    log.section('AUTHENTICATION CONFIGURATION');
    
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      log.success('Google OAuth credentials configured');
      this.testResults.passed++;
      
      // Check teacher/admin lists
      const teachers = (process.env.TEACHER_EMAILS || '').split(',').filter(Boolean);
      const admins = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);
      
      log.info(`${teachers.length} teacher email(s) configured`);
      log.info(`${admins.length} admin email(s) configured`);
      
      if (teachers.length === 0) {
        log.warning('No teacher emails configured');
        this.testResults.warnings++;
      }
      
      if (admins.length === 0) {
        log.warning('No admin emails configured');
        this.testResults.warnings++;
      }
      
      // Check domain restriction
      const domain = process.env.ALLOWED_GOOGLE_DOMAIN;
      if (domain) {
        log.success(`Domain restriction: @${domain}`);
        this.testResults.passed++;
      } else {
        log.warning('No domain restriction set');
        this.testResults.warnings++;
      }
    } else {
      log.error('Google OAuth not properly configured');
      this.testResults.failed++;
    }
  }

  async testDataIntegrity() {
    log.section('DATA INTEGRITY CHECKS');
    
    try {
      // Check for orphaned records
      const orphanChecks = [
        {
          name: 'Orphaned assessments',
          query: 'SELECT COUNT(*) as count FROM assessments a LEFT JOIN lessons l ON a.lesson_id = l.id WHERE l.id IS NULL'
        },
        {
          name: 'Orphaned questions',
          query: 'SELECT COUNT(*) as count FROM questions q LEFT JOIN question_banks b ON q.bank_id = b.id WHERE b.id IS NULL'
        },
        {
          name: 'Orphaned enrollments',
          query: 'SELECT COUNT(*) as count FROM enrollments e LEFT JOIN classes c ON e.class_id = c.id WHERE c.id IS NULL'
        }
      ];
      
      for (const check of orphanChecks) {
        const result = await this.pool.query(check.query);
        const count = parseInt(result.rows[0].count);
        
        if (count === 0) {
          log.success(`${check.name}: None found`);
          this.testResults.passed++;
        } else {
          log.warning(`${check.name}: ${count} found`);
          this.testResults.warnings++;
        }
      }
      
      // Check lesson consistency
      const lessonCheck = await this.pool.query(`
        SELECT grade, COUNT(*) as count 
        FROM lessons 
        WHERE grade IN (7, 8) 
        GROUP BY grade
      `);
      
      for (const row of lessonCheck.rows) {
        log.info(`Grade ${row.grade}: ${row.count} lessons`);
        if (parseInt(row.count) > 0) {
          this.testResults.passed++;
        }
      }
      
    } catch (error) {
      log.error(`Data integrity check failed: ${error.message}`);
      this.testResults.failed++;
    }
  }

  async testPerformance() {
    log.section('PERFORMANCE CHECKS');
    
    try {
      // Test database query performance
      const startDb = Date.now();
      await this.pool.query('SELECT COUNT(*) FROM lessons');
      const dbTime = Date.now() - startDb;
      
      if (dbTime < 100) {
        log.success(`Database query time: ${dbTime}ms (Good)`);
        this.testResults.passed++;
      } else if (dbTime < 500) {
        log.warning(`Database query time: ${dbTime}ms (Acceptable)`);
        this.testResults.warnings++;
      } else {
        log.error(`Database query time: ${dbTime}ms (Too slow)`);
        this.testResults.failed++;
      }
      
      // Test API response time
      const startApi = Date.now();
      await fetch(`${this.baseUrl}/api/health`);
      const apiTime = Date.now() - startApi;
      
      if (apiTime < 200) {
        log.success(`API response time: ${apiTime}ms (Good)`);
        this.testResults.passed++;
      } else if (apiTime < 1000) {
        log.warning(`API response time: ${apiTime}ms (Acceptable)`);
        this.testResults.warnings++;
      } else {
        log.error(`API response time: ${apiTime}ms (Too slow)`);
        this.testResults.failed++;
      }
      
    } catch (error) {
      log.error(`Performance check failed: ${error.message}`);
      this.testResults.failed++;
    }
  }

  generateReport() {
    log.section('TEST RESULTS SUMMARY');
    
    const total = this.testResults.passed + this.testResults.failed;
    const passRate = total > 0 ? Math.round((this.testResults.passed / total) * 100) : 0;
    
    console.log(`
${colors.green}Passed:${colors.reset}  ${this.testResults.passed}
${colors.red}Failed:${colors.reset}  ${this.testResults.failed}
${colors.yellow}Warnings:${colors.reset} ${this.testResults.warnings}
${colors.blue}Total Tests:${colors.reset} ${total}
${colors.magenta}Pass Rate:${colors.reset} ${passRate}%
    `);
    
    if (this.testResults.failed === 0) {
      console.log(`${colors.green}🎉 ALL TESTS PASSED! Platform is ready for deployment.${colors.reset}`);
    } else if (this.testResults.failed < 5) {
      console.log(`${colors.yellow}⚠️  Some tests failed. Review and fix issues before deployment.${colors.reset}`);
    } else {
      console.log(`${colors.red}❌ Multiple tests failed. Platform needs configuration fixes.${colors.reset}`);
    }
    
    // Recommendations
    if (this.testResults.warnings > 0) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      console.log('• Review warning messages above');
      console.log('• Consider setting optional environment variables');
      console.log('• Add more lesson content if needed');
      console.log('• Configure Google Classroom integration if required');
    }
    
    // Exit code based on failures
    process.exit(this.testResults.failed > 0 ? 1 : 0);
  }
}

// Run tests
const tester = new PlatformTester();
tester.runAllTests().catch(console.error);
