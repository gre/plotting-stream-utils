import { spawn } from "child_process";
import mkdirp from "mkdirp";
import rimraf from "rimraf";
import path from "path";
import { stat } from "fs/promises";

const resultsFolder = "tmp_results";

export default function (app, client) {
  const initialState = {
    totalGenerations: 20,
    generationDurationSec: 60,
    population: 2,
    command: "",
    cwd: "",
    generationStartTime: 0,
    generationIndex: 0,
    seed: [0, 0, 0],
    votesPerUsername: {},
    choices: [],
  };

  let state = initialState;
  let curationLoopInterval;

  client.on("message", (target, context, msg, self) => {
    if (self) return;
    const commandName = msg.trim();
    if (context.badges?.broadcaster) {
      if (commandName === "!curate start") {
        const v = validateCurationReadiness(state);
        if (v) {
          client.say(target, v);
        } else {
          startCurationLoop(target);
        }
        return;
      }
    }
    if (commandName.startsWith("!curate")) {
      const n = parseInt(commandName.slice(7), 10);
      if (isNaN(n)) return;
      const { username } = context;
      const v = validateValidActionVote(state, username, n);
      if (v) {
        client.say(target, v);
        return;
      }
      state = actionVote(state, username, n);
    }
  });

  function startCurationLoop(target) {
    rimraf(resultsFolder, () => {
      if (curationLoopInterval) clearInterval(curationLoopInterval);
      state = actionCurationStart(state);
      client.say(
        target,
        "Curation has been activated! You can now use !curate <number>"
      );
      curationLoopInterval = setInterval(() => {
        if (!curationIsActive(state)) {
          console.log("inative curation");
          return;
        }
        if (curationIsFinished(state)) {
          console.log("curation finished");
          clearInterval(curationLoopInterval);
          return;
        }
        if (generationIsFinished(state)) {
          state = actionGenerationEnd(state, (msg) => client.say(target, msg));
          if (curationIsFinished(state)) {
            client.say(
              target,
              "@greweb The community has spoken, curated seed is [" +
                state.seed.join(", ") +
                "]"
            );
          } else {
            client.say(
              target,
              "Generation " +
                (state.generationIndex + 1) +
                "/" +
                state.totalGenerations +
                ". You can vote with !curate <number>"
            );
          }
        }
      }, 1000);
    });
  }

  app.get("/curator/state", (req, res) => {
    res.send(state);
  });

  app.post("/curator/state", (req, res) => {
    state = {
      ...initialState,
      ...req.body,
    };
  });

  async function generate(choice) {
    if (!state.command) throw new Error("no command set in admin");
    const tmp = await mkdirp(resultsFolder);
    const filename = choice.join("-") + ".svg";
    const file = path.join(process.cwd(), resultsFolder, filename);
    const exists = await stat(file).then(
      () => true,
      () => false
    );
    if (exists) {
      return file;
    }
    const args = [
      ...choice.flatMap((choice, i) => ["--seed" + (i + 1) + "=" + choice]),
      "--file",
      file,
    ];
    const p = spawn(state.command, args, {      cwd: state.cwd,
    });
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
          failure(new Error("command " + state.command + " failed " + code));
        }
      });
    });
    return file;
  }

  app.get("/curator/generate", (req, res) => {
    let choice;
    try {
      choice = JSON.parse(req.query.choice);
    } catch (e) {
      res.status(400).send();
      return;
    }
    generate(choice).then(
      (url) => {
        res.sendFile(url);
      },
      (e) => {
        console.warn(e);
        res.status(400).send();
      }
    );
  });
}

function mat3Multiply(out, a, b) {
  var a00 = a[0],
    a01 = a[1],
    a02 = a[2];
  var a10 = a[3],
    a11 = a[4],
    a12 = a[5];
  var a20 = a[6],
    a21 = a[7],
    a22 = a[8];
  var b00 = b[0],
    b01 = b[1],
    b02 = b[2];
  var b10 = b[3],
    b11 = b[4],
    b12 = b[5];
  var b20 = b[6],
    b21 = b[7],
    b22 = b[8];
  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;
  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;
  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
}

function transformMat3(out, a, m) {
  var x = a[0],
    y = a[1],
    z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}

function mat3FromAngleAndAxis(a, u) {
  var x = u[0];
  var y = u[1];
  var z = u[2];
  var c = Math.cos(a);
  var s = Math.sin(a);
  // prettier-ignore
  return [
    x*x*(1-c)+c, x*y*(1-c)-z*s, x*z*(1-c)+y*s,
    x*y*(1-c)+z*s, y*y*(1-c)+c, y*z*(1-c)-x*s,
    x*z*(1-c)-y*s, y*z*(1-c)+x*s, z*z*(1-c)+c
  ];
}

function vec3add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
}

function randomVectors(n = 2) {
  const vectors = [];
  let min = 0.4;
  const { PI, random } = Math;
  let a1 = 2 * PI * random(),
    a2 = 2 * PI * random();
  for (let i = 0; i < n; i++) {
    const matRot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    mat3Multiply(matRot, matRot, mat3FromAngleAndAxis(a1, [1, 0, 0]));
    mat3Multiply(matRot, matRot, mat3FromAngleAndAxis(a2, [0, 1, 0]));
    const v = [0, 0, 1];
    transformMat3(v, v, matRot);
    vectors.push(v);
    a1 += min + random() * ((2 * PI - min) / n);
    a2 += min + random() * ((2 * PI - min) / n);
  }
  return vectors;
}

function curationIsFinished(s) {
  return s.generationIndex >= s.totalGenerations;
}

function generationIsFinished(s) {
  return Date.now() - s.generationStartTime > 1000 * s.generationDurationSec;
}

function validateCurationReadiness(s) {
  if (!s.command) return "@greweb The art command is not yet defined.";
}

function curationIsActive(s) {
  return !!s.generationStartTime;
}

function validateValidActionVote(s, username, index) {
  if (curationIsFinished(s))
    return "Sorry @" + username + ", the curation is over!";
  if (username in s.votesPerUsername)
    return (
      "Sorry @" +
      username +
      ", you already voted for generation " +
      (s.generationIndex + 1) +
      "."
    );
  if (!(index in s.choices))
    return (
      "Sorry @" +
      username +
      ", valid options are: " +
      s.choices.map((_, i) => i).join(", ")
    );
}

function actionVote(s, username, index) {
  s = { ...s };
  s.votesPerUsername = {
    ...s.votesPerUsername,
    [username]: index,
  };
  return s;
}

function actionCurationStart(s) {
  s = { ...s };
  s.generationStartTime = Date.now();
  s.choices = randomVectors(s.population).map(seedRound);
  return s;
}

function actionCurationPause(s) {
  s = { ...s };
  s.generationStartTime = 0;
  return s;
}

function actionGenerationEnd(s, log) {
  if (curationIsFinished(s)) {
    return s;
  }
  s = { ...s };
  let counts = Array(s.choices.length).fill(0);
  Object.values(s.votesPerUsername).forEach((i) => {
    counts[i]++;
  });
  counts = counts.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  if (counts[0][0] === counts[1][0]) {
    log("Draw! no changes.");
    // equality is noop!
  } else {
    const winner = counts[0][1];
    s.seed = s.choices[winner];
    log("Option " + winner + " won! Seed is now: [" + s.seed.join(", ") + "]");
  }
  const choices = randomVectors(s.choices.length);
  choices.forEach((c) => vec3add(c, c, s.seed));
  s.choices = choices.map(seedRound);
  s.generationStartTime = Date.now();
  s.generationIndex++;
  s.votesPerUsername = {};
  return s;
}

function seedRound(s) {
  return s.map((v) => Math.floor(v * 100) / 100);
}
