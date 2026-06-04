// controllers/signin.js
const db     = require('../../db')
const bcrypt = require('bcrypt')
const jwt    = require('jsonwebtoken')

async function customerSignIn(req, res) {

  // 1. Pull email and password from the request body
  const { email, password } = req.body

  // 2. Validate — both fields are required
  if (!email || !password) {
    return res.status(400).json({ error: 'missing fields' })
  }

  const connection = await db.getConnection()

  try {

    // 3. Look up the user by email in the database
    const [rows] = await connection.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    )

    connection.release()

    // 4. If no user found, return a vague error (prevents email enumeration)
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = rows[0]

    // 5. Compare the submitted password with the hashed password stored in DB
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // 6. Password is correct — generate a JWT token
    const token = jwt.sign(
      {
        id:        user.id,
        email:     user.email,
        firstName: user.firstName,
        lastName:  user.lastName,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    // 7. Return the token and basic user info (never return the password)
    return res.status(200).json({
      token,
      user: {
        id:          user.id,
        firstName:   user.firstName,
        lastName:    user.lastName,
        email:       user.email,
        phoneNumber: user.phone,
      }
    })

  } catch (err) {
    connection.release()
    return res.status(500).json({ error: 'server error' })
  }
}

module.exports = { customerSignIn }