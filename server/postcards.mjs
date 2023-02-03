import { spawn } from "child_process";
import mkdirp from "mkdirp";
import fs from "fs";
import path from "path";
import { stat, rename } from "fs/promises";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// TODO how to make sure the UI is not frozen. img not loaded etc..

const resultsFolder = "tmp_results";
const giveawaybacklogFolder = "/Users/gre/Desktop/giveawaybacklog";
const cwd = "/Users/gre/dev/gre/plots"


const generatorNames = {
  "732": "Machines",
  "894": "Art Deco",
  "886": "Tesselations",
  "829": "Square Slices",
  "828": "Mountain Slices"
}

const generatorExtraParams = {
  default: {
    width: 148.5,
    height: 105.0,
    pad: 5.0,
  }
}

function extraParams(generator) {
  const { width, height, pad } = {
    ...generatorExtraParams.default,
    ...generatorExtraParams[generator],
  }
  return [
    "--width", width,
    "--height", height,
    "--pad", pad,
  ]
}


/**
 * generative postcards giveway system where viewers are the curator.
 */

export default function (app, client) {
  const initialState = {
    generatorNames,
    generator: "", // id of the generator
    username: "", // username of the curator
    seed: 0,
  };

  let state = initialState;

  const stateListeners = [];
  function notify(s) {
    stateListeners.forEach((f) => f(s));
  }

  function dispatch(action) {
    switch (action.type) {
      case "start": {
        state = {
          ...initialState,
          username: action.username,
        };
        break;
      }
      case "set-generator": {
        state = {
          ...state,
          generator: action.generator,
          seed: Math.floor(Math.random() * 10000000),
        };
        break;
      }
      case "next-seed": {
        state = {
          ...state,
          seed: state.seed + 1,
        };
        break;
      }
      case "prev-seed": {
        state = {
          ...state,
          seed: state.seed - 1,
        };
        break;
      }
      case "reset": {
        state = initialState;
        break;
      }
    }
    notify(state);
  }

  const htmlListeners = [];
  let htmlFileDebounceT;
  fs.watch(path.join(__dirname, "./static/postcards.html"), (e, filename) => {
    if (filename) {
      if (htmlFileDebounceT) clearTimeout(htmlFileDebounceT);
      htmlFileDebounceT = setTimeout(() => {
        htmlListeners.forEach((f) => f());
      }, 500);
    }
  });

  client.on("message", (target, context, msg, self) => {
    if (self) return;
    const commandName = msg.trim();
    // !postcards start <username>
    if (context.badges?.broadcaster) {
      const m = commandName.match(/^!(postcards|pc) start ([^ ]+)$/);
      if (m) {
        const [, , username] = m;
        dispatch({ type: "start", username });
        client.say(target, `Ok, let's start the wheel!`);
        return;
      }

      // !postcards generator <id>
      const m2 = commandName.match(/^!(postcards|pc) (generator|gen) ([^ ]+)$/);
      if (m2) {
        const [, , , generator] = m2;
        if (state.username) {
          dispatch({ type: "set-generator", generator });
          client.say(target, `Ok ${state.username}, time for you to curate one postcard! Use "next" or "prev" and once satisfied, use "confirm" to save the postcard.`);
          generate(state);
        }
        else {
          client.say(target, `not started yet. !pc start <username>`);
        }
        return;
      }

    }

    if (context.username && context.username === state.username) {
      // possible commands for the curator
      // !postcards next
      if (commandName.startsWith("next") || commandName.startsWith("forward") || commandName.startsWith("continue")) {
        dispatch({ type: "next-seed" });
        generate(state);
        return;
      }
      // !postcards prev
      if (commandName.startsWith("prev") || commandName.startsWith("back")) {
        dispatch({ type: "prev-seed" });
        generate(state);
        return;
      }
      // !postcards confirm
      if (commandName === "confirm" || commandName === "!confirm") {
        saveToBacklog(getFileForState(state), state.username);
        client.say(target, `Ok ${state.username}, I saved your postcard. Please wait for the plot now to be executed!`);
        dispatch({ type: "reset" });
        return;
      }
    }
  });

  app.get("/postcards/state", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.write(`data: ${JSON.stringify((state))}\n\n`);
    function listen() {
      res.write(`data: ${JSON.stringify((state))}\n\n`);
    }
    function end() {
      console.log("/postcards/state closed");
      let i = stateListeners.indexOf(listen);
      if (i >= 0) stateListeners.splice(i, 1);
      i = htmlListeners.indexOf(end);
      if (i >= 0) htmlListeners.splice(i, 1);
      res.send();
    }
    stateListeners.push(listen);
    htmlListeners.push(end);
    req.on("close", end);
  });

  app.post("/postcards/set-generator", (req, res) => {
    const { generator } = req.body;
    console.log("set-generator", generator);
    dispatch({ type: "set-generator", generator });
    res.send();
  });

  app.get("/postcards/generate", (req, res) => {
    generate(req.query).then(
      (url) => {
        res.sendFile(url);
      },
      (e) => {
        console.warn(e);
        res.status(400).send();
      }
    );
  });

  function getFileForState({ generator, seed }) {
    if (!generator) throw new Error("no generator selected");
    const filename = `${generator}-${seed}.svg`;
    const file = path.join(process.cwd(), resultsFolder, filename);
    return file;
  }

  async function saveToBacklog(file, username) {
    const folder = path.join(giveawaybacklogFolder, username);
    await mkdirp(folder);
    const filename = path.basename(file);
    const dest = path.join(folder, filename);
    await rename(file, dest);
  }

  async function generate({ generator, seed }) {
    if (!generator) throw new Error("no generator selected");
    const file = getFileForState(state);
    const tmp = await mkdirp(resultsFolder);
    const exists = await stat(file).then(
      () => true,
      () => false
    );
    if (exists) {
      return file;
    }
    // cargo run --release --example <generator> -- --seed <seed> --file <file>
    const p = spawn("cargo", [
      "run",
      "--release",
      "--example", generator,
      "--",
      "--seed", seed,
      "--file", file,
      ...extraParams(generator)
    ], { cwd });
    p.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`);
    });
    p.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
    });
    await new Promise((success, failure) => {
      p.on("error", (e) => {
        console.error(e);
      });
      p.on("close", (code) => {
        if (code === 0) {
          success();
        } else {
          failure(new Error("command failed " + code));
        }
      });
    });
    return file;
  }
}
