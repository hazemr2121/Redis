const net = require("node:net");
const TERMINATOR = "\r\n";
const NULL = "$-1";
const NULLARRAY = "*-1\r\n";
const cache = new Map();
const blockedClients = new Map();
const ECHO = "echo";
const PING = "ping";
const SET = "set";
const GET = "get";
const RPUSH = "rpush";
const LRANGE = "lrange";
const LPUSH = "lpush";
const LLEN = "llen";
const LPOP = "lpop";
const BLPOP = "blpop";
const string = (s) => `+${s}`;
const bulkString = (s) => [`$${s.length}`, s];
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
    notifyBlockedClient(list);
    return integer(v.length);
  } else {
    cache.set(list, [...finalValues]);
    notifyBlockedClient(list);
    return integer(finalValues.length);
  }
};

const lrange = (args) => {
  args = args.filter((el) => !el.startsWith("$") && el !== "");
  const start = parseInt(args[1]);
  const end = parseInt(args[2]);

  if (start > end && end >= 0) {
    return array([]);
  }
  const list = args[0];
  if (cache.has(list)) {
    const v = cache.get(list);
    const result = end === -1 ? v.slice(start) : v.slice(start, end + 1);
    return array(result);
  } else {
    return array([]);
  }
};
const lpush = (args) => {
  const [_, list, ...rest] = args;
  let finalValues = rest.filter((el) => !el.startsWith("$") && el !== "");
  if (cache.has(list)) {
    const v = cache.get(list);
    v.unshift(...finalValues.reverse());
    notifyBlockedClient(list);
    return integer(v.length);
  } else {
    cache.set(list, [...finalValues].reverse());
    notifyBlockedClient(list);
    return integer(finalValues.length);
  }
};
const llen = (args) => {
  const [_, list] = args;
  if (cache.has(list)) {
    const v = cache.get(list);
    return integer(v.length);
  } else {
    return integer(0);
  }
};
const lpop = (args) => {
  const [_, list, __, count] = args;
  if (cache.has(list)) {
    const v = cache.get(list);
    if (count) {
      const result = v.splice(0, count);
      return array(result);
    } else {
      const result = v.shift();
      return bulkString(result);
    }
  } else {
    return [NULL];
  }
};
const blpop = (args, conn) => {
  const [_, list, __, timeout] = args;
  if (cache.has(list)) {
    const v = cache.get(list);
    const result = v.shift();
    return array([list, result]);
  } else {
    const entry = { conn, timer: null };
    if (parseInt(timeout) > 0) {
      entry.timer = setTimeout(
        () => {
          blockedClients.delete(list);
          conn.write(NULLARRAY);
        },
        parseInt(timeout) * 1000,
      );
    }
    if (blockedClients.has(list)) {
      blockedClients.get(list).push(entry);
    } else {
      blockedClients.set(list, [entry]);
    }
  }
};
const parseBuffer = (buff, conn) => {
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
    case LPUSH:
      return lpush(args);
    case LLEN:
      return llen(args);
    case LPOP:
      return lpop(args);
    case BLPOP:
      return blpop(args, conn);
  }
};
/**
 *
 * @param {Buffer} buff
 * @returns
 */
const handleData = (buff, conn) => {
  const resp = parseBuffer(buff, conn);
  if (!resp) return; // blocked, will write later
  resp.push("");
  return resp.join(TERMINATOR);
};

const server = net.createServer((conn) => {
  conn.on("data", (bufferData) => {
    const response = handleData(bufferData, conn);
    if (response) conn.write(response);
  });
});
server.listen(6379, "127.0.0.1");

// Helper functions

const notifyBlockedClient = (list) => {
  if (blockedClients.has(list)) {
    const b = blockedClients.get(list);
    const conn = b[0].conn;
    const result = cache.get(list).shift();
    const resp = array([list, result]);
    resp.push("");
    conn.write(resp.join(TERMINATOR));
    clearTimeout(b[0].timer);
    b.shift(); // remove this client
    if (b.length === 0) blockedClients.delete(list);
  }
};
