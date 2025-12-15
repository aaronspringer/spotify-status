const loginBtn = document.getElementById("login");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshUsers");

loginBtn.onclick = () => {
  window.location.href = "/login";
};

refreshBtn.onclick = () => {
  fetchUsers();
};

async function fetchUsers() {
  try {
    const response = await fetch("/api/users");
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const users = await response.json();

    const userList = document.getElementById("user-list");
    userList.innerHTML = "";

    users.forEach((user) => {
      const li = document.createElement("li");

      const link = document.createElement("a");
      link.textContent = user.display_name || user.username;
      link.href = `/user/${user.username}`;

      li.appendChild(link);
      userList.appendChild(li);
    });
  } catch (error) {
    console.error("Error fetching users:", error);
  }
}

// Fetch users on page load
fetchUsers();
