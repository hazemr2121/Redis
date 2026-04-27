const net = require("node:net");
const TERMINATOR = "\r\n";
const NULL = "$-1";
const cache = new Map();
const ECHO = "echo";
const PING = "ping";
const SET = "set";
const GET = "get";
const RPUSH = "rpush";
const LRANGE = "lrange";
const string = (s) => `+${s}`;
const integer = (n) => [`:${n}`];
const array = (list) => {
  const elements = list.map((el) => [`$${el.length}`, el]).flat();
  return [`*${list.length}`, ...elements];
};
const ping = () => {
  return [string("PONG")];
};
const echo = ([type, arg]) => {
  return [`\$${arg.length}`, arg];
};
const set = (args) => {
  const [_, key, __, val, ___, flag, ____, expiry] = args;
  cache.set(key, {
    val,
    ...(!!expiry && flag?.toLowerCase() == "px"
      ? { expiry: Date.now() + parseInt(expiry) }
      : {}),
  });
  return [string("OK")];
};
const get = ([type, key]) => {
  let resp = [NULL];
  if (cache.has(key)) {
    const v = cache.get(key);
    if (!v.expiry || (v.expiry && v.expiry > Date.now())) {
      const val = v.val;
      resp = [`\$${val.length}`, val];
    }
  }
  return resp;
};
const rpush = (args) => {
  const [_, list, ...rest] = args;
  let finalValues = rest.filter((el) => !el.startsWith("$") && el !== "");
  if (cache.has(list)) {
    const v = cache.get(list);
    v.push(...finalValues);
    return integer(v.length);
  } else {
    cache.set(list, [...finalValues]);
    return integer(finalValues.length);
  }
};

const lrange = (args) => {
  args = args.filter((el) => !el.startsWith("$") && el !== "");
  if (args[1] > args[2]) {
    return array([]);
  }
  const list = args[0];
  if (cache.has(list)) {
    const v = cache.get(list);
    const result = v.slice(args[1], parseInt(args[2]) + 1);
    return array(result);
  } else {
    return array([]);
  }
};
const parseBuffer = (buff) => {
  const resp = buff.toString();
  const [_, __, cmd, ...args] = resp.split(TERMINATOR);
  switch (cmd.toLowerCase()) {
    case PING:
      return ping(args);
    case ECHO:
      return echo(args);
    case SET:
      return set(args);
    case GET:
      return get(args);
    case RPUSH:
      return rpush(args);
    case LRANGE:
      return lrange(args);
  }
};
/**
 *
 * @param {Buffer} buff
 * @returns
 */
const handleData = (buff) => {
  const resp = parseBuffer(buff);
  resp.push("");
  return resp.join(TERMINATOR);
};

const server = net.createServer((conn) => {
  conn.on("data", (bufferData) => {
    conn.write(handleData(bufferData));
  });
});
server.listen(6379, "127.0.0.1");
