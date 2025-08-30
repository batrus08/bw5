{
  "name": "bw1-backend",
  "version": "1.0.0",
  "private": true,
  "description": "Backend WA & Telegram bot (Express + Prisma) siap deploy di Railway",
  "main": "server.js",
  "engines": {
    "node": "20.x"
  },
  "scripts": {
    "start": "prisma generate && prisma db push && node server.js",
    "dev": "node server.js",
    "prisma:generate": "prisma generate",
    "prisma:db-push": "prisma db push",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:dev": "prisma migrate dev --name init",
    "seed": "node src/db/migrate/seed.js",
    "postinstall": "prisma generate",
    "start:safe": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "@prisma/client": "^5.22.0",
    "prisma": "^5.22.0"
  },
  "devDependencies": {},
  "license": "MIT"
}
