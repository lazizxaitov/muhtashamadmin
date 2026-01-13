module.exports = {
  apps: [
    {
      name: "muhtasham-admin",
      script: "bash",
      args: [
        "-lc",
        [
          "set -e",
          "cd \"${PWD}\"",
          "if [ -f .env.production.local ]; then set -a; . ./.env.production.local; set +a; fi",
          "PORT=${PORT:-3000}",
          "node_modules/next/dist/bin/next start -p \"$PORT\"",
        ].join(" && "),
      ].join(" "),
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
