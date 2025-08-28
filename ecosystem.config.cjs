module.exports = {
  apps: [
    {
      name: 'jenni-api',
      script: 'node_modules/.bin/tsx',
      args: 'watch src/index.ts',
      cwd: __dirname,
      env: {
        PORT: '4000',
        NODE_ENV: 'development'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      time: true
    },
    {
      name: 'jenni-tunnel',
      script: './cloudflared',
      args: 'tunnel --url http://localhost:4000 --no-autoupdate',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      time: true
    }
  ]
};
