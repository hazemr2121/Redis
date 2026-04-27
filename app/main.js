const net = require("net");
const db = new Map();
// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");
const nullString = `$-1\r\n`;
// Uncomment the code below to pass the first stage
const server = net.createServer((connection) => {
  // Handle connection
  connection.on("data", (data) => {
    const raw = RESPParser(data);
    if (raw[0].toLowerCase() == "ping") {
      connection.write(`+PONG\r\n`);
    } else if (raw[0].toLowerCase() == "echo") {
      connection.write(`$${raw[1].length}\r\n${raw[1]}\r\n`);
    } else if (
      raw[0].toLowerCase() == "set" &&
      (raw[3]?.toLowerCase() == "ex" || raw[3]?.toLowerCase() == "px")
    ) {
      db.set(raw[1], raw[2]);
      connection.write(`+OK\r\n`);
      setTimeout(
        () => {
          db.delete(raw[1]);
        },
        raw[3].toLowerCase() == "px" ? raw[4] : raw[4] * 1000,
      );
    } else if (raw[0].toLowerCase() == "set") {
      db.set(raw[1], raw[2]);
      connection.write(`+OK\r\n`);
    } else if (raw[0].toLowerCase() == "get") {
      let result = db.get(raw[1]);
      if (result) connection.write(`$${result.length}\r\n${result}\r\n`);
      else {
        connection.write(`$-1\r\n`);
      }
    }
  });
});

server.listen(6379, "127.0.0.1");

function RESPParser(str) {
  let raw = str.toString();
  raw = raw.split("\r\n");
  raw = raw.filter(
    (el) => !el.startsWith("$") && !el.startsWith("*") && el !== "",
  );
  return raw;
}
