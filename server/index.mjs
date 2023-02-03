import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import axidrawServer from "./axidraw.mjs";
import giveawayServer from "./giveaway.mjs";
import curatorServer from "./curator.mjs";
import chat from "./chat.mjs";
import postcardsServer from "./postcards.mjs";

const client = chat();

const port = 3887;
const app = express();
app.use(morgan("tiny"));
app.use(express.static("static"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

curatorServer(app, client);
axidrawServer(app, client);
giveawayServer(app, client);
postcardsServer(app, client);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
