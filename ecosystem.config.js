module.exports = {
  apps: [
    {
      name: 'brain-space-chat',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      // Auto restart settings
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Error handling
      min_uptime: '10s',
      max_restarts: 10,
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced settings
      merge_logs: true,
      time: true,
      
      // Source map support for TypeScript
      node_args: '--enable-source-maps',
      
      // Kill timeout
      kill_timeout: 3000,
      
      // Wait time before restart
      wait_ready: true,
      listen_timeout: 10000,
      
      // Cron restart (optional - restart every night at 2 AM)
      cron_restart: '0 2 * * *',
      
      // Environment variables
      env_file: '.env'
    }
  ]
};
