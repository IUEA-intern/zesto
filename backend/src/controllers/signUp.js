const { query } = require('../config/db')
const bcrypt = require('bcryptjs')


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

	try {
    const hashedPassword = await bcrypt.hash(password, 10)

		if (isCustomer) {
			await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , password) VALUES (?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , hashedPassword] )
		} else if (isRider) {
			await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , vehicleType , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , vehicleType , hashedPassword] )
		} else if (isRestaurant) {
				await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , businessName , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , businessName , hashedPassword] )
		}

		return res.status(201).json({msg: "account regsiterd"})

	} catch(error) {
		if (error.errno === 1062) {
			return res.status(409).json({error:'User already exits'})
		}
		return res.status(500).json({error:'server error'})
		}
    }
  }

}

module.exports = { signUp }
