import "dotenv/config";
import express from "express";
import pino from "pino-http";
import { jenni } from "./routes/jenni.js";
import { webhook } from "./routes/webhook.js";
import "./queue.js"; // initialise queue workers

const app = express();
app.use(pino());
app.use(express.json());

app.use("/v1", jenni);
app.use("/webhooks", webhook);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`▶ JENNi-Universal running on :${port}`));
