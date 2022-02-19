import tmi from "tmi.js";

export default function chat() {
  const opts = {
    identity: {
      username: process.env.BOT_USERNAME,
      password: process.env.OAUTH_TOKEN,
    },
    channels: [process.env.CHANNEL_NAME],
  };
  if (!opts.identity.username) {
    throw new Error("BOT_USERNAME required");
  }

  const client = new tmi.client(opts);
  client.on("connected", onConnectedHandler);
  client.connect();
  function onConnectedHandler(addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
  }
  return client;
}
