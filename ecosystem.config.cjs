/**
 * PM2 ecosystem file for production deployment.
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'gateway',
      cwd: './core/gateway',
      script: 'dist/server.js',
      node_args: '-r tsconfig-paths/register',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'security',
      cwd: './core/security',
      script: 'dist/server.js',
      node_args: '-r tsconfig-paths/register',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'registry',
      cwd: './core/registry',
      script: 'dist/server.js',
      node_args: '-r tsconfig-paths/register',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'lifecycle',
      cwd: './core/lifecycle',
      script: 'dist/server.js',
      node_args: '-r tsconfig-paths/register',
      env: { NODE_ENV: 'production' },
    },
  ],
};
