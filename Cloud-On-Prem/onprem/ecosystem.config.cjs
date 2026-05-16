const os = require('os');
const path = require('path');
const fs = require('fs');
const defaultHome = process.env.LEARNPLAY_HOME || '/opt/learnplay/onprem';
const envFilePath = path.join(defaultHome, '.env');

function parseDotEnv(filePath) {
  const parsed = {};
  if (!fs.existsSync(filePath)) {
    return parsed;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }

    const key = normalized.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let value = normalized.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');

    parsed[key] = value;
  }

  return parsed;
}

function nodeSupportsEnvFile() {
  const [majorRaw = '0', minorRaw = '0'] = process.versions.node.split('.');
  const major = Number.parseInt(majorRaw, 10);
  const minor = Number.parseInt(minorRaw, 10);
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }
  return major > 20 || (major === 20 && minor >= 6);
}

const fileEnv = parseDotEnv(envFilePath);
const supportsEnvFile = nodeSupportsEnvFile();

// Detect available system resources
const totalCPUs = os.cpus().length;
const totalRAM = Math.floor(os.totalmem() / (1024 * 1024 * 1024)); // GB

// PM2 tuning based on available hardware
// For on-premises deployments, we recommend starting with 1 instance
// due to socket.io session affinity requirements (sticky sessions not easily configured in cluster mode)
const instances = process.env.PM2_INSTANCES ? parseInt(process.env.PM2_INSTANCES, 10) : 1;
const maxMemory = Math.max(
  512,
  Math.floor((totalRAM * 1024 * 0.6) / instances) // 60% of available RAM divided by instances
);

console.log(`[PM2 Config] System: ${totalCPUs} CPUs, ${totalRAM}GB RAM`);
console.log(`[PM2 Config] Configured: ${instances} instance(s), ${maxMemory}MB per instance`);
console.log(`[PM2 Config] Runtime: Node ${process.versions.node} (${supportsEnvFile ? 'native --env-file' : 'compat .env parsing'})`);

module.exports = {
  apps: [
    {
      name: 'learnplay',
      script: './server/index.js',
      cwd: defaultHome,
      instances: instances,
      exec_mode: 'fork', // Use 'fork' mode - 'cluster' mode requires sticky session configuration
      
      // Node.js arguments
      // Prefer --env-file on supported Node versions; fallback injects parsed .env via `env`.
      node_args: `${supportsEnvFile ? `--env-file=${envFilePath} ` : ''}--max-old-space-size=${maxMemory}`,
      
      // Environment variables (optional, can also be in .env file)
      env: {
        ...fileEnv,
        NODE_ENV: 'production',
        PORT: process.env.PORT || fileEnv.PORT || 3000,
      },
      
      // ============================================
      // Restart Policies
      // ============================================
      // Maximum number of restart attempts
      max_restarts: 10,
      // Minimum uptime before restart count resets (in seconds)
      min_uptime: '10s',
      // Delay between restart attempts (in milliseconds)
      restart_delay: 5000,
      // Automatically restart on file changes (development only)
      ignore_watch: ['node_modules', 'logs', 'dist'],
      // Watch directories for auto-restart (optional)
      // watch: ['server', 'migrations'],
      
      // ============================================
      // Logging Configuration
      // ============================================
      // Error log file location
      error_file: process.env.LEARNPLAY_LOG_DIR ? path.join(process.env.LEARNPLAY_LOG_DIR, 'error.log') : '/var/log/learnplay/error.log',
      // Standard output log file location
      out_file: process.env.LEARNPLAY_LOG_DIR ? path.join(process.env.LEARNPLAY_LOG_DIR, 'out.log') : '/var/log/learnplay/out.log',
      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Merge stdout and stderr into single log file
      merge_logs: true,
      // Maximum log file size before rotation (in bytes)
      // Uncomment to enable log rotation
      // max_size: '100M',
      // max_file: 5,
      
      // ============================================
      // Graceful Shutdown
      // ============================================
      // Time to wait for graceful shutdown before force killing (in milliseconds)
      kill_timeout: 10000,
      // Time to wait for app to listen on port before considering startup failed
      listen_timeout: 15000,
      // SIGTERM delay before SIGKILL
      wait_ready: false,
      
      // ============================================
      // Memory Management
      // ============================================
      // Automatically restart if memory usage exceeds this limit
      max_memory_restart: `${maxMemory}M`,
      
      // ============================================
      // Advanced Settings
      // ============================================
      // Disable PM2 auto-restart
      autorestart: true,
      // Number of sequential restarts before a crash is considered hard failure
      max_consecutive_restarts: 5,
      // Enable/disable PM2's cluster autoscaling
      // auto_pull: true,
    },
  ],

  // ============================================
  // Global PM2 Settings
  // ============================================
  deploy: {
    production: {
      user: 'learnplay',
      host: 'localhost',
      ref: 'origin/main',
      repo: process.env.GIT_REPO_URL || 'git@github.com:your-org/learnplay.git',
      path: defaultHome,
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-deploy-local': 'echo "Building locally before deployment"',
    },
  },
};
