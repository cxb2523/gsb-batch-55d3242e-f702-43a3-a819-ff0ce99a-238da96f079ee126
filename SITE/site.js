const isInSiteFolder = window.location.pathname.includes("/SITE/");
const dataPrefix = isInSiteFolder ? "../" : "";
const themeStorageKey = "site-theme";

function getCurrentTheme() {
  return document.documentElement.dataset.theme || "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(themeStorageKey, theme);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  }
}

function initializeThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  applyTheme(getCurrentTheme());
  toggle.addEventListener("click", () => {
    applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
  });
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function formatUpdatedAt(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function createGameCard(game, options = {}) {
  const card = document.createElement("article");
  card.className = "game-card";
  card.style.animationDelay = `${options.delay || 0}ms`;

  const image = game.image ? `<img src="${game.image}" alt="${game.title}">` : "";
  const tag = game.type || options.tag || "Offer";
  const details = [];

  if (game.start) details.push(`<p class="game-detail"><strong>Starts:</strong> ${game.start}</p>`);
  if (game.end) details.push(`<p class="game-detail"><strong>Ends:</strong> ${game.end}</p>`);
  if (game.time) details.push(`<p class="game-detail"><strong>Note:</strong> ${game.time}</p>`);

  card.innerHTML = `
    ${image}
    <div class="game-card-body">
      <div class="game-meta">
        <span>${tag}</span>
      </div>
      <h4>${game.title || "Unknown title"}</h4>
      ${details.join("")}
      <div class="game-actions">
        ${game.link ? `<a class="text-link" href="${game.link}" target="_blank" rel="noreferrer">Open Offer</a>` : ""}
      </div>
    </div>
  `;

  return card;
}

function renderList(containerId, games, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!games || games.length === 0) {
    container.innerHTML = `<p class="empty-state">${options.emptyText || "No offers found."}</p>`;
    return;
  }

  games.forEach((game, index) => {
    container.appendChild(createGameCard(game, { ...options, delay: index * 70 }));
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/(&quot;[^"\n]*&quot;)(\s*:)/g, '<span class="tok-property">$1</span><span class="tok-operator">$2</span>')
    .replace(/:\s*(&quot;[^"\n]*&quot;)/g, ': <span class="tok-string">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="tok-boolean">$1</span>')
    .replace(/(?<![\w>.-])(-?\d+(?:\.\d+)?)(?![\w<])/g, '<span class="tok-number">$1</span>');
}

function highlightPowerShell(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/(^|\n)(python|pip)\b/g, '$1<span class="tok-command">$2</span>');
  escaped = escaped.replace(/(\$env:[A-Z_]+)/g, '<span class="tok-variable">$1</span>');
  escaped = escaped.replace(/(&quot;[^"\n]*&quot;)/g, '<span class="tok-string">$1</span>');
  return escaped;
}

function highlightCodeBlocks() {
  document.querySelectorAll("code.language-json, code.language-powershell").forEach((block) => {
    const source = block.textContent || "";
    if (block.classList.contains("language-json")) {
      block.innerHTML = highlightJson(source);
      return;
    }
    if (block.classList.contains("language-powershell")) {
      block.innerHTML = highlightPowerShell(source);
    }
  });
}

function injectStructuredData(epicCurrent, steamGames) {
  const existingSchema = document.getElementById("dynamic-schema");
  if (existingSchema) {
    existingSchema.remove();
  }

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Free Games Tracker",
    "url": "https://jaixmario.github.io/free-games-notifier/",
    "description": "Track active free games on Epic Games Store and Steam! Clean storefront board updated every 6 hours."
  };

  const gameItems = [];
  let itemPosition = 1;

  epicCurrent.forEach(game => {
    gameItems.push({
      "@type": "ListItem",
      "position": itemPosition++,
      "item": {
        "@type": "VideoGame",
        "name": game.title || "Free Game",
        "url": game.link || "https://store.epicgames.com/",
        "image": game.image || "",
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD",
          "category": "freebies",
          "availability": "https://schema.org/InStock",
          "validThrough": game.end || ""
        }
      }
    });
  });

  steamGames.forEach(game => {
    gameItems.push({
      "@type": "ListItem",
      "position": itemPosition++,
      "item": {
        "@type": "VideoGame",
        "name": game.title || "Free Game",
        "url": game.link || "https://store.steampowered.com/",
        "image": game.image || "",
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD",
          "category": "freebies",
          "availability": "https://schema.org/InStock"
        }
      }
    });
  });

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "numberOfItems": gameItems.length,
    "itemListElement": gameItems
  };

  const scriptTag = document.createElement("script");
  scriptTag.id = "dynamic-schema";
  scriptTag.type = "application/ld+json";
  scriptTag.text = JSON.stringify([websiteSchema, itemListSchema]);
  document.head.appendChild(scriptTag);
}

async function boot() {
  initializeThemeToggle();
  highlightCodeBlocks();

  try {
    const [epic, steam] = await Promise.all([
      loadJson(`${dataPrefix}free.json`),
      loadJson(`${dataPrefix}free-steam.json`),
    ]);

    const epicCurrent = epic.current_games || [];
    const epicUpcoming = epic.upcoming_games || [];
    const steamGames = steam.games || [];

    setText("epic-current-count", String(epicCurrent.length));
    setText("epic-upcoming-count", String(epicUpcoming.length));
    setText("steam-count", String(steamGames.length));
    setText("epic-updated-at", formatUpdatedAt(epic.updated_at));
    setText("steam-updated-at", formatUpdatedAt(steam.updated_at));

    renderList("epic-current-list", epicCurrent, {
      tag: "Free Now",
      emptyText: "No Epic current offers available.",
    });
    renderList("epic-upcoming-list", epicUpcoming, {
      tag: "Upcoming",
      emptyText: "No Epic upcoming offers available.",
    });
    renderList("steam-list", steamGames, {
      emptyText: "No Steam offers available.",
    });

    injectStructuredData(epicCurrent, steamGames);
  } catch (error) {
    console.error(error);
    renderList("epic-current-list", [], { emptyText: "Could not load Epic current offers." });
    renderList("epic-upcoming-list", [], { emptyText: "Could not load Epic upcoming offers." });
    renderList("steam-list", [], { emptyText: "Could not load Steam offers." });
    setText("epic-updated-at", "Load failed");
    setText("steam-updated-at", "Load failed");
  }
}

boot();
