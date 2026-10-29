module.exports = {
  apps: [
    {
      name: 'hindholidays-crm-api',
      cwd: '/var/www/crm.hindholidays.com/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
