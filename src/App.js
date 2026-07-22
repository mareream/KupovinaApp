import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";
import "./index.css";

// ─── SIMPLE COLOR SYSTEM ─────────────────────────────────────────────
const COLORS = {
  primary:    "#2D6A4F",
  primaryLg:  "#40916C",
  accent:     "#D62828",
  accentSoft: "#F8D7DA",
  success:    "#2D6A4F",
  warning:    "#E9C46A",
  warningBg:  "#FFF3CD",
  text:       "#1B1B1B",
  textMuted:  "#6B7280",
  bg:         "#F8FAFC",
  surface:    "#FFFFFF",
  border:     "#E2E8F0",
  shadow:     "rgba(0,0,0,0.06)",
  online:     "#22C55E",
};

const DEFAULT_TAGS = {
  "DM":       "#1D3557",
  "Maxi":     "#457B9D",
  "VocPovrc": "#2A9D8F",
  "Apoteka":  "#E76F51",
  "Lidl":     "#F4A261",
};

const USER_COLORS = {
  Mare: "#2D6A4F",
  Caka: "#E76F51",
};

// ─── COLLAPSE ICON COMPONENT ─────────────────────────────────────────
function Chevron({ collapsed, color = "currentColor" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: "transform 0.25s ease",
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── DEBOUNCE HOOK ───────────────────────────────────────────────────
//function useDebounce(value, delay) {
//  const [debounced, setDebounced] = useState(value);
//  useEffect(() => {
//    const t = setTimeout(() => setDebounced(value), delay);
//    return () => clearTimeout(t);
//  }, [value, delay]);
//  return debounced;
//}

// ─── CONFIRM HOOK ────────────────────────────────────────────────────
function useConfirm() {
  return useCallback((msg) => {
    if (typeof window !== "undefined") {
      return window.confirm(msg);
    }
    return false;
  }, []);
}

export default function App() {
  const [lists, setLists] = useState({ imamo: {}, kupiti: {} });
  const [availableTags, setAvailableTags] = useState(DEFAULT_TAGS);
  const [newItem, setNewItem] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [error, setError] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const [animatingItems, setAnimatingItems] = useState(new Set());
  const [currentPage, setCurrentPage] = useState("shopping");
  const [recipes, setRecipes] = useState({});

  // ─── COLLAPSE STATE ────────────────────────────────────────────────
  const [collapsedColumns, setCollapsedColumns] = useState({
    kupiti: true,
    imamo: true,
  });
  const [collapsedTags, setCollapsedTags] = useState({});

  // Tag modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingItemName, setPendingItemName] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(COLORS.primary);
  const [showAddTag, setShowAddTag] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username || "unknown";
  const confirm = useConfirm();
  const undoTimerRef = useRef(null);
  const recipeTimersRef = useRef({});

  // ─── AUTH ────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);
      } else {
        navigate("/");
      }
    });
    return () => unsub();
  }, [navigate]);

  // ─── DATA LISTENERS ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const dataRef = ref(database, "shoppingList");
    const unsub = onValue(dataRef, (snap) => {
      const data = snap.val() || {};
      setLists({ imamo: data.imamo || {}, kupiti: data.kupiti || {} });
      setError(null);
    }, (err) => {
      console.error("Firebase read error:", err);
      setError("Failed to load data. Please refresh.");
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const recipesRef = ref(database, "recipes");
    const unsub = onValue(recipesRef, (snap) => {
      setRecipes(snap.val() || {});
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const tagsRef = ref(database, "tags");
    const unsub = onValue(tagsRef, (snap) => {
      const data = snap.val();
      setAvailableTags(data ? { ...DEFAULT_TAGS, ...data } : DEFAULT_TAGS);
    });
    return () => unsub();
  }, [currentUser]);

  // ─── PRESENCE ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !username) return;
    const presenceRef = ref(database, `presence/${username}`);

    const setOnline = () =>
      set(presenceRef, { username, online: true, lastSeen: Date.now() }).catch(() => {});
    const setOffline = () =>
      set(presenceRef, { username, online: false, lastSeen: Date.now() }).catch(() => {});

    setOnline();
    const unsub = onValue(ref(database, "presence"), (snap) => {
      setOnlineUsers(snap.val() || {});
    });

    window.addEventListener("beforeunload", setOffline);
    const interval = setInterval(setOnline, 30000);

    return () => {
      setOffline();
      window.removeEventListener("beforeunload", setOffline);
      clearInterval(interval);
      unsub();
    };
  }, [currentUser, username]);

  // ─── COLLAPSE HELPERS ────────────────────────────────────────────────
  const toggleColumn = useCallback((col) => {
    setCollapsedColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  }, []);

  const toggleTag = useCallback((col, tag) => {
    const key = `${col}__${tag}`;
    setCollapsedTags((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isTagCollapsed = useCallback((col, tag) => {
    return !!collapsedTags[`${col}__${tag}`];
  }, [collapsedTags]);

  // ─── HELPERS ─────────────────────────────────────────────────────────
  const displayUndo = useCallback((action) => {
    setUndoAction(action);
    setShowUndo(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setShowUndo(false);
      setUndoAction(null);
    }, 5000);
  }, []);

  const performUndo = useCallback(async () => {
    if (!undoAction) return;
    try {
      if (undoAction.type === "move") {
        await set(ref(database, `shoppingList/${undoAction.fromList}/${undoAction.itemId}`), undoAction.item);
        await remove(ref(database, `shoppingList/${undoAction.toList}/${undoAction.itemId}`));
      } else if (undoAction.type === "delete") {
        await set(ref(database, `shoppingList/${undoAction.listName}/${undoAction.itemId}`), undoAction.item);
      }
    } catch (e) {
      console.error("Undo failed:", e);
      setError("Failed to undo.");
    }
    setShowUndo(false);
    setUndoAction(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [undoAction]);

  const itemExists = useCallback((name) => {
    const n = name.trim().toLowerCase();
    return (
      Object.values(lists.imamo).some((i) => i.name.toLowerCase() === n) ||
      Object.values(lists.kupiti).some((i) => i.name.toLowerCase() === n)
    );
  }, [lists.imamo, lists.kupiti]);

  const animateItem = useCallback((id) => {
    setAnimatingItems((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setAnimatingItems((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 350);
  }, []);

  // ─── ACTIONS ─────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    if (!confirm("Are you sure you want to logout?")) return;
    try {
      await set(ref(database, `presence/${username}`), { username, online: false, lastSeen: Date.now() });
      await signOut(auth);
      navigate("/");
    } catch (e) {
      console.error("Logout error:", e);
    }
  }, [confirm, username, navigate]);

  const moveItem = useCallback(async (itemId, item, fromList, toList) => {
    animateItem(itemId);
    setLists((prev) => {
      const next = { imamo: { ...prev.imamo }, kupiti: { ...prev.kupiti } };
      delete next[fromList][itemId];
      next[toList][itemId] = item;
      return next;
    });
    try {
      await set(ref(database, `shoppingList/${toList}/${itemId}`), item);
      await remove(ref(database, `shoppingList/${fromList}/${itemId}`));
      displayUndo({ type: "move", itemId, item, fromList, toList, itemName: item.name });
    } catch (e) {
      console.error("Move error:", e);
      setError("Failed to move item.");
    }
  }, [animateItem, displayUndo]);

  const deleteItem = useCallback(async (itemId, listName, itemName) => {
    if (!confirm(`Delete "${itemName}"?`)) return;
    const itemToDelete = lists[listName][itemId];
    if (!itemToDelete) return;

    animateItem(itemId);
    setLists((prev) => ({
      ...prev,
      [listName]: Object.fromEntries(Object.entries(prev[listName]).filter(([id]) => id !== itemId)),
    }));

    try {
      await remove(ref(database, `shoppingList/${listName}/${itemId}`));
      displayUndo({ type: "delete", itemId, item: itemToDelete, listName, itemName });
    } catch (e) {
      console.error("Delete error:", e);
      setError("Failed to delete item.");
    }
  }, [lists, confirm, animateItem, displayUndo]);

  const initiateAddItem = useCallback(() => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (itemExists(trimmed)) {
      setError(`"${trimmed}" already exists!`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    setPendingItemName(trimmed);
    setSelectedTag("");
    setShowTagModal(true);
  }, [newItem, itemExists]);

  const addCustomTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setError("Tag name cannot be empty!");
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (availableTags[trimmed]) {
      setError("Tag already exists!");
      setTimeout(() => setError(null), 3000);
      return;
    }
    try {
      await set(ref(database, `tags/${trimmed}`), newTagColor);
      setNewTagName("");
      setNewTagColor(COLORS.primary);
      setShowAddTag(false);
      setError(null);
    } catch (e) {
      console.error("Tag add error:", e);
      setError("Failed to add tag.");
    }
  }, [newTagName, newTagColor, availableTags]);

  const confirmAddItem = useCallback(async () => {
    if (!selectedTag) {
      setError("Please select a tag!");
      setTimeout(() => setError(null), 3000);
      return;
    }
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const item = { name: pendingItemName, addedBy: username, addedAt: Date.now(), tag: selectedTag };

    setLists((prev) => ({ ...prev, kupiti: { ...prev.kupiti, [uniqueId]: item } }));

    try {
      await set(ref(database, `shoppingList/kupiti/${uniqueId}`), item);
      setNewItem("");
      if (document.activeElement) document.activeElement.blur();
      setShowTagModal(false);
      setPendingItemName("");
      setSelectedTag("");
      setError(null);
      animateItem(uniqueId);
    } catch (e) {
      console.error("Add error:", e);
      setError("Failed to add item.");
    }
  }, [selectedTag, pendingItemName, username, animateItem]);

  const updateRecipeDescription = useCallback((recipeId, description, recipe) => {
    if (recipeTimersRef.current[recipeId]) {
      clearTimeout(recipeTimersRef.current[recipeId]);
    }
    recipeTimersRef.current[recipeId] = setTimeout(async () => {
      try {
        await set(ref(database, `recipes/${recipeId}`), {
          ...recipe,
          description,
          lastEditedAt: Date.now(),
          lastEditedBy: username,
        });
      } catch (e) {
        console.error("Recipe update error:", e);
        setError("Failed to update recipe.");
      }
    }, 800);
  }, [username]);

  // ─── MEMOIZED COMPUTATIONS ───────────────────────────────────────────
  const imamoGrouped = useMemo(() => groupByTag(lists.imamo), [lists.imamo]);
  const kupitiGrouped = useMemo(() => groupByTag(lists.kupiti), [lists.kupiti]);
  const imamoCount = useMemo(() => Object.keys(lists.imamo).length, [lists.imamo]);
  const kupitiCount = useMemo(() => Object.keys(lists.kupiti).length, [lists.kupiti]);

  const otherOnlineUsers = useMemo(
    () =>
      Object.entries(onlineUsers)
        .filter(([name, data]) => name !== username && data?.online)
        .map(([name]) => name),
    [onlineUsers, username]
  );

  const recipeStatuses = useMemo(() => {
    const map = {};
    Object.entries(recipes).forEach(([id, recipe]) => {
      map[id] = getRecipeIngredientStatus(recipe.ingredients || {}, lists);
    });
    return map;
  }, [recipes, lists]);

  // ─── RENDER SHOPPING COLUMN ──────────────────────────────────────────
  const renderColumn = useCallback((title, emoji, color, listName, grouped, count) => {
    const isCollapsed = collapsedColumns[listName];
    const hasItems = Object.keys(grouped).length > 0;

    return (
      <section className="column">
        {/* Column Header — clickable to collapse */}
        <button
          className="column-header column-header--clickable"
          onClick={() => toggleColumn(listName)}
          aria-expanded={!isCollapsed}
          aria-label={`${title} (${count} items)`}
        >
          <div className="column-title-wrapper">
            <span className="title-emoji">{emoji}</span>
            <h2 className="column-title" style={{ color }}>{title}</h2>
          </div>
          <div className="column-header-right">
            <span
              className="count-badge"
              style={{ color, background: listName === "kupiti" ? COLORS.accentSoft : "#D1FAE5" }}
            >
              {count}
            </span>
            <Chevron collapsed={isCollapsed} color={color} />
          </div>
        </button>

        {/* Column Content — collapsible */}
        <div
          className={`list-container list-container--collapsible ${isCollapsed ? "collapsed" : ""}`}
          style={{ background: COLORS.surface }}
        >
          {!hasItems ? (
            <div className="empty-state">
              <span className="empty-emoji">{listName === "kupiti" ? "🎉" : "🛍️"}</span>
              <p>
                {listName === "kupiti"
                  ? <>Prazno!<br />Čestitam!</>
                  : <>Lista je prazna!<br />Vreme je za kupovinu!</>}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([tag, items]) => {
              const tagCollapsed = isTagCollapsed(listName, tag);
              const tagColor = availableTags[tag] || COLORS.textMuted;

              return (
                <div key={tag} className="tag-group">
                  {/* Tag Header — clickable to collapse */}
                  <button
                    className="tag-header tag-header--clickable"
                    onClick={() => toggleTag(listName, tag)}
                    aria-expanded={!tagCollapsed}
                    aria-label={`${tag} (${items.length} items)`}
                  >
                    <span
                      className="tag-chip"
                      style={{ backgroundColor: tagColor }}
                    >
                      {tag}
                    </span>
                    <div className="tag-header-right">
                      <span className="tag-count">{items.length}</span>
                      <Chevron collapsed={tagCollapsed} color={tagColor} />
                    </div>
                  </button>

                  {/* Tag Items — collapsible */}
                  <div className={`tag-items ${tagCollapsed ? "collapsed" : ""}`}>
                    <div className="item-list">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={`item-card ${animatingItems.has(item.id) ? "animate-in" : ""}`}
                          onClick={() =>
                            moveItem(
                              item.id,
                              { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt, tag: item.tag },
                              listName,
                              listName === "kupiti" ? "imamo" : "kupiti"
                            )
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              moveItem(
                                item.id,
                                { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt, tag: item.tag },
                                listName,
                                listName === "kupiti" ? "imamo" : "kupiti"
                              );
                            }
                          }}
                        >
                          <div className="item-content">
                            <span className="item-name">{item.name}</span>
                            <span className="item-meta">
                              by{" "}
                              <span style={{ color: USER_COLORS[item.addedBy] || COLORS.primary }}>
                                {item.addedBy}
                              </span>
                            </span>
                          </div>
                          <button
                            className="delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(item.id, listName, item.name);
                            }}
                            aria-label={`Delete ${item.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }, [collapsedColumns, collapsedTags, isTagCollapsed, availableTags, animatingItems, moveItem, deleteItem]);

  // ─── RENDER ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-container" style={{ background: COLORS.bg }}>
        <div className="spinner" style={{ borderColor: "rgba(45,106,79,0.15)", borderTopColor: COLORS.primary }}></div>
        <p className="loading-text" style={{ color: COLORS.primary }}>Učitavanje liste…</p>
      </div>
    );
  }

  return (
    <div className="app-page" style={{ background: COLORS.bg }}>
      {/* ── Banners ── */}
      <div className="banner-stack">
        {error && (
          <div className="banner banner-error">
            <span>{error}</span>
            <button className="banner-close" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
          </div>
        )}
        {showUndo && undoAction && (
          <div className="banner banner-undo">
            <span>
              {undoAction.type === "move"
                ? `✨ Prebačen "${undoAction.itemName}"`
                : `🗑️ Obrisan "${undoAction.itemName}"`}
            </span>
            <button className="undo-btn" onClick={performUndo}>↩️ Undo</button>
          </div>
        )}
      </div>

      {/* ── Top Bar ── */}
      <header className="top-bar" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div className="nav-container">
          <div className="user-info">
            <div className="welcome-text">
              <span className="welcome-emoji">👋</span>
              <span className="username" style={{ color: USER_COLORS[username] || COLORS.primary }}>
                {username}
              </span>
            </div>
            {otherOnlineUsers.length > 0 && (
              <div className="online-badge">
                <span className="online-dot" style={{ color: COLORS.online }}>●</span>
                <span>{otherOnlineUsers.join(", ")} online</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Tag Modal ── */}
      {showTagModal && (
        <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ color: COLORS.primary }}>
              🏷️ Izaberi tag za<br />"{pendingItemName}"
            </h3>
            <div className="tag-grid">
              {Object.entries(availableTags).map(([tagName, color]) => (
                <button
                  key={tagName}
                  className={`tag-option ${selectedTag === tagName ? "selected" : ""}`}
                  style={{
                    backgroundColor: selectedTag === tagName ? color : "white",
                    color: selectedTag === tagName ? "white" : color,
                    borderColor: color,
                  }}
                  onClick={() => setSelectedTag(tagName)}
                  aria-pressed={selectedTag === tagName}
                >
                  {tagName}
                </button>
              ))}
            </div>

            {!showAddTag ? (
              <button className="add-new-tag-btn" onClick={() => setShowAddTag(true)}>
                ➕ Novi tag
              </button>
            ) : (
              <div className="new-tag-form">
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="new-tag-input"
                  autoFocus
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="color-picker"
                />
                <div className="new-tag-actions">
                  <button className="save-tag-btn" onClick={addCustomTag}>Save</button>
                  <button className="cancel-tag-btn" onClick={() => { setShowAddTag(false); setNewTagName(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => { setShowTagModal(false); setShowAddTag(false); setNewTagName(""); }}>
                Odustani
              </button>
              <button className="confirm-btn" onClick={confirmAddItem} disabled={!selectedTag}>
                Dodaj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shopping Page ── */}
      {currentPage === "shopping" && (
        <main className="shopping-content">
          {renderColumn("Kupiti", "🛒", COLORS.accent, "kupiti", kupitiGrouped, kupitiCount)}
          {renderColumn("Imamo", "✅", COLORS.primary, "imamo", imamoGrouped, imamoCount)}
        </main>
      )}

      {/* ── Kuhinjica Page ── */}
      {currentPage === "kuhinjica" && (
        <main className="recipes-content">
          {Object.entries(recipes).map(([id, recipe]) => (
            <article key={id} className="recipe-card" style={{ background: COLORS.surface }}>
              <img src={recipe.image} alt={recipe.name} className="recipe-image" loading="lazy" />
              <h3 className="recipe-title" style={{ color: COLORS.primary }}>{recipe.name}</h3>

              <div className="ingredients-section">
                <h4 className="ingredients-title" style={{ color: COLORS.primary }}>
                  <span>🧂</span> Sastojci
                </h4>
                {Object.entries(recipe.ingredients || {}).map(([ing, data]) => {
                  const status = recipeStatuses[id]?.[ing] || "missing";
                  return (
                    <div key={ing} className={`ingredient-item ingredient-${status}`}>
                      <span>{ing}</span>
                      <span className="ingredient-quantity">({data.quantity})</span>
                      <span className="ingredient-icon">
                        {status === "have" && "✅"}
                        {status === "buy" && "🛒"}
                        {status === "missing" && "❌"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <textarea
                value={recipe.description || ""}
                onChange={(e) => updateRecipeDescription(id, e.target.value, recipe)}
                placeholder="📝 Dodaj opis…"
                className="recipe-textarea"
              />

              <div className="recipe-footer">
                <small className="edit-info">
                  Last edit: {recipe.lastEditedBy || "unknown"} • {recipe.lastEditedAt ? new Date(recipe.lastEditedAt).toLocaleDateString() : "never"}
                </small>
              </div>
            </article>
          ))}
        </main>
      )}

      {/* ── Bottom Nav ── */}
      <nav className="bottom-nav" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <button
          className={`nav-btn ${currentPage === "shopping" ? "active" : ""}`}
          onClick={() => setCurrentPage("shopping")}
          aria-label="Shopping list"
        >
          <span className="nav-icon">🛒</span>
          <span className="nav-label">Lista</span>
        </button>
        <button
          className={`nav-btn ${currentPage === "kuhinjica" ? "active" : ""}`}
          onClick={() => setCurrentPage("kuhinjica")}
          aria-label="Recipes"
        >
          <span className="nav-icon">🍳</span>
          <span className="nav-label">Kuhinjica</span>
        </button>
        <button className="nav-btn" onClick={handleLogout} aria-label="Logout">
          <span className="nav-icon">🚪</span>
          <span className="nav-label">Izađi</span>
        </button>
      </nav>

      {/* ── Add Bar ── */}
      <div className="add-bar" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <input
          className="add-input"
          type="text"
          value={newItem}
          placeholder="Dodaj mleko, jaja…"
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && initiateAddItem()}
          aria-label="New item"
        />
        <button
          className="add-btn"
          onClick={initiateAddItem}
          disabled={!newItem.trim()}
          aria-label="Add item"
          style={{ background: COLORS.primary }}
        >
          <span className="add-btn-text">+</span>
        </button>
      </div>
    </div>
  );
}

// ─── UTILITIES ─────────────────────────────────────────────────────────
function groupByTag(items) {
  const grouped = {};
  Object.entries(items).forEach(([id, item]) => {
    const tag = item.tag || "Uncategorized";
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push({ id, ...item });
  });
  return grouped;
}

function getRecipeIngredientStatus(ingredients, lists) {
  const statusMap = {};
  Object.keys(ingredients).forEach((ing) => {
    const normalized = ing.toLowerCase().trim();
    const inImamo = Object.values(lists.imamo).some((i) => i.name.toLowerCase() === normalized);
    const inKupiti = Object.values(lists.kupiti).some((i) => i.name.toLowerCase() === normalized);
    statusMap[ing] = inImamo ? "have" : inKupiti ? "buy" : "missing";
  });
  return statusMap;
}