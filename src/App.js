import { useState, useEffect, useRef } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";

// Default tags with vibrant colors
const DEFAULT_TAGS = {
  "DM": "#FF6B6B",      // Coral
  "Maxi": "#4ECDC4",    // Turquoise
  "VocPovrc": "#A8E6CF", // Mint
  "Apoteka": "#FFD93D",  // Sunny Yellow
  "Lidl": "#6C5CE7"      // Purple
};

// User colors - more vibrant
const USER_COLORS = {
  Mare: "#FF8A5C",      // Peach
  Caka: "#FF6B9D",      // Pink
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
  const [newTagColor, setNewTagColor] = useState("#FFB347"); // Warm orange default
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
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading your happy list... ✨</p>
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
    <div style={styles.page}>
      {/* Fixed top banners */}
      <div style={styles.fixedBannerContainer}>
        {error && (
          <div style={styles.errorBanner}>
            <span>😕 {error}</span>
            <button style={styles.closeError} onClick={() => setError(null)}>✖</button>
          </div>
        )}

        {showUndo && undoStack.length > 0 && (
          <div style={styles.undoBanner}>
            <span>
              {undoStack[0].type === "move" 
                ? `✨ Moved "${undoStack[0].itemName}"` 
                : `🗑️ Deleted "${undoStack[0].itemName}"`}
            </span>
            <button style={styles.undoButton} onClick={performUndo}>
              ↩️ Undo
            </button>
          </div>
        )}
      </div>

      {/* Top Bar */}
      <div style={styles.topBar}>
        <div style={styles.navContainer}>
          <div style={styles.userInfo}>
            <div style={styles.welcomeText}>
              <span style={{ ...styles.username, color: USER_COLORS[username] || "#FF8A5C" }}>
                {username}
              </span>
            </div>
            {otherOnlineUsers.length > 0 && (
              <div style={styles.onlineBadge}>
                <span style={styles.onlineDot}>●</span>
                <span style={styles.onlineText}>{otherOnlineUsers.join(", ")} online</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tag Selection Modal */}
      {showTagModal && (
        <div style={styles.modalOverlay} onClick={() => setShowTagModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              🏷️ Pick a tag for<br />"{pendingItemName}"
            </h3>
            
            <div style={styles.tagGrid}>
              {Object.entries(availableTags).map(([tagName, color]) => (
                <button
                  key={tagName}
                  style={{
                    ...styles.tagOption,
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
              <button style={styles.addNewTagButton} onClick={() => setShowAddTag(true)}>
                ✨ Create New Tag
              </button>
            ) : (
              <div style={styles.newTagForm}>
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  style={styles.newTagInput}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  style={styles.colorPicker}
                />
                <div style={styles.newTagActions}>
                  <button style={styles.saveTagButton} onClick={addCustomTag}>
                    Save
                  </button>
                  <button style={styles.cancelTagButton} onClick={() => {
                    setShowAddTag(false);
                    setNewTagName("");
                    setNewTagColor("#FFB347");
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={styles.modalActions}>
              <button 
                style={styles.cancelButton} 
                onClick={() => {
                  setShowTagModal(false);
                  setShowAddTag(false);
                  setNewTagName("");
                }}
              >
                Maybe Later
              </button>
              <button 
                style={{
                  ...styles.confirmButton,
                  opacity: !selectedTag ? 0.5 : 1,
                }}
                onClick={confirmAddItem}
                disabled={!selectedTag}
              >
                Add to List ✨
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {currentPage === "shopping" && (
        <div style={styles.shoppingContent}>
          {/* Left Column - Kupiti */}
          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.header}>
                <span style={styles.headerEmoji}>🛒</span>
                Kupiti
              </h2>
              <span style={styles.countBadge}>{kupitiCount}</span>
            </div>
            <div style={styles.listContainer}>
              {Object.keys(kupitiGrouped).length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyEmoji}>🎉</span>
                  <p>Nothing to buy!<br />Time to relax!</p>
                </div>
              ) : (
                Object.entries(kupitiGrouped).map(([tag, items]) => (
                  <div key={tag} style={styles.tagGroup}>
                    <div style={styles.tagHeader}>
                      <span style={{
                        ...styles.tagChip,
                        backgroundColor: availableTags[tag] || "#FFB347",
                      }}>
                        {tag}
                      </span>
                      <span style={styles.tagCount}>{items.length}</span>
                    </div>
                    <div style={styles.itemList}>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            ...styles.itemCard,
                            animation: animatingItems.has(item.id) ? "bounceIn 0.4s ease-out" : "none",
                          }}
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
                          <div style={styles.itemContent}>
                            <span style={styles.itemName}>{item.name}</span>
                            <span style={styles.itemMeta}>
                              by <span style={{ color: USER_COLORS[item.addedBy] || "#FF8A5C" }}>
                                {item.addedBy}
                              </span>
                            </span>
                          </div>
                          <button
                            style={styles.deleteButton}
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
          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.header}>
                <span style={styles.headerEmoji}>✅</span>
                Imamo
              </h2>
              <span style={styles.countBadge}>{imamoCount}</span>
            </div>
            <div style={styles.listContainer}>
              {Object.keys(imamoGrouped).length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyEmoji}>🛍️</span>
                  <p>Your list is empty!<br />Time to shop!</p>
                </div>
              ) : (
                Object.entries(imamoGrouped).map(([tag, items]) => (
                  <div key={tag} style={styles.tagGroup}>
                    <div style={styles.tagHeader}>
                      <span style={{
                        ...styles.tagChip,
                        backgroundColor: availableTags[tag] || "#FFB347",
                      }}>
                        {tag}
                      </span>
                      <span style={styles.tagCount}>{items.length}</span>
                    </div>
                    <div style={styles.itemList}>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            ...styles.itemCard,
                            animation: animatingItems.has(item.id) ? "bounceIn 0.4s ease-out" : "none",
                          }}
                          onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt, tag: item.tag }, "imamo", "kupiti")}
                        >
                          <div style={styles.itemContent}>
                            <span style={styles.itemName}>{item.name}</span>
                            <span style={styles.itemMeta}>
                              by <span style={{ color: USER_COLORS[item.addedBy] || "#FF8A5C" }}>
                                {item.addedBy}
                              </span>
                            </span>
                          </div>
                          <button
                            style={styles.deleteButton}
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
        <div style={styles.recipesContent}>
          {Object.entries(recipes).map(([id, recipe]) => (
            <div key={id} style={styles.recipeCard}>
              <img
                src={recipe.image}
                alt={recipe.name}
                style={styles.recipeImage}
              />
              <h3 style={styles.recipeTitle}>{recipe.name}</h3>

              <div style={styles.ingredientsSection}>
                <h4 style={styles.ingredientsTitle}>🧂 Ingredients</h4>
                {Object.entries(recipe.ingredients || {}).map(([ing, data]) => {
                  const ingredientStatuses = getRecipeIngredientStatus(recipe.ingredients);
                  const status = ingredientStatuses[ing];

                  return (
                    <div
                      key={ing}
                      style={{
                        ...styles.ingredientItem,
                        ...styles[`ingredient${status.charAt(0).toUpperCase() + status.slice(1)}`]
                      }}
                    >
                      <span>{ing}</span>
                      <span style={styles.ingredientQuantity}>({data.quantity})</span>
                      <span style={styles.ingredientIcon}>
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
                placeholder="📝 Add cooking notes..."
                style={styles.textarea}
              />

              <div style={styles.recipeFooter}>
                <small style={styles.editInfo}>
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
      <div style={styles.bottomNav}>
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === "shopping" ? styles.navButtonActive : {})
          }}
          onClick={() => setCurrentPage("shopping")}
        >
          <span style={styles.navIcon}>🛒</span>
          <span style={styles.navLabel}>Lista</span>
        </button>

        <button
          style={{
            ...styles.navButton,
            ...(currentPage === "kuhinjica" ? styles.navButtonActive : {})
          }}
          onClick={() => setCurrentPage("kuhinjica")}
        >
          <span style={styles.navIcon}>🍳</span>
          <span style={styles.navLabel}>Kuhinjica</span>
        </button>

        <button
          style={styles.navButton}
          onClick={handleLogout}
        >
          <span style={styles.navIcon}>❌</span>
          <span style={styles.navLabel}>Exit</span>
        </button>
      </div>

      {/* Add Item Bar */}
      <div style={styles.addBar}>
        <input
          type="text"
          value={newItem}
          placeholder="Add bananas, milk, bread..."
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              initiateAddItem();
            }
          }}
          style={styles.addInput}
        />
        <button
          style={styles.addButton}
          onClick={initiateAddItem}
          disabled={!newItem.trim()}
        >
          <span style={styles.addButtonText}>+</span>
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #FFF9E6 0%, #FFE8D6 100%)",
    padding: "0",
    paddingTop: "4rem",
    paddingBottom: "7rem",
    fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  fixedBannerContainer: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem",
    gap: "0.5rem",
    pointerEvents: "none",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #FFF9E6 0%, #FFE8D6 100%)",
  },
  spinner: {
    width: "50px",
    height: "50px",
    border: "4px solid rgba(255, 107, 107, 0.2)",
    borderTop: "4px solid #FF6B6B",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "1rem",
  },
  loadingText: {
    fontSize: "1.2rem",
    color: "#FF8A5C",
    fontWeight: "600",
  },
  topBar: {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255, 107, 107, 0.2)",
    boxShadow: "0 4px 20px rgba(255, 107, 107, 0.1)",
    zIndex: 999,
  },
  navContainer: {
    padding: "0.75rem 1rem",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  welcomeText: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  welcomeEmoji: {
    fontSize: "1.2rem",
  },
  username: {
    fontSize: "1rem",
    fontWeight: "700",
    background: "linear-gradient(135deg, #FF6B6B, #FF8A5C)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  onlineBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.75rem",
    backgroundColor: "#A8E6CF",
    borderRadius: "20px",
  },
  onlineDot: {
    color: "#2ecc71",
    fontSize: "0.8rem",
  },
  onlineText: {
    fontSize: "0.8rem",
    color: "#2c3e50",
    fontWeight: "500",
  },
  errorBanner: {
    width: "90%",
    maxWidth: "400px",
    padding: "0.75rem 1rem",
    backgroundColor: "#FFE5E5",
    border: "1px solid #FF6B6B",
    borderRadius: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#FF6B6B",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
    boxShadow: "0 4px 12px rgba(255, 107, 107, 0.2)",
    pointerEvents: "auto",
  },
  undoBanner: {
    width: "90%",
    maxWidth: "400px",
    padding: "0.75rem 1rem",
    backgroundColor: "#E5F6FF",
    border: "1px solid #4ECDC4",
    borderRadius: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#4ECDC4",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
    boxShadow: "0 4px 12px rgba(78, 205, 196, 0.2)",
    pointerEvents: "auto",
  },
  undoButton: {
    padding: "0.4rem 1rem",
    backgroundColor: "#4ECDC4",
    color: "white",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: "600",
    transition: "all 0.2s",
  },
  closeError: {
    background: "none",
    border: "none",
    color: "#FF6B6B",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "0",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
    padding: "1rem",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.5rem",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 20px 40px rgba(255, 107, 107, 0.2)",
  },
  modalTitle: {
    fontSize: "1.3rem",
    fontWeight: "700",
    marginBottom: "1.5rem",
    color: "#FF8A5C",
    textAlign: "center",
    lineHeight: "1.4",
  },
  tagGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  tagOption: {
    padding: "0.6rem",
    borderRadius: "20px",
    border: "2px solid",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: "600",
    textAlign: "center",
    transition: "all 0.2s",
  },
  addNewTagButton: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#FFF9E6",
    color: "#FF8A5C",
    border: "2px dashed #FFB347",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
    marginBottom: "1rem",
    transition: "all 0.2s",
  },
  newTagForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  newTagInput: {
    width: "100%",
    padding: "0.75rem",
    border: "2px solid #FFE8D6",
    borderRadius: "12px",
    fontSize: "0.9rem",
  },
  colorPicker: {
    width: "100%",
    height: "44px",
    border: "2px solid #FFE8D6",
    borderRadius: "12px",
    cursor: "pointer",
  },
  newTagActions: {
    display: "flex",
    gap: "0.5rem",
  },
  saveTagButton: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "#4ECDC4",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  cancelTagButton: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "#FFE5E5",
    color: "#FF6B6B",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  modalActions: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "1rem",
  },
  cancelButton: {
    flex: 1,
    padding: "0.75rem",
    backgroundColor: "#f0f0f0",
    color: "#666",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    padding: "0.75rem",
    background: "linear-gradient(135deg, #FF6B6B, #FF8A5C)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
  },
  shoppingContent: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "500px",
    padding: "1rem",
  },
  column: {
    width: "100%",
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
    padding: "0 0.5rem",
  },
  header: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#FF6B6B",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  headerEmoji: {
    fontSize: "1.8rem",
  },
  countBadge: {
    backgroundColor: "white",
    padding: "0.25rem 0.75rem",
    borderRadius: "20px",
    fontSize: "1rem",
    fontWeight: "700",
    color: "#FF8A5C",
    boxShadow: "0 2px 8px rgba(255, 107, 107, 0.1)",
  },
  listContainer: {
    backgroundColor: "white",
    borderRadius: "20px",
    padding: "1rem",
    boxShadow: "0 8px 20px rgba(255, 107, 107, 0.1)",
  },
  tagGroup: {
    marginBottom: "1.5rem",
  },
  tagHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  tagChip: {
    padding: "0.3rem 1rem",
    borderRadius: "20px",
    color: "white",
    fontSize: "0.85rem",
    fontWeight: "600",
  },
  tagCount: {
    fontSize: "0.8rem",
    color: "#999",
    fontWeight: "500",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  itemCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem",
    backgroundColor: "#FFF9E6",
    borderRadius: "12px",
    border: "1px solid #FFE8D6",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  itemContent: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  itemName: {
    fontSize: "1rem",
    fontWeight: "600",
    color: "#2c3e50",
  },
  itemMeta: {
    fontSize: "0.7rem",
    color: "#95a5a6",
  },
  deleteButton: {
    width: "32px",
    height: "32px",
    backgroundColor: "transparent",
    color: "#FF6B6B",
    border: "none",
    borderRadius: "50%",
    fontSize: "1.2rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  emptyState: {
    padding: "2rem 1rem",
    textAlign: "center",
    color: "#FFB347",
    fontSize: "1rem",
    fontWeight: "500",
  },
  emptyEmoji: {
    fontSize: "2.5rem",
    display: "block",
    marginBottom: "0.5rem",
  },
  recipesContent: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    width: "100%",
    maxWidth: "500px",
    padding: "1rem",
  },
  recipeCard: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.5rem",
    boxShadow: "0 8px 20px rgba(255, 107, 107, 0.1)",
    border: "1px solid #FFE8D6",
  },
  recipeImage: {
    width: "100%",
    height: "200px",
    objectFit: "cover",
    borderRadius: "16px",
    marginBottom: "1rem",
  },
  recipeTitle: {
    fontSize: "1.3rem",
    fontWeight: "700",
    color: "#FF6B6B",
    marginBottom: "1rem",
  },
  ingredientsSection: {
    marginBottom: "1rem",
  },
  ingredientsTitle: {
    fontSize: "1rem",
    fontWeight: "600",
    color: "#FF8A5C",
    marginBottom: "0.5rem",
  },
  ingredientItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem",
    marginBottom: "0.25rem",
    borderRadius: "10px",
    fontSize: "0.9rem",
  },
  ingredientQuantity: {
    color: "#95a5a6",
    fontSize: "0.8rem",
  },
  ingredientIcon: {
    marginLeft: "auto",
  },
  ingredientHave: {
    backgroundColor: "#E8F8F5",
  },
  ingredientBuy: {
    backgroundColor: "#FFF5E6",
  },
  ingredientMissing: {
    backgroundColor: "#FFE5E5",
  },
  textarea: {
    width: "100%",
    marginTop: "0.5rem",
    borderRadius: "12px",
    padding: "0.75rem",
    border: "2px solid #FFE8D6",
    minHeight: "80px",
    fontSize: "0.9rem",
    fontFamily: "inherit",
  },
  recipeFooter: {
    marginTop: "1rem",
    paddingTop: "0.5rem",
    borderTop: "1px solid #FFE8D6",
  },
  editInfo: {
    color: "#95a5a6",
    fontSize: "0.7rem",
  },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-around",
    padding: "0.75rem 1rem",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    borderTop: "1px solid rgba(255, 107, 107, 0.2)",
    boxShadow: "0 -4px 20px rgba(255, 107, 107, 0.1)",
    zIndex: 999,
  },
  navButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.5rem 1.5rem",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: "600",
    transition: "all 0.2s",
    backgroundColor: "transparent",
    color: "#666",
  },
  navButtonActive: {
    background: "linear-gradient(135deg, #FF6B6B20, #FF8A5C20)",
    color: "#FF6B6B",
  },
  navIcon: {
    fontSize: "1.4rem",
  },
  navLabel: {
    fontSize: "0.7rem",
  },
  addBar: {
    position: "fixed",
    bottom: "5rem",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "0.5rem",
    padding: "0.5rem",
    backgroundColor: "white",
    borderRadius: "30px",
    boxShadow: "0 8px 25px rgba(255, 107, 107, 0.2)",
    border: "2px solid #FFE8D6",
    width: "90%",
    maxWidth: "450px",
  },
  addInput: {
    flex: 1,
    padding: "0.8rem 1rem",
    border: "none",
    borderRadius: "30px",
    fontSize: "0.95rem",
    outline: "none",
    backgroundColor: "transparent",
  },
  addButton: {
    width: "44px",
    height: "44px",
    background: "linear-gradient(135deg, #FF6B6B, #FF8A5C)",
    color: "white",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    boxShadow: "0 4px 12px rgba(255, 107, 107, 0.3)",
  },
  addButtonText: {
    fontSize: "1.5rem",
    fontWeight: "600",
    lineHeight: "1",
  },
};

// Add global styles and animations
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes slideIn {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes bounceIn {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Poppins', sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  input, button, textarea {
    font-family: inherit;
  }

  button:hover {
    opacity: 0.9;
  }

  button:active {
    transform: scale(0.98);
  }

  input:focus {
    outline: none;
  }

  ::placeholder {
    color: #FFB347;
    opacity: 0.6;
  }

  /* Mobile optimizations */
  @media (max-width: 480px) {
    .shopping-content {
      padding: 0.5rem;
    }
    
    .item-card {
      padding: 0.6rem;
    }
    
    .nav-button {
      padding: 0.5rem 1rem;
    }
  }
`;
document.head.appendChild(globalStyles);