const { PrismaClient } = require('@prisma/client');
let prisma;
if (!global.__PRISMA__) {
  global.__PRISMA__ = new PrismaClient();
}
prisma = global.__PRISMA__;
module.exports = prisma;
