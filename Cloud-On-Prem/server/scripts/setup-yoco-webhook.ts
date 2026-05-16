import axios from 'axios';

/**
 * Script to register webhook with YOCO and retrieve webhook secret
 * 
 * Usage:
 * tsx server/scripts/setup-yoco-webhook.ts <mode> <secret_key>
 * 
 * Example:
 * tsx server/scripts/setup-yoco-webhook.ts test sk_test_xxxxxxxxxxxxx
 * tsx server/scripts/setup-yoco-webhook.ts live sk_live_xxxxxxxxxxxxx
 */

const mode = process.argv[2];
const secretKey = process.argv[3];

if (!mode || !secretKey) {
  console.error('❌ Usage: tsx server/scripts/setup-yoco-webhook.ts <mode> <secret_key>');
  console.error('   mode: "test" or "live"');
  console.error('   secret_key: Your YOCO secret key (sk_test_xxx or sk_live_xxx)');
  process.exit(1);
}

if (mode !== 'test' && mode !== 'live') {
  console.error('❌ Mode must be "test" or "live"');
  process.exit(1);
}

const configuredBaseUrl = process.env.BASE_URL?.trim();
if (!configuredBaseUrl) {
  console.error('❌ BASE_URL environment variable is required');
  process.exit(1);
}
const webhookUrl = `${configuredBaseUrl.replace(/\/+$/, '')}/api/webhooks/yoco`;

async function registerWebhook() {
  try {
    console.log(`\n🔧 Registering YOCO webhook in ${mode.toUpperCase()} mode...`);
    console.log(`📍 Webhook URL: ${webhookUrl}`);
    
    const response = await axios.post(
      'https://payments.yoco.com/api/webhooks',
      {
        name: `learnplay-${mode}`,
        url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const webhookData = response.data;

    console.log('\n✅ Webhook registered successfully!\n');
    console.log('📋 Webhook Details:');
    console.log('━'.repeat(60));
    console.log(`   ID:     ${webhookData.id}`);
    console.log(`   Mode:   ${webhookData.mode}`);
    console.log(`   Name:   ${webhookData.name}`);
    console.log(`   URL:    ${webhookData.url}`);
    console.log('━'.repeat(60));
    console.log('\n🔐 WEBHOOK SECRET (IMPORTANT):');
    console.log('━'.repeat(60));
    console.log(`   ${webhookData.secret}`);
    console.log('━'.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Copy the webhook secret above');
    console.log('   2. Open Replit Secrets (lock icon in left sidebar)');
    console.log('   3. Add new secret: YOCO_WEBHOOK_SECRET');
    console.log('   4. Paste the secret value');
    console.log('   5. Restart your application\n');

  } catch (error: any) {
    console.error('\n❌ Failed to register webhook:');
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('\n💡 This usually means:');
        console.error('   - Invalid or expired secret key');
        console.error('   - Make sure you\'re using the correct key for the mode');
        console.error('   - Test mode: sk_test_xxx');
        console.error('   - Live mode: sk_live_xxx');
      }
    } else {
      console.error('   Error:', error.message);
    }
    
    process.exit(1);
  }
}

registerWebhook();
