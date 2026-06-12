import restaurantRoutes
from "./routes/restaurantRoute.js";

app.use(
    "/api/restaurants",
    restaurantRoutes
);