const db = require('../../db')
const bcrypt = require('bcrypt')


async function signUp(req, res) {
    const { name, email, phone, password, role } = req.body
    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({error : "missing fields"})
    }
    let connection;

    try {
    	 connection = db.getConnection();
    	 const hashedPassword = await bcrypt.hash(password, 10);

      const [query] = await connection.query(
        'INSERT INTO users (name,role , email,phone,password) VALUES (?,?,?,?,?))'
        , [name, role, email, phone, hashedPassword])

      return res.status(200).json({ })

    } catch (error) {

      if (error.errno === 1062) {
        return res.status(409).json({error:'Duplicate'})
      }
      return res.status(500).json({error:'server error'})

  } finally {

    if (connection) {
      connection.release()
    }
  }

}

module.exports = { signUp }
