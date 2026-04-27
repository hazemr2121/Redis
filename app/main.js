const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment the code below to pass the first stage
const server = net.createServer((connection) => {
  // Handle connection
  connection.on("data", (data) => {
    const raw = RESPParser(data);
    if (raw[0].toLowerCase() == "ping") {
      connection.write(`+PONG\r\n`);
    }
    if (raw[0].toLowerCase() == "echo") {
      connection.write(`$${raw[1].length}\r\n${raw[1]}\r\n`);
    }
  });
});

server.listen(6379, "127.0.0.1");

function RESPParser(str) {
  let raw = str.toString();
  raw = raw.split("\r\n");
  raw = raw.filter(
    (el) => !el.startsWith("$") && !el.startsWith("*") && !el == "",
  );
  return raw;
}
