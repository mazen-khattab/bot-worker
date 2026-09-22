module.exports = {
  apps: [
    {
      name: 'bot-worker',
      script: 'dist/server.js',
      instances: 1, // Keep at 1: a singleton Playwright browser per process is the design assumption.
      exec_mode: 'fork',
      max_memory_restart: '1G',

      // Give in-flight jobs (queue drain + browser close) real time to finish
      // before PM2 force-kills the process. Tune this to your worst-case
      // batch duration.
      kill_timeout: 45_000,

      // How long PM2 waits for the app to be "ready" before considering the
      // restart failed. Not critical here since we don't use PM2's
      // wait_ready protocol, but kept generous for slow browser startups.
      listen_timeout: 15_000,

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
