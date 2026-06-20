import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/database.ts";
import { errorHandler } from "./middleware/errorHandler.middleware.ts";
import { env } from "./config/env.ts";

const app = express();

app.use(helmet());

app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true
}));

app.use(morgan("dev"));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "DevDoctor API Running"
  });
});

app.use(errorHandler);

const start = async () => {

  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });

};

start();