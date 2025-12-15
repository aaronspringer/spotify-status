const trackEl = document.getElementById("trackDisplay");
const refreshBtn = document.getElementById("refresh");
const titleEl = document.getElementById("title");

const trackCover = document.getElementById("trackCover");
const trackNameEl = document.getElementById("trackName");
const trackArtistsEl = document.getElementById("trackArtists");
const trackAlbumEl = document.getElementById("trackAlbum");

const searchInput = document.getElementById("searchQuery");
const searchResults = document.getElementById("searchResults");
const suggestionsList = document.getElementById("suggestionsList");

let lastTrackKey = null;
let debounceTimer = null;

const apiUrl = "https://nu6v5s5450.execute-api.us-west-2.amazonaws.com";

const pathParts = window.location.pathname.split("/").filter(Boolean);
const profileUsername = decodeURIComponent(pathParts[1] || "");

function renderTrack(data) {
  const artists = (data.artists || []).join(", ");
  const trackKey =
    data.id || `${data.trackName}|${artists}|${data.album || ""}`;

  if (trackKey === lastTrackKey) return;
  lastTrackKey = trackKey;

  if (data.albumArt) {
    trackCover.innerHTML = `
      <a href="${data.trackUrl}" target="_blank" rel="noopener noreferrer">
        <img src="${data.albumArt}" alt="Album art">
      </a>`;
    trackCover.style.display = "block";
  } else {
    trackCover.innerHTML = "";
    trackCover.style.display = "none";
  }

  const explicitIcon = data.explicit
    ? `<img src="/img/explicit-warning.png" id="explicit-icon" alt="Explicit">`
    : "";

  trackNameEl.innerHTML = data.trackUrl
    ? `${explicitIcon} <a href="${data.trackUrl}" target="_blank">${data.trackName}</a>`
    : `${explicitIcon} ${data.trackName}`;

  trackArtistsEl.textContent = artists;
  trackAlbumEl.textContent = data.album || "";
}

async function fetchPublicNowPlaying(username, showLoading = false) {
  if (showLoading) {
    titleEl.textContent = `Loading ${username}'s currently playing track…`;
  }

  try {
    const res = await fetch(
      `/api/user/${encodeURIComponent(username)}/now-playing`
    );
    if (!res.ok) throw new Error("User not found");

    const data = await res.json();

    if (!data.playing) {
      titleEl.textContent = `${
        data.displayName || username
      } is not listening to anything.`;
      return;
    }

    titleEl.textContent = `${
      data.displayName || username
    } is currently listening to:`;
    renderTrack(data);
  } catch (err) {
    console.error(err);
    titleEl.textContent = "Failed to fetch now playing.";
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);

  const query = searchInput.value.trim();
  if (query.length < 2) {
    searchResults.innerHTML = "";
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return;

      const data = await res.json();
      searchResults.innerHTML = "";

      data.tracks.forEach((track) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <img src="${track.albumArt}">
          <div class="search-track">
            <span class="title">${track.name}</span>
            <span class="artist">${track.artist}</span>
          </div>
        `;
        li.onclick = () => submitSuggestion(track);
        searchResults.appendChild(li);
      });
    } catch (err) {
      console.error(err);
    }
  }, 300);
});

async function submitSuggestion(track) {
  try {
    await fetch(
      `${apiUrl}/user/${encodeURIComponent(profileUsername)}/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          songTitle: track.name,
          artist: track.artist,
          albumArt: track.albumArt,
          trackUrl: track.trackUrl,
        }),
      }
    );

    searchResults.innerHTML = "";
    searchInput.value = "";

    fetchSuggestions();
  } catch (err) {
    console.error("Suggestion failed", err);
  }
}

async function fetchSuggestions() {
  try {
    const res = await fetch(
      `${apiUrl}/user/${encodeURIComponent(profileUsername)}/suggestions`
    );
    if (!res.ok) return;

    const suggestions = await res.json();
    suggestionsList.innerHTML = "";

    suggestions.forEach((s) => {
      const li = document.createElement("li");

      li.innerHTML = `
        <img src="${s.albumArt}">
        <div class="suggestion-track">
          <strong>${s.songTitle}</strong><br>
          <small>${s.artist}</small>
        </div>
        <button class="delete-btn" data-trackid="${s.trackId}">❌</button>
      `;

      li.querySelector(".delete-btn").onclick = async (e) => {
        const trackId = e.target.dataset.trackid;
        try {
          await fetch(
            `${apiUrl}/user/${encodeURIComponent(
              profileUsername
            )}/suggestions?trackId=${encodeURIComponent(trackId)}`,
            {
              method: "DELETE",
            }
          );
          fetchSuggestions();
        } catch (err) {
          console.error("Delete failed", err);
        }
      };

      suggestionsList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}


refreshBtn.onclick = () => fetchPublicNowPlaying(profileUsername, true);

window.addEventListener("load", () => {
  if (!profileUsername) {
    titleEl.textContent = "No username found.";
    return;
  }

  fetchPublicNowPlaying(profileUsername, true);
  fetchSuggestions();

  setInterval(() => {
    fetchPublicNowPlaying(profileUsername);
  }, 10000);
});
