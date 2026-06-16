const router = require('express').Router()
const { signUp} = require('../controllers/signUp')

router.post('/regsiter', signUp)


module.exports = router
