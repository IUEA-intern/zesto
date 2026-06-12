import express from "express";

import {
    getRestaurants,
    getRestaurantsByCity
} from "../controllers/restaurantController.js";

const router = express.Router();

router.get("/", getRestaurants);

router.get(
    "/city/:city",
    getRestaurantsByCity
);

export default router;