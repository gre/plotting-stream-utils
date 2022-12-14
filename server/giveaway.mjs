const resultsFolder = "tmp_results";

export default function (app, client) {
  let state = {
    opened: false,
    users: [],
    interval: null,
  };

  function reset() {
    if (state.interval) {
      clearInterval(state.interval);
    }
    state = { opened: false, users: [], interval: null };
  }

  client.on("message", (target, context, msg, self) => {
    if (self) return;
    const commandName = msg.trim();
    if (context.badges?.broadcaster) {
      if (commandName === "!giveaway-start") {
        if (state.opened) {
          client.say(target, "Giveaway is already started.");
          return;
        }
        client.say(
          target,
          "Giveaway is starting: type !giveaway to participate and get the chance to obtain a physical plot shipped to you – offered and signed by @greweb"
        );
        state.opened = true;
        state.interval = setInterval(() => {
          client.say(
            target,
            "A giveaway is ongoing... type !giveaway to get the chance to obtain a physical plot shipped to you – offered and signed by @greweb"
          );
        }, 60000);
        return;
      } else if (commandName === "!giveaway-reset") {
        client.say(target, "Giveaway was reset.");
        reset();
        return;
      } else if (
        commandName === "!giveaway-finish" ||
        commandName === "!giveaway-finalize" ||
        commandName === "!giveaway-go"
      ) {
        if (state.users.length === 0) {
          client.say(target, "Oops, no one participated.");
        } else {
          const winner =
            state.users[Math.floor(state.users.length * Math.random())];
          reset();
          client.say(target, "and the winner is...");
          setTimeout(() => {
            client.say(target, "@" + winner);
          }, 3000);
        }
        return;
      }
    }
    if (commandName === "!giveaway") {
      const { username } = context;
      if (state.opened) {
        if (!state.users.includes(username)) {
          state.users.push(username);
        }
        client.say(
          target,
          "You are in @" +
            username +
            " – (" +
            state.users.length +
            " participants in total)"
        );
      } else {
        client.say(
          target,
          "Sorry @" + username + ", the giveaway isn't opened yet."
        );
      }
      return;
    }
  });

  app.get("/giveaway/state", (req, res) => {
    res.send({opened: state.opened, users: state.users });
  });
}
