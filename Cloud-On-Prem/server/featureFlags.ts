/**
 * Feature Flag System
 * 
 * Centralized configuration for gradual rollout of new features.
 * Allows safe A/B testing and easy rollback without code changes.
 */

export interface FeatureFlags {
  SESSION_AUTH_ENABLED: boolean; // Use session-based auth instead of database lookups
  SESSION_PAYLOAD_MONITORING: boolean; // Track session payload sizes
  ENABLE_MULTI_ORG_SWITCHING: boolean; // Allow users to switch between organizations
  ENABLE_QUIZ_CREDIT_CHARGING: boolean; // Controls whether quiz generation deducts LP Credits and whether LP Credits terminology is shown
  COURSE_VISIBILITY_ENABLED: boolean; // Controls course visibility enforcement (public vs org_only)
  ENABLE_AI_THUMBNAILS: boolean; // Controls AI-powered course thumbnail generation feature
  ONPREM_OWN_API_KEYS: boolean; // Always true for on-prem — customers must provide their own API keys
  PAYMENT_GATEWAY_ENABLED: boolean; // Whether Yoco payment gateway is available for credit purchases
  ONPREM_MODE: boolean; // Whether running in on-premises mode
  CF_V2_SEGMENTS_ENABLED: boolean; // Enables segment persistence for draft documents
  CF_V2_ASSIGNMENT_ENFORCED: boolean; // Enables deterministic topic assignment APIs and enforcement
  CF_V2_FINALIZE_COVERAGE_GATE: boolean; // Blocks finalize unless source coverage invariants pass
  CF_V2_NO_SUMMARIZATION: boolean; // Disables summarization in framework/topic analysis paths
  CF_V2_NO_FRAMEWORK_GENERATION: boolean; // Disables AI-authored framework lesson content generation
}

function resolveDeploymentMode(): 'cloud' | 'onprem' {
  const deploymentMode = (process.env.DEPLOYMENT_MODE || '').trim().toLowerCase();
  if (deploymentMode === 'onprem') {
    return 'onprem';
  }
  if (deploymentMode === 'cloud') {
    return 'cloud';
  }
  return process.env.ONPREM_MODE === 'true' ? 'onprem' : 'cloud';
}

/**
 * Get current feature flag configuration
 * Reads from environment variables with sensible defaults
 */
export function getFeatureFlags(): FeatureFlags {
  const isOnPrem = resolveDeploymentMode() === 'onprem';
  return {
    // Session-based auth is production default.
    // Operators can still force-disable with SESSION_AUTH_ENABLED=false.
    SESSION_AUTH_ENABLED: process.env.SESSION_AUTH_ENABLED !== 'false',
    
    // Session payload monitoring - always enabled to track metrics
    SESSION_PAYLOAD_MONITORING: process.env.SESSION_PAYLOAD_MONITORING !== 'false',
    
    // Multi-org switching - defaults to true once session auth is enabled
    ENABLE_MULTI_ORG_SWITCHING: process.env.ENABLE_MULTI_ORG_SWITCHING !== 'false',
    
    // Quiz credit charging - defaults to true (charges LP Credits and shows terminology)
    // Set ENABLE_QUIZ_CREDIT_CHARGING=false to disable credit deductions and hide LP Credits UI
    ENABLE_QUIZ_CREDIT_CHARGING: process.env.ENABLE_QUIZ_CREDIT_CHARGING !== 'false',
    
    // Course visibility enforcement - defaults to true
    // When disabled, all courses are accessible regardless of visibility setting
    // Set COURSE_VISIBILITY_ENABLED=false to bypass visibility checks (emergency rollback)
    COURSE_VISIBILITY_ENABLED: process.env.COURSE_VISIBILITY_ENABLED !== 'false',
    
    // AI thumbnail generation - defaults to true
    // When disabled, "Generate Thumbnail" buttons are hidden and only manual upload is available
    // Set ENABLE_AI_THUMBNAILS=false to disable AI thumbnail generation (emergency rollback)
    ENABLE_AI_THUMBNAILS: process.env.ENABLE_AI_THUMBNAILS !== 'false',
    ONPREM_OWN_API_KEYS: isOnPrem ? true : process.env.ONPREM_OWN_API_KEYS === 'true',
    PAYMENT_GATEWAY_ENABLED: process.env.PAYMENT_GATEWAY_ENABLED !== undefined 
      ? process.env.PAYMENT_GATEWAY_ENABLED === 'true'
      : (isOnPrem ? false : true),
    ONPREM_MODE: isOnPrem,
    CF_V2_SEGMENTS_ENABLED: process.env.CF_V2_SEGMENTS_ENABLED === 'true',
    CF_V2_ASSIGNMENT_ENFORCED: process.env.CF_V2_ASSIGNMENT_ENFORCED === 'true',
    CF_V2_FINALIZE_COVERAGE_GATE: process.env.CF_V2_FINALIZE_COVERAGE_GATE === 'true',
    CF_V2_NO_SUMMARIZATION: process.env.CF_V2_NO_SUMMARIZATION === 'true',
    CF_V2_NO_FRAMEWORK_GENERATION: process.env.CF_V2_NO_FRAMEWORK_GENERATION === 'true',
  };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  return flags[feature];
}

/**
 * Check if quiz credit charging is enabled
 * 
 * When enabled (default):
 * - Quiz generation deducts LP Credits from the user's wallet
 * - LP Credits terminology is shown throughout the UI
 * 
 * When disabled:
 * - Quiz generation does NOT deduct any credits
 * - LP Credits terminology is hidden from the UI
 * 
 * @returns boolean - true if quiz credit charging is enabled
 */
export function isQuizCreditChargingEnabled(): boolean {
  return getFeatureFlags().ENABLE_QUIZ_CREDIT_CHARGING;
}

/**
 * Check if course visibility enforcement is enabled
 * 
 * When enabled (default):
 * - Course visibility settings (public vs org_only) are enforced
 * - CourseVisibilityService.checkCourseAccess uses visibility rules
 * - Visibility field appears in course editing UI
 * 
 * When disabled (emergency rollback):
 * - All visibility checks are bypassed
 * - All courses are accessible to authenticated users (legacy behavior)
 * - Visibility field is hidden from UI
 * 
 * @returns boolean - true if course visibility enforcement is enabled
 */
export function isCourseVisibilityEnabled(): boolean {
  return getFeatureFlags().COURSE_VISIBILITY_ENABLED;
}

/**
 * Log feature flag status on application startup
 */
/**
 * Check if AI thumbnail generation is enabled
 * 
 * When enabled (default):
 * - "Generate Thumbnail" button is shown in Course Builder
 * - AI thumbnail generation endpoint is active
 * - LP Credits are charged for thumbnail generation
 * 
 * When disabled (emergency rollback):
 * - AI generation buttons are hidden
 * - Only manual thumbnail upload is available
 * - Endpoint returns 503 Service Unavailable
 * 
 * @returns boolean - true if AI thumbnail generation is enabled
 */
export function isAIThumbnailsEnabled(): boolean {
  return getFeatureFlags().ENABLE_AI_THUMBNAILS;
}

export function isOnPremOwnApiKeys(): boolean {
  return getFeatureFlags().ONPREM_OWN_API_KEYS;
}

export function isPaymentGatewayEnabled(): boolean {
  return getFeatureFlags().PAYMENT_GATEWAY_ENABLED;
}

export function isOnPremMode(): boolean {
  return getFeatureFlags().ONPREM_MODE;
}

export function logFeatureFlags(): void {
  const flags = getFeatureFlags();
  console.log('🚩 Feature Flags Configuration:');
  console.log(`   SESSION_AUTH_ENABLED: ${flags.SESSION_AUTH_ENABLED}`);
  console.log(`   SESSION_PAYLOAD_MONITORING: ${flags.SESSION_PAYLOAD_MONITORING}`);
  console.log(`   ENABLE_MULTI_ORG_SWITCHING: ${flags.ENABLE_MULTI_ORG_SWITCHING}`);
  console.log(`   ENABLE_QUIZ_CREDIT_CHARGING: ${flags.ENABLE_QUIZ_CREDIT_CHARGING}`);
  console.log(`   COURSE_VISIBILITY_ENABLED: ${flags.COURSE_VISIBILITY_ENABLED}`);
  console.log(`   ENABLE_AI_THUMBNAILS: ${flags.ENABLE_AI_THUMBNAILS}`);
  console.log(`   CF_V2_SEGMENTS_ENABLED: ${flags.CF_V2_SEGMENTS_ENABLED}`);
  console.log(`   CF_V2_ASSIGNMENT_ENFORCED: ${flags.CF_V2_ASSIGNMENT_ENFORCED}`);
  console.log(`   CF_V2_FINALIZE_COVERAGE_GATE: ${flags.CF_V2_FINALIZE_COVERAGE_GATE}`);
  console.log(`   CF_V2_NO_SUMMARIZATION: ${flags.CF_V2_NO_SUMMARIZATION}`);
  console.log(`   CF_V2_NO_FRAMEWORK_GENERATION: ${flags.CF_V2_NO_FRAMEWORK_GENERATION}`);
  
  if (flags.SESSION_AUTH_ENABLED) {
    console.log('⚡ Session-based authentication is ENABLED - using cached session context');
  } else {
    console.log('🐌 Session-based authentication is DISABLED - using database lookups (slower)');
  }
  
  if (flags.ENABLE_QUIZ_CREDIT_CHARGING) {
    console.log('💳 Quiz credit charging is ENABLED - LP Credits will be deducted for quiz generation');
  } else {
    console.log('🆓 Quiz credit charging is DISABLED - quiz generation is free');
  }
  
  if (flags.COURSE_VISIBILITY_ENABLED) {
    console.log('👁️ Course visibility is ENABLED - enforcing public/org_only access controls');
  } else {
    console.log('⚠️ Course visibility is DISABLED - all visibility checks bypassed (rollback mode)');
  }
  
  if (flags.ENABLE_AI_THUMBNAILS) {
    console.log('🎨 AI thumbnails is ENABLED - users can generate course thumbnails with AI');
  } else {
    console.log('⚠️ AI thumbnails is DISABLED - only manual thumbnail upload available');
  }
  
  if (flags.ONPREM_MODE) {
    console.log('🏢 On-premises mode is ENABLED');
    console.log('🔑 Using customer-provided API keys');
  }
  if (!flags.PAYMENT_GATEWAY_ENABLED) {
    console.log('💳 Payment gateway is DISABLED - credit purchases not available');
  }
}
