// Delegates to the root hardened server and exports the Express app for Vercel Serverless Functions
const app = require('../server.js')
module.exports = app
