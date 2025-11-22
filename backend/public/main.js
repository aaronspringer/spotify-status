const statusEl = document.getElementById("status");
const trackEl = document.getElementById("track");
const loginBtn = document.getElementById("login");
const refreshBtn = document.getElementById("refresh");
const titleEl = document.getElementById("title");
const viewModeEl = document.getElementById("view-mode");
const instructionsEl = document.getElementById("instructions");

// Default mode or user display mode
const pathParts = window.location.pathname.split("/").filter(Boolean);
let mode = "landing"; // "landing" or "profile"
let profileUsername = null;

if (pathParts[0] === "user" && pathParts[1]) {
  mode = "profile"; // if on user url, display profile
  profileUsername = decodeURIComponent(pathParts[1]);
}

function setupLanding() {
  titleEl.textContent = "Welcome to Spotify Now Playing";
  viewModeEl.textContent = "Landing page";

  instructionsEl.innerHTML = `
    This site lets you share what you're listening to on Spotify.<br /><br />
    <strong>How it works:</strong><br />
    1. Click <strong>Log in with Spotify</strong> below.<br />
    2. We'll create a personal page for you at <code>/user/&lt;your-username&gt;</code>.<br />
    3. Anyone with that link can see what you're currently listening to.
  `;

  statusEl.textContent = "Not logged in yet.";
  loginBtn.style.display = "inline-block";
  refreshBtn.style.display = "none";

  trackEl.innerHTML = "";
}

function setupProfile(username) {
  titleEl.textContent = "Spotify Now Playing – Profile";
  viewModeEl.textContent = `Viewing public profile for: ${username}`;

  instructionsEl.textContent =
    "Anyone with this link can see what this user is currently listening to (if their Spotify is active).";

  loginBtn.style.display = "none";
  refreshBtn.style.display = "inline-block";

  statusEl.textContent = "Loading currently playing track…";
}

// Buttons
loginBtn.onclick = () => {
  window.location.href = "/login";
};

refreshBtn.onclick = () => {
  if (mode === "profile" && profileUsername) {
    fetchPublicNowPlaying(profileUsername);
  }
};

function renderTrack(data) {
  const artists = (data.artists || []).join(", ");
  trackEl.innerHTML = `
    ${data.albumArt ? `<img src="${data.albumArt}" alt="Album art" />` : ""}
    <div><strong>${data.trackName}</strong></div>
    <div>${artists}</div>
    <div><em>${data.album}</em></div>
  `;
}

async function fetchPublicNowPlaying(username) {
  statusEl.textContent = "Loading their currently playing track…";
  trackEl.innerHTML = "";

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(username)}/now-playing`, {
      method: "GET",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      statusEl.textContent = "Error: " + (err.error || res.status + " " + res.statusText);
      return;
    }

    const data = await res.json();

    if (!data.playing) {
      statusEl.textContent = `${data.displayName || username} is not currently playing anything.`;
      trackEl.innerHTML = "";
      return;
    }

    statusEl.textContent = `${data.displayName || username} is currently listening to:`;
    renderTrack(data);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Failed to fetch public now playing.";
  }
}

// Setup page for profile or landing.
window.addEventListener("load", () => {
  if (mode === "profile") {
    setupProfile(profileUsername);
    fetchPublicNowPlaying(profileUsername);
  } else {
    setupLanding();
  }
});
