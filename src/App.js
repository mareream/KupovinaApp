import { useState, useEffect, useRef } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";
import "./index.css"; // Import the CSS file

// Default tags with vibrant colors
const DEFAULT_TAGS = {
  "DM": "#FF6B6B",
  "Maxi": "#4ECDC4",
  "VocPovrc": "#A8E6CF",
  "Apoteka": "#FFD93D",
  "Lidl": "#6C5CE7"
};

// User colors
const USER_COLORS = {
  Mare: "#FF8A5C",
  Caka: "#FF6B9D",
};

export default function App() {
  const [lists, setLists] = useState({ imamo: {}, kupiti: {} });
  const [availableTags, setAvailableTags] = useState(DEFAULT_TAGS);
  const [newItem, setNewItem] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [error, setError] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [showUndo, setShowUndo] = useState(false);
  const [animatingItems, setAnimatingItems] = useState(new Set());
  const [currentPage, setCurrentPage] = useState("shopping");
  const [recipes, setRecipes] = useState({});
  
  // Tag selection modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingItemName, setPendingItemName] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#FFB347");
  const [showAddTag, setShowAddTag] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username || "unknown";
  const undoTimeoutRef = useRef(null);

  // Check authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);
      } else {
        navigate("/");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Consolidated shopping list listener
  useEffect(() => {
    if (!currentUser) return;

    const dataRef = ref(database, "shoppingList");
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLists({
          imamo: data.imamo || {},
          kupiti: data.kupiti || {}
        });
      } else {
        setLists({ imamo: {}, kupiti: {} });
      }
      setError(null);
    }, (error) => {
      console.error("Error reading from Firebase:", error);
      setError("Failed to load data. Please refresh the page.");
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen to recipes
  useEffect(() => {
    if (!currentUser) return;

    const recipesRef = ref(database, "recipes");
    const unsubscribe = onValue(recipesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setRecipes(data);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen to tags
  useEffect(() => {
    if (!currentUser) return;

    const tagsRef = ref(database, "tags");
    const unsubscribe = onValue(tagsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAvailableTags({ ...DEFAULT_TAGS, ...data });
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // User presence tracking
  useEffect(() => {
    if (!currentUser || !username) return;

    const presenceRef = ref(database, `presence/${username}`);

    const setOnline = async () => {
      try {
        await set(presenceRef, {
          username: username,
          online: true,
          lastSeen: Date.now()
        });
      } catch (err) {
        console.error("Error setting presence:", err);
      }
    };

    const setOffline = async () => {
      try {
        await set(presenceRef, {
          username: username,
          online: false,
          lastSeen: Date.now()
        });
      } catch (err) {
        console.error("Error setting offline:", err);
      }
    };

    setOnline();

    const presenceListener = onValue(ref(database, "presence"), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setOnlineUsers(data);
      }
    });

    window.addEventListener("beforeunload", setOffline);
    const intervalId = setInterval(setOnline, 30000);

    return () => {
      setOffline();
      window.removeEventListener("beforeunload", setOffline);
      clearInterval(intervalId);
      presenceListener();
    };
  }, [currentUser, username]);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) return;

    try {
      const presenceRef = ref(database, `presence/${username}`);
      await set(presenceRef, {
        username: username,
        online: false,
        lastSeen: Date.now()
      });
      
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const itemExists = (itemName) => {
    const normalizedName = itemName.trim().toLowerCase();
    
    const existsInImamo = Object.values(lists.imamo).some(
      item => item.name.toLowerCase() === normalizedName
    );
    const existsInKupiti = Object.values(lists.kupiti).some(
      item => item.name.toLowerCase() === normalizedName
    );
    
    return existsInImamo || existsInKupiti;
  };

  const showUndoNotification = (undoAction) => {
    setUndoStack([undoAction]);
    setShowUndo(true);

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }

    undoTimeoutRef.current = setTimeout(() => {
      setShowUndo(false);
      setUndoStack([]);
    }, 5000);
  };

  const performUndo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[0];
    
    try {
      if (action.type === "move") {
        const fromRef = ref(database, `shoppingList/${action.fromList}/${action.itemId}`);
        await set(fromRef, action.item);
        
        const toRef = ref(database, `shoppingList/${action.toList}/${action.itemId}`);
        await remove(toRef);
      } else if (action.type === "delete") {
        const itemRef = ref(database, `shoppingList/${action.listName}/${action.itemId}`);
        await set(itemRef, action.item);
      }

      setShowUndo(false);
      setUndoStack([]);
      
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    } catch (error) {
      console.error("Error undoing action:", error);
      setError("Failed to undo action.");
    }
  };

  const moveItem = async (itemId, item, fromList, toList) => {
    setAnimatingItems(prev => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 400);

    const updatedLists = {
      imamo: { ...lists.imamo },
      kupiti: { ...lists.kupiti }
    };
    
    delete updatedLists[fromList][itemId];
    updatedLists[toList][itemId] = item;
    
    setLists(updatedLists);

    try {
      const toRef = ref(database, `shoppingList/${toList}/${itemId}`);
      await set(toRef, item);
      
      const fromRef = ref(database, `shoppingList/${fromList}/${itemId}`);
      await remove(fromRef);

      showUndoNotification({
        type: "move",
        itemId,
        item,
        fromList,
        toList,
        itemName: item.name
      });
    } catch (error) {
      console.error("Error moving item:", error);
      setError("Failed to move item. Please try again.");
      setLists({
        imamo: lists.imamo,
        kupiti: lists.kupiti
      });
    }
  };

  const deleteItem = async (itemId, listName, itemName) => {
    if (!window.confirm(`Delete "${itemName}"?`)) return;

    const itemToDelete = lists[listName][itemId];

    setAnimatingItems(prev => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 400);

    setLists(prev => ({
      ...prev,
      [listName]: Object.fromEntries(
        Object.entries(prev[listName]).filter(([id]) => id !== itemId)
      )
    }));

    try {
      const itemRef = ref(database, `shoppingList/${listName}/${itemId}`);
      await remove(itemRef);

      showUndoNotification({
        type: "delete",
        itemId,
        item: itemToDelete,
        listName,
        itemName
      });
    } catch (error) {
      console.error("Error deleting item:", error);
      setError("Failed to delete item. Please try again.");
      setLists(prev => ({
        ...prev,
        [listName]: { ...prev[listName], [itemId]: itemToDelete }
      }));
    }
  };

  const initiateAddItem = () => {
    const trimmedItem = newItem.trim();
    
    if (trimmedItem === "") return;

    if (itemExists(trimmedItem)) {
      setError(`"${trimmedItem}" already exists in your lists!`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    setPendingItemName(trimmedItem);
    setSelectedTag("");
    setShowTagModal(true);
  };

  const addCustomTag = async () => {
    const trimmedTagName = newTagName.trim();
    
    if (trimmedTagName === "") {
      setError("Tag name cannot be empty!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (availableTags[trimmedTagName]) {
      setError("Tag already exists!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      const tagRef = ref(database, `tags/${trimmedTagName}`);
      await set(tagRef, newTagColor);
      
      setNewTagName("");
      setNewTagColor("#FFB347");
      setShowAddTag(false);
      setError(null);
    } catch (error) {
      console.error("Error adding tag:", error);
      setError("Failed to add tag. Please try again.");
    }
  };

  const confirmAddItem = async () => {
    if (!selectedTag) {
      setError("Please select a tag!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const item = {
        name: pendingItemName,
        addedBy: username,
        addedAt: Date.now(),
        tag: selectedTag
      };

      setLists(prev => ({
        ...prev,
        kupiti: {
          ...prev.kupiti,
          [uniqueId]: item
        }
      }));

      const itemRef = ref(database, `shoppingList/kupiti/${uniqueId}`);
      await set(itemRef, item);
      
      setNewItem("");
      document.activeElement.blur();
      setShowTagModal(false);
      setPendingItemName("");
      setSelectedTag("");
      setError(null);

      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.add(uniqueId);
        return newSet;
      });
      
      setTimeout(() => {
        setAnimatingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(uniqueId);
          return newSet;
        });
      }, 400);
    } catch (error) {
      console.error("Error adding item:", error);
      setError("Failed to add item. Please try again.");
      
      setLists(prev => ({
        ...prev,
        kupiti: Object.fromEntries(
          Object.entries(prev.kupiti).filter(([id]) => id !== uniqueId)
        )
      }));
    }
  };

  const updateRecipeDescription = async (recipeId, description, recipe) => {
    try {
      const recipeRef = ref(database, `recipes/${recipeId}`);
      await set(recipeRef, {
        ...recipe,
        description,
        lastEditedAt: Date.now(),
        lastEditedBy: username
      });
    } catch (error) {
      console.error("Error updating recipe:", error);
      setError("Failed to update recipe description.");
    }
  };

  const groupByTag = (items) => {
    const grouped = {};
    
    Object.entries(items).forEach(([id, item]) => {
      const tag = item.tag || "Uncategorized";
      if (!grouped[tag]) {
        grouped[tag] = [];
      }
      grouped[tag].push({ id, ...item });
    });

    return grouped;
  };

  const getRecipeIngredientStatus = (ingredients) => {
    const statusMap = {};
    
    Object.keys(ingredients || {}).forEach((ing) => {
      const normalizedIng = ing.toLowerCase().trim();
      
      const inImamo = Object.values(lists.imamo).some(
        item => item.name.toLowerCase() === normalizedIng
      );
      
      const inKupiti = Object.values(lists.kupiti).some(
        item => item.name.toLowerCase() === normalizedIng
      );

      if (inImamo) {
        statusMap[ing] = "have";
      } else if (inKupiti) {
        statusMap[ing] = "buy";
      } else {
        statusMap[ing] = "missing";
      }
    });

    return statusMap;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p className="loading-text">Ucitavanje liste... ✨</p>
      </div>
    );
  }

  const imamoGrouped = groupByTag(lists.imamo);
  const kupitiGrouped = groupByTag(lists.kupiti);
  const imamoCount = Object.keys(lists.imamo).length;
  const kupitiCount = Object.keys(lists.kupiti).length;

  const otherOnlineUsers = Object.entries(onlineUsers)
    .filter(([name, data]) => name !== username && data.online)
    .map(([name]) => name);

  return (
    <div className="app-page">
      {/* Fixed top banners */}
      <div className="fixed-banner-container">
        {error && (
          <div className="error-banner">
            <span>😕 {error}</span>
            <button className="close-error" onClick={() => setError(null)}>✖</button>
          </div>
        )}

        {showUndo && undoStack.length > 0 && (
          <div className="undo-banner">
            <span>
              {undoStack[0].type === "move" 
                ? `✨ Prebacen "${undoStack[0].itemName}"` 
                : `🗑️ Obrisan "${undoStack[0].itemName}"`}
            </span>
            <button className="undo-btn" onClick={performUndo}>
              ↩️ Undo
            </button>
          </div>
        )}
      </div>

      {/* Top Bar */}
      <div className="top-bar">
        <div className="nav-container">
          <div className="user-info">
            <div className="welcome-text">
              <span className="welcome-emoji">❤️</span>
              <span className="username" style={{ color: USER_COLORS[username] || "#FF8A5C" }}>
                {username}
              </span>
            </div>
            {otherOnlineUsers.length > 0 && (
              <div className="online-badge">
                <span className="online-dot">●</span>
                <span>{otherOnlineUsers.join(", ")} online</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tag Selection Modal */}
      {showTagModal && (
        <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              🏷️ Izaberi tag za<br />"{pendingItemName}"
            </h3>
            
            <div className="tag-grid">
              {Object.entries(availableTags).map(([tagName, color]) => (
                <button
                  key={tagName}
                  className={`tag-option ${selectedTag === tagName ? 'selected' : ''}`}
                  style={{
                    backgroundColor: selectedTag === tagName ? color : "white",
                    color: selectedTag === tagName ? "white" : color,
                    borderColor: color,
                  }}
                  onClick={() => setSelectedTag(tagName)}
                >
                  {tagName}
                </button>
              ))}
            </div>

            {!showAddTag ? (
              <button className="add-new-tag-btn" onClick={() => setShowAddTag(true)}>
                ✨ Napravi novi Tag
              </button>
            ) : (
              <div className="new-tag-form">
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="new-tag-input"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="color-picker"
                />
                <div className="new-tag-actions">
                  <button className="save-tag-btn" onClick={addCustomTag}>
                    Save
                  </button>
                  <button className="cancel-tag-btn" onClick={() => {
                    setShowAddTag(false);
                    setNewTagName("");
                    setNewTagColor("#FFB347");
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button 
                className="cancel-btn" 
                onClick={() => {
                  setShowTagModal(false);
                  setShowAddTag(false);
                  setNewTagName("");
                }}
              >
                Odustani
              </button>
              <button 
                className="confirm-btn"
                onClick={confirmAddItem}
                disabled={!selectedTag}
              >
                Dodaj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {currentPage === "shopping" && (
        <div className="shopping-content">
          {/* Left Column - Kupiti */}
          <div className="column">
            <div className="column-header">
              <h2 className="column-title">
                <span className="title-emoji">🛒</span>
                Kupiti
              </h2>
              <span className="count-badge">{kupitiCount}</span>
            </div>
            <div className="list-container">
              {Object.keys(kupitiGrouped).length === 0 ? (
                <div className="empty-state">
                  <span className="empty-emoji">🎉</span>
                  <p>Prazno!<br />Cestitam!</p>
                </div>
              ) : (
                Object.entries(kupitiGrouped).map(([tag, items]) => (
                  <div key={tag} className="tag-group">
                    <div className="tag-header">
                      <span
                        className="tag-chip"
                        style={{ backgroundColor: availableTags[tag] || "#FFB347" }}
                      >
                        {tag}
                      </span>
                      <span className="tag-count">{items.length}</span>
                    </div>
                    <div className="item-list">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={`item-card ${animatingItems.has(item.id) ? 'animate-in' : ''}`}
                          onClick={() =>
                            moveItem(
                              item.id,
                              {
                                name: item.name,
                                addedBy: item.addedBy,
                                addedAt: item.addedAt,
                                tag: item.tag,
                              },
                              "kupiti",
                              "imamo"
                            )
                          }
                        >
                          <div className="item-content">
                            <span className="item-name">{item.name}</span>
                            <span className="item-meta">
                              by <span style={{ color: USER_COLORS[item.addedBy] || "#FF8A5C" }}>
                                {item.addedBy}
                              </span>
                            </span>
                          </div>
                          <button
                            className="delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(item.id, "kupiti", item.name);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column - Imamo */}
          <div className="column">
            <div className="column-header">
              <h2 className="column-title">
                <span className="title-emoji">✅</span>
                Imamo
              </h2>
              <span className="count-badge">{imamoCount}</span>
            </div>
            <div className="list-container">
              {Object.keys(imamoGrouped).length === 0 ? (
                <div className="empty-state">
                  <span className="empty-emoji">🛍️</span>
                  <p>Lista je prazna!<br />Vreme je za kupovinu!</p>
                </div>
              ) : (
                Object.entries(imamoGrouped).map(([tag, items]) => (
                  <div key={tag} className="tag-group">
                    <div className="tag-header">
                      <span
                        className="tag-chip"
                        style={{ backgroundColor: availableTags[tag] || "#FFB347" }}
                      >
                        {tag}
                      </span>
                      <span className="tag-count">{items.length}</span>
                    </div>
                    <div className="item-list">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={`item-card ${animatingItems.has(item.id) ? 'animate-in' : ''}`}
                          onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt, tag: item.tag }, "imamo", "kupiti")}
                        >
                          <div className="item-content">
                            <span className="item-name">{item.name}</span>
                            <span className="item-meta">
                              by <span style={{ color: USER_COLORS[item.addedBy] || "#FF8A5C" }}>
                                {item.addedBy}
                              </span>
                            </span>
                          </div>
                          <button
                            className="delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(item.id, "imamo", item.name);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kuhinjica Page */}
      {currentPage === "kuhinjica" && (
        <div className="recipes-content">
          {Object.entries(recipes).map(([id, recipe]) => (
            <div key={id} className="recipe-card">
              <img
                src={recipe.image}
                alt={recipe.name}
                className="recipe-image"
              />
              <h3 className="recipe-title">{recipe.name}</h3>

              <div className="ingredients-section">
                <h4 className="ingredients-title">
                  <span>🧂</span> Sastojci
                </h4>
                {Object.entries(recipe.ingredients || {}).map(([ing, data]) => {
                  const ingredientStatuses = getRecipeIngredientStatus(recipe.ingredients);
                  const status = ingredientStatuses[ing];

                  return (
                    <div
                      key={ing}
                      className={`ingredient-item ingredient-${status}`}
                    >
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
                placeholder="📝 Dodaj opis..."
                className="recipe-textarea"
              />

              <div className="recipe-footer">
                <small className="edit-info">
                  Last edit: {recipe.lastEditedBy || "unknown"} •{" "}
                  {recipe.lastEditedAt
                    ? new Date(recipe.lastEditedAt).toLocaleDateString()
                    : "never"}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-btn ${currentPage === "shopping" ? "active" : ""}`}
          onClick={() => setCurrentPage("shopping")}
        >
          <span className="nav-icon">🛒</span>
          <span className="nav-label">Lista</span>
        </button>

        <button
          className={`nav-btn ${currentPage === "kuhinjica" ? "active" : ""}`}
          onClick={() => setCurrentPage("kuhinjica")}
        >
          <span className="nav-icon">🍳</span>
          <span className="nav-label">Kuhinjica</span>
        </button>

        <button
          className="nav-btn"
          onClick={handleLogout}
        >
          <span className="nav-icon">❌</span>
          <span className="nav-label">Exit</span>
        </button>
      </div>

      {/* Add Item Bar */}
      <div className="add-bar">
        <input
          className="add-input"
          type="text"
          value={newItem}
          placeholder="Dodaj mleko, jaja..."
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              initiateAddItem();
            }
          }}          
        />
        <button
          className="add-btn"
          onClick={initiateAddItem}
          disabled={!newItem.trim()}
        >
          <span className="add-btn-text">+</span>
        </button>
      </div>
    </div>
  );
}