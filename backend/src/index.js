require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const http = require('http')
const { Server } = require('socket.io')
const app = require('./app')
const { testConnection } = require('./config/db')
const { initSocketManager } = require('./events/socketManager')

const PORT = process.env.PORT || 3000
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:5500'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.set('io', io)
app.set('socketEmitters', initSocketManager(io))

async function start() {
  await testConnection()
  server.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('[SERVER START FAILED]', err)
  process.exit(1)
})
