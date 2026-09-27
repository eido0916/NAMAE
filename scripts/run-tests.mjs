import os from "node:os";
os.userInfo = () => ({ username: process.env.USERNAME || "codex", uid: -1, gid: -1, shell: null, homedir: process.env.USERPROFILE || process.cwd() });
const { register } = await import("tsx/esm/api");
const unregister = register();
await import("../tests/engine.test.ts");
await import("../tests/expanded-data.test.ts");
unregister();
