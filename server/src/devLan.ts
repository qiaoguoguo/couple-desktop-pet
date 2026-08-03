process.env.RELAY_HOST = process.env.RELAY_HOST ?? "0.0.0.0";
process.env.RELAY_PORT = process.env.RELAY_PORT ?? "8787";

await import("./index.js");
