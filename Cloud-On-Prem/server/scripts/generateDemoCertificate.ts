import { CertificateService } from '../services/certificateService';

/**
 * Generate Course Completion Certificate for Demo User
 * 
 * This script issues a course completion certificate for the demo user who has
 * successfully completed all required quizzes in the course.
 * 
 * Usage: npx tsx server/scripts/generateDemoCertificate.ts
 */

async function generateDemoCertificate() {
  const demoUserId = '246a9ee2-1a15-498f-a0c9-2f34032217fa';
  const courseId = 'e4cdf7ff-6dce-4681-bd2d-33e468570fc2';
  const organizationId = '4fdde81a-2f4e-4fea-aa33-6fa6f6f2326c';
  
  console.log('[Demo Certificate] Starting certificate generation...');
  console.log(`[Demo Certificate] Course ID: ${courseId}`);
  console.log(`[Demo Certificate] User ID: ${demoUserId}`);
  console.log(`[Demo Certificate] Organization ID: ${organizationId}`);
  
  try {
    // Issue the course completion certificate
    // The service will validate eligibility (all quizzes passed) internally
    const certificate = await CertificateService.issueCourseCompletionCertificate({
      courseId,
      userId: demoUserId,
      organizationId,
      xpEarned: 500, // Default XP for course completion
    });
    
    console.log('\n✅ [Demo Certificate] SUCCESS!');
    console.log(`[Demo Certificate] Certificate ID: ${certificate.certificateId}`);
    console.log(`[Demo Certificate] Learner Name: ${certificate.learnerName}`);
    console.log(`[Demo Certificate] Course Title: ${certificate.courseTitle}`);
    console.log(`[Demo Certificate] XP Awarded: ${certificate.xpEarned}`);
    console.log(`[Demo Certificate] Completed At: ${certificate.completedAt}`);
    console.log(`[Demo Certificate] Storage Path: ${certificate.pdfStoragePath}`);
    console.log('\n[Demo Certificate] The certificate has been generated and stored in object storage.');
    console.log('[Demo Certificate] The demo user should now see this certificate in their certificates list.');
    
  } catch (error) {
    console.error('\n❌ [Demo Certificate] ERROR:', error);
    if (error instanceof Error) {
      console.error('[Demo Certificate] Message:', error.message);
      console.error('[Demo Certificate] Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
generateDemoCertificate();
