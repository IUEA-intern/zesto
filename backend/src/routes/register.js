const router = require('express').Router()
const { signUp} = require('../controllers/customer')

router.post('/regsiter', signUp)


module.exports = router
