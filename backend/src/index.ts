import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import passport from "passport";

import { connectDB } from "./config/database.ts";
import { configurePassport } from "./config/passport";
import { errorHandler } from "./middleware/errorHandler.middleware.ts";
import { env } from "./config/env.ts";
import { authRouter } from "./routes/auth.routes";

const app = express();

configurePassport();

app.use(helmet());

app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true
}));

app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(passport.initialize());

app.get("/", (req, res) => {
  res.json({
    message: "DevDoctor API Running"
  });
});

app.use("/api/auth", authRouter);

app.use(errorHandler);

const start = async () => {

  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });

};

start();
