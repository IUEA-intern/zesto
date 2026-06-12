import db from "../config/db.js";

export const getRestaurantsByCity = async (req, res) => {

    try {

        const city = req.params.city;

        const [restaurants] = await db.query(
            "SELECT * FROM restaurants WHERE city = ?",
            [city]
        );

        res.status(200).json({
            success: true,
            restaurants
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};
export const getRestaurants = async (req,res)=>{

    try{

        const [restaurants] =
            await db.query(
                "SELECT * FROM restaurants"
            );

        res.json({
            success:true,
            restaurants
        });

    }catch(error){

        res.status(500).json({
            success:false,
            message:error.message
        });

    }
}