import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("spotify-demo.db");

// Create tables if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    username TEXT UNIQUE,        -- slug for /user/:username
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL  -- unix ms
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,         -- sessionId (UUID)
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Env vars
const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
  console.error(
    "Missing env vars. Check SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI"
  );
  process.exit(1);
}

app.use(express.json());
app.use(cookieParser());

// Serve static /public frontend
app.use(express.static(path.join(__dirname, "public")));

// Username helpers

function makeBaseURL(str) {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "user"
  );
}

function ensureUniqueUsername(base, userIdToIgnore = null) {
  let candidate = base;
  let suffix = 1;

  while (true) {
    const row = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(candidate);

    if (!row || (userIdToIgnore && row.id === userIdToIgnore)) {
      return candidate;
    }

    candidate = `${base}-${suffix++}`;
  }
}

// login and redirect to spotify auth
app.get("/login", (req, res) => {
  const scope = [
    "user-read-email",
    "user-read-private",
    "user-read-currently-playing",
    "user-read-playback-state",
  ].join(" ");

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  });

  const authorizeUrl =
    "https://accounts.spotify.com/authorize?" + params.toString();

  res.redirect(authorizeUrl);
});

// callback spotify redirects to
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    console.error("Spotify auth error:", error);
    return res.status(400).send("Spotify auth error: " + error);
  }

  if (!code) {
    return res.status(400).send("Missing code from Spotify");
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiresAt = Date.now() + expires_in * 1000;

    // Get Spotify user profile
    const meResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const spotifyUser = meResponse.data;
    const spotifyId = spotifyUser.id;
    const displayName = spotifyUser.display_name || spotifyUser.id;

    // Generate /user/:username
    const baseSlug = makeBaseURL(displayName || spotifyId);

    // Check if user already exists
    const existing = db
      .prepare("SELECT id, username FROM users WHERE spotify_id = ?")
      .get(spotifyId);

    let userId;
    let username;

    if (existing) {
      username = ensureUniqueUsername(baseSlug, existing.id);

      db.prepare(
        `UPDATE users
         SET display_name = ?, username = ?, access_token = ?, refresh_token = ?, expires_at = ?
         WHERE id = ?`
      ).run(
        displayName,
        username,
        access_token,
        refresh_token,
        expiresAt,
        existing.id
      );
      userId = existing.id;
    } else {
      username = ensureUniqueUsername(baseSlug);

      const info = db.prepare(
        `INSERT INTO users (spotify_id, display_name, username, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(spotifyId, displayName, username, access_token, refresh_token, expiresAt);
      userId = info.lastInsertRowid;
    }

    // Create session cookie
    const sessionId = crypto.randomUUID();
    db.prepare("INSERT INTO sessions (id, user_id) VALUES (?, ?)").run(
      sessionId,
      userId
    );

    res.cookie("sessionId", sessionId, {
      httpOnly: true,
      sameSite: "lax",
    });

    // After authorizing, redirect user to their new public url
    res.redirect(`/user/${username}`);
  } catch (err) {
    console.error(
      "Error in callback:",
      err.response?.data || err.message || err
    );
    res.status(500).send("Error during Spotify auth");
  }
});

// Refresh token for user
async function ensureFreshAccessTokenForUser(user) {
  if (user.expires_at > Date.now() + 10_000) {
    return user.access_token;
  }

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: user.refresh_token,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, expires_in, refresh_token } = tokenResponse.data;
    const newExpiresAt = Date.now() + expires_in * 1000;
    const finalRefreshToken = refresh_token || user.refresh_token;

    db.prepare(
      `UPDATE users
       SET access_token = ?, refresh_token = ?, expires_at = ?
       WHERE id = ?`
    ).run(access_token, finalRefreshToken, newExpiresAt, user.id);

    return access_token;
  } catch (err) {
    console.error(
      "Error refreshing token:",
      err.response?.data || err.message || err
    );
    throw new Error("Could not refresh access token");
  }
}

// Public now playing for specific user
app.get("/api/user/:username/now-playing", async (req, res) => {
  const { username } = req.params;

  try {
    const user = db
      .prepare(`SELECT * FROM users WHERE username = ?`)
      .get(username);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const accessToken = await ensureFreshAccessTokenForUser(user);

    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        validateStatus: (status) => status === 200 || status === 204,
      }
    );

    if (response.status === 204 || !response.data) {
      return res.json({
        username,
        displayName: user.display_name,
        playing: false,
      });
    }

    const item = response.data.item;

    res.json({
      username,
      displayName: user.display_name,
      playing: true,
      trackName: item.name,
      artists: item.artists.map((a) => a.name),
      album: item.album.name,
      albumArt: item.album.images[0]?.url,
      trackUrl: item.external_urls.spotify,
      explicit: item.explicit,
    });
  } catch (err) {
    console.error(
      "public now-playing error:",
      err.response?.data || err.message || err
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public profile for already authed users
app.get("/user/:username", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "profile.html"));
});

app.get("/errors/usernotfound", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "errors", "usernotfound.html"));
});

app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT username, display_name FROM users').all();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get("/api/spotify/search", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.status(401).json({ error: "Not logged in" });

  const session = db
    .prepare(`SELECT users.* FROM sessions
              JOIN users ON users.id = sessions.user_id
              WHERE sessions.id = ?`)
    .get(sessionId);

  if (!session) return res.status(401).json({ error: "Invalid session" });

  const accessToken = await ensureFreshAccessTokenForUser(session);
  const q = req.query.q;

  try {
    const spotifyRes = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q,
          type: "track",
          limit: 10,
        },
      }
    );

    const tracks = spotifyRes.data.tracks.items.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artists.map(a => a.name).join(", "),
      albumArt: t.album.images[0]?.url,
      trackUrl: t.external_urls.spotify,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("Spotify search error:", err.response?.data || err);
    res.status(500).json({ error: "Spotify search failed" });
  }
});


// Start server
const PORT = process.env.PORT || 8802;
app.listen(PORT, () => {
  console.log(`Backend + frontend listening on http://localhost:${PORT}`);
  console.log(`Login URL:     http://localhost:${PORT}/login`);
});

export default db;
