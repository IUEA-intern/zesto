const db = require('../../db')
const bcrypt = require('bcrypt')

async function customerSignUp(req,res) {

	const {firstName , lastName , email , phoneNumber , password } = req.body
	
	if (!firstName || !lastName ||  !email ||  !phoneNumber || !password ){
		return res.status(400).json({error : 'missing fields'})
	}
	
	const connection = await db.getConnection()
	const hashedPassword = await bcrypt.hash(password,10)	
	try {
		const operation = await connection.query(
		'INSERT INTO users(firstName,lastName,email,password,phone) VALUES (?,?,?,?,?)' 
		, [firstName , lastName , email , hashPassword , phoneNumber]
		)
		connection.release()
		return res.status(201).json({})
	}catch(err) {
		connection.release()
		if (err.errno === 1062) {
		return res.status(409).json({error:'Email already exits'})
		}
		
		return res.status(500).json({error:'server error'})
	}
	
}

module.exports = { customerSignUp }
