import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { query } from "../config/pgDB.js";
dotenv.config();

export async function authenticateToken(req, res, next) {
  try {
    //const authHeader = req.headers["Authorization"];
    const { JWT_SECRET } = process.env;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    //console.log("Received Authorization header:", authHeader); // Debug

    if (!authHeader) {
      if (req.query.facility_id) {
        req.facilityId = req.query.facility_id;
        const { rows: facilities } = await query(
          `
            select * from facility where facility_id = $1
          `,
          [req.query.facility_id],
        );
        if (facilities.length === 0) {
          return res.status(404).json({ error: "Facility not found" });
        }
        req.facility = facilities[0];
        return next();
      } else {
        return res
          .status(401)
          .json({ error: "Unauthorized - Missing token and facility ID" });
      }
    }
    const token = authHeader && authHeader.split(" ")[1];

    if (!token)
      return res.status(401).json({ error: "Unauthorized - Missing token" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        // Differentiate between expired and invalid tokens
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            error: "Token expired",
            code: "TOKEN_EXPIRED", // Custom code for client handling
          });
        }
        return res.status(403).json({
          error: "Forbidden - Invalid token",
          details: err.message,
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.log({ error });

    return res.status(422).json({
      error: "Unprocessable Entity",
      details: error.message,
    });
  }
}
