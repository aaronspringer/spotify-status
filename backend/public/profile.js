const trackEl = document.getElementById("trackDisplay");
const refreshBtn = document.getElementById("refresh");
const titleEl = document.getElementById("title");
const viewModeEl = document.getElementById("view-mode");
const trackCover = document.getElementById("trackCover");
const trackNameEl = document.getElementById("trackName");
const trackArtistsEl = document.getElementById("trackArtists");
const trackAlbumEl = document.getElementById("trackAlbum");

let lastTrackKey = null;


// Get username from /user/username
const pathParts = window.location.pathname.split("/").filter(Boolean);
const profileUsername = decodeURIComponent(pathParts[1] || "");

function setupProfile(username) {

  titleEl.textContent = `Loading ${username}'s currently playing track…`;
}

// Old Track renderer that did not check for changes.

// function renderTrack(data) {
//   const artists = (data.artists || []).join(", ");

//   // don't clear trackEl.innerHTML, just clear text
//   // trackNameEl.textContent = "";
//   // trackArtistsEl.textContent = "";
//   // trackAlbumEl.textContent = "";
//   // trackCover.style.display = "none";

//   // update specific elements
//   trackCover.innerHTML = data.albumArt
//     ? `<a href="${data.trackUrl}" target="_blank"><img id="trackCover" src="${data.albumArt}"></a>`
//     : (data.albumArt || "");
//   trackCover.style.display = data.albumArt ? "block" : "none";


//   let nameHtml = data.trackName || "";
//   let explicitIcon = data.explicit
//     ? '<img src="/img/explicit-warning.png" id="explicit-icon">'
//     : "";
//   trackNameEl.innerHTML = data.trackUrl
//     ? `${explicitIcon} <a href="${data.trackUrl}" target="_blank">
//         ${nameHtml}</a>`
//     : `${explicitIcon} ${nameHtml}`;


//   trackArtistsEl.textContent = `${artists}`;
//   trackAlbumEl.textContent = `${data.album}` || "";
// }

function renderTrack(data) {
  const artists = (data.artists || []).join(", ");

  // build a "key" for the current track so we only animate on real changes
  const trackKey =
    data.id ||
    `${data.trackName}|${artists}|${data.album || ""}`;

  const isNewTrack = trackKey !== lastTrackKey;

  // if nothing changed, just bail
  if (!isNewTrack) return;

  trackEl.classList.add("is-updating");

  const applyUpdate = () => {
    // --- cover image ---
    if (data.albumArt) {
      trackCover.innerHTML = data.trackUrl
        ? `<a href="${data.trackUrl}" target="_blank" rel="noopener noreferrer">
         <img src="${data.albumArt}" alt="Album art">
       </a>`
        : `<img src="${data.albumArt}" alt="Album art">`;
      trackCover.style.display = "block";
    } else {
      trackCover.innerHTML = "";
      trackCover.style.display = "none";
    }

    // --- title + explicit icon ---
    const nameHtml = data.trackName || "";
    const explicitIcon = data.explicit
      ? '<img src="/img/explicit-warning.png" id="explicit-icon" alt="Explicit">'
      : "";

    trackNameEl.innerHTML = data.trackUrl
      ? `${explicitIcon} <a href="${data.trackUrl}" target="_blank" rel="noopener noreferrer">${nameHtml}</a>`
      : `${explicitIcon} ${nameHtml}`;

    // --- artists + album ---
    trackArtistsEl.textContent = artists;
    trackAlbumEl.textContent = data.album || "";

    lastTrackKey = trackKey;

    // let the browser paint once, then remove dim
    requestAnimationFrame(() => {
      trackEl.classList.remove("is-updating");
    });
  };

  // Preload album art so we don't flash while the new image loads
  if (data.albumArt) {
    const img = new Image();
    img.onload = applyUpdate;
    img.onerror = applyUpdate;
    img.src = data.albumArt;
  } else {
    applyUpdate();
  }
}


async function fetchPublicNowPlaying(username, showProgress = false) {
  if (showProgress) {
    titleEl.textContent = `Loading ${username}'s currently playing track…`;
  }

  try {
    const res = await fetch(
      `/api/user/${encodeURIComponent(username)}/now-playing`,
      { method: "GET" }
    );

    if (!res.ok) {
      window.location.href = "/errors/usernotfound";
      const err = await res.json().catch(() => ({}));
      titleEl.textContent =
        "Error: " + (err.error || res.status + " " + res.statusText);
      return;
    }

    const data = await res.json();

    if (!data.playing) {
      titleEl.textContent = `${data.displayName || username
        } is not currently playing anything.`;
      return;
    }

    titleEl.textContent = `${data.displayName || username
      } is currently listening to:`;
    renderTrack(data);
  } catch (err) {
    console.error(err);
    titleEl.textContent = "Failed to fetch public now playing.";
  }
}

const autoRefresh = setInterval(() => {
  fetchPublicNowPlaying(profileUsername);
}, 10000);

refreshBtn.onclick = () => {
  if (profileUsername) {
    fetchPublicNowPlaying(profileUsername, true);
  }
};

window.addEventListener("load", () => {
  if (!profileUsername) {
    titleEl.textContent = "No username found in URL.";
    return;
  }
  setupProfile(profileUsername);
  fetchPublicNowPlaying(profileUsername, true);
});
