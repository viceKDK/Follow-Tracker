"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionRoot = path.join(root, "extension");
const port = Number(process.env.FT_PREVIEW_PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

const previewBootstrap = `
<script>
(() => {
  const profile = "demo_profile";
  const avatarUser = (username, id) => ({
    username, instagramUserId: String(id),
    avatarUrl: "https://i.pravatar.cc/128?u=" + encodeURIComponent(username)
  });
  const users = [
    avatarUser("ana", 101), avatarUser("beto.jpg", 102), avatarUser("carla", 103),
    avatarUser("diana.photo", 104), avatarUser("sol.creativa", 105), avatarUser("eva.studio", 106),
    avatarUser("lucas.uy", 107), avatarUser("maria.visual", 108), avatarUser("mateo.design", 109)
  ];
  const report1 = {
    id: "r1", runId: "r1", capturedAt: "2026-08-20T10:00:00.000Z", isBaseline: true,
    followersCount: 1428, followingCount: 812, mutualCount: 684,
    followerOnlyCount: 744, followingOnlyCount: 128,
    changes: { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] },
    users: users.filter((user) => ["ana", "beto.jpg", "carla", "diana.photo", "sol.creativa"].includes(user.username)), eventCount: 0
  };
  const report2 = {
    id: "r2", runId: "r2", capturedAt: "2026-09-02T15:30:00.000Z", isBaseline: false,
    followersCount: 1451, followingCount: 805, mutualCount: 697,
    followerOnlyCount: 754, followingOnlyCount: 108,
    changes: {
      newFollowers: ["eva.studio", "lucas.uy", "maria.visual"],
      lostFollowers: ["beto.jpg"],
      newFollowing: ["mateo.design"],
      lostFollowing: ["diana.photo", "sol.creativa"]
    },
    users: users.filter((user) => !["ana", "carla"].includes(user.username)), eventCount: 7
  };
  const snapshot = {
    schemaVersion: 2, profile,
    followers: ["ana", "carla", "eva.studio", "lucas.uy", "maria.visual"],
    following: ["ana", "carla", "eva.studio", "mateo.design"],
    users, updatedAt: report2.capturedAt, runId: "r2", reportId: "r2"
  };
  const timeline = {
    schemaVersion: 2, profile, createdAt: report1.capturedAt, updatedAt: report2.capturedAt,
    baseline: {
      profile, reportId: "r1", runId: "r1", capturedAt: report1.capturedAt,
      followers: ["ana", "beto.jpg", "carla"], following: ["ana", "carla", "diana.photo", "sol.creativa"],
      users: users.filter((user) => ["ana", "beto.jpg", "carla", "diana.photo", "sol.creativa"].includes(user.username))
    },
    reports: [report1, report2],
    events: [
      ["followed_you", "eva.studio"], ["followed_you", "lucas.uy"],
      ["followed_you", "maria.visual"], ["unfollowed_you", "beto.jpg"],
      ["you_followed", "mateo.design"], ["you_unfollowed", "diana.photo"],
      ["you_unfollowed", "sol.creativa"]
    ].map(([type, username], index) => ({
      id: "r2:" + type + ":" + username, profile, username, type,
      occurredAt: new Date(Date.parse(report2.capturedAt) - index * 3600000).toISOString(),
      reportId: "r2", runId: "r2"
    }))
  };
  const storage = {
    ["ft_history_" + profile]: snapshot,
    ["ft_timeline_" + profile]: timeline
  };
  const listeners = [];
  const select = (keys) => {
    if (keys == null) return { ...storage };
    if (typeof keys === "string") return keys in storage ? { [keys]: storage[keys] } : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]]));
    return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, key in storage ? storage[key] : fallback]));
  };
  window.confirm = () => true;
  window.chrome = {
    runtime: { lastError: null, getURL: (file) => new URL(file, location.origin).href },
    tabs: { create: ({ url }) => window.open(url, "_blank") },
    storage: {
      local: {
        get: (keys, callback) => callback(select(keys)),
        set: (values, callback) => {
          const changes = {};
          Object.entries(values || {}).forEach(([key, value]) => {
            changes[key] = { oldValue: storage[key], newValue: value };
            storage[key] = value;
          });
          callback?.();
          queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
        },
        remove: (keys, callback) => {
          const changes = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
            if (!(key in storage)) return;
            changes[key] = { oldValue: storage[key], newValue: undefined };
            delete storage[key];
          });
          callback?.();
          queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
        }
      },
      onChanged: { addListener: (listener) => listeners.push(listener) }
    }
  };
})();
</script>`;

function sendFile(filePath, response) {
  const extension = path.extname(filePath);
  if (extension === ".html") {
    const html = fs.readFileSync(filePath, "utf8")
      .replace("<body>", `<body>${previewBootstrap}`)
      .replace('href="design-tokens.css"', 'href="design-tokens.css?v=preview-4.1.0"')
      .replace('src="dashboard.js"', 'src="dashboard.js?v=preview-4.7.0"')
      .replace('src="dashboard-table.js"', 'src="dashboard-table.js?v=preview-4.7.0"');
    response.writeHead(200, { "content-type": contentTypes[extension], "cache-control": "no-store" });
    response.end(html);
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extension] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const relative = url.pathname === "/" ? "dashboard.html" : url.pathname.replace(/^\/+/, "");
  const candidate = path.resolve(extensionRoot, relative);
  if ((!candidate.startsWith(`${extensionRoot}${path.sep}`) && candidate !== extensionRoot) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  sendFile(candidate, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Follow Tracker dashboard preview: http://127.0.0.1:${port}/dashboard.html?profile=demo_profile#overview`);
});
