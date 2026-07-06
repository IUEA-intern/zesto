require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const http = require('http')
const { Server } = require('socket.io')
const app = require('./app')
const { testConnection } = require('./config/db')
const { initSocketManager } = require('./events/socketManager')

const PORT = process.env.PORT || 3000

const server = http.createServer(app)

// Allow all origins for Socket.IO so the React Native mobile app can connect
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  // Increase ping timeout for mobile clients on slow networks
  pingTimeout: 60000,
  pingInterval: 25000,
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
