const express = require('express')
const cors    = require('cors')
const app     = express()

app.use(cors({ // to be able to test on server machine
  origin: 'http://localhost:5500',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

app.use('/api/auth',      require('./routes/register'))
app.use('/api/search',    require('./routes/search'))
app.use('/api/signin',    require('./routes/signin'))
app.use('/api/investors', require('./routes/investors'))

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

module.exports =  app
