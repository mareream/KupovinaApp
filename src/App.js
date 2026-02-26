import { useState, useEffect, useRef } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";

// Default tags with colors
const DEFAULT_TAGS = {
  "DM": "#9333ea",
  "Maxi": "#dc2626",
  "VocPovrc": "#16a34a",
  "Apoteka": "#2563eb",
  "Lidl": "#ea580c"
};

export default function App() {
  const [imamo, setImamo] = useState({});
  const [kupiti, setKupiti] = useState({});
  const [availableTags, setAvailableTags] = useState(DEFAULT_TAGS);
  const [newItem, setNewItem] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [error, setError] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [showUndo, setShowUndo] = useState(false);
  const [animatingItems, setAnimatingItems] = useState(new Set());
  const [currentPage, setCurrentPage] = useState("shopping"); // "shopping" or "kuhinjica"
  
  // Tag selection modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingItemName, setPendingItemName] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
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

  // Listen to Firebase changes
  useEffect(() => {
    if (!currentUser) return;

    const dataRef = ref(database, "shoppingList");
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setImamo(data.imamo || {});
        setKupiti(data.kupiti || {});
      } else {
        setImamo({});
        setKupiti({});
      }
      setError(null);
    }, (error) => {
      console.error("Error reading from Firebase:", error);
      setError("Failed to load data. Please refresh the page.");
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
    
    const existsInImamo = Object.values(imamo).some(
      item => item.name.toLowerCase() === normalizedName
    );
    const existsInKupiti = Object.values(kupiti).some(
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
        const toRef = ref(database, `shoppingList/${action.fromList}/${action.itemId}`);
        await set(toRef, action.item);
        
        const fromRef = ref(database, `shoppingList/${action.toList}/${action.itemId}`);
        await remove(fromRef);
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
    setAnimatingItems(prev => new Set(prev).add(itemId));
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 400);

    const updatedFrom = { ...eval(fromList) };
    const updatedTo = { ...eval(toList) };
    
    delete updatedFrom[itemId];
    updatedTo[itemId] = item;
    
    if (fromList === "imamo") {
      setImamo(updatedFrom);
      setKupiti(updatedTo);
    } else {
      setKupiti(updatedFrom);
      setImamo(updatedTo);
    }

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
      setError("Failed to move item. Changes reverted.");
      
      if (fromList === "imamo") {
        setImamo(prev => ({ ...prev, [itemId]: item }));
        setKupiti(prev => {
          const reverted = { ...prev };
          delete reverted[itemId];
          return reverted;
        });
      } else {
        setKupiti(prev => ({ ...prev, [itemId]: item }));
        setImamo(prev => {
          const reverted = { ...prev };
          delete reverted[itemId];
          return reverted;
        });
      }
    }
  };

  const deleteItem = async (itemId, listName, itemName) => {
    if (!window.confirm(`Delete "${itemName}"?`)) return;

    const itemToDelete = listName === "imamo" ? imamo[itemId] : kupiti[itemId];

    setAnimatingItems(prev => new Set(prev).add(itemId));
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 400);

    if (listName === "imamo") {
      setImamo(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
    } else {
      setKupiti(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
    }

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
    }
  };

  // Open tag modal instead of directly adding item
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

  // Add new custom tag
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
      setNewTagColor("#6366f1");
      setShowAddTag(false);
      setError(null);
    } catch (error) {
      console.error("Error adding tag:", error);
      setError("Failed to add tag. Please try again.");
    }
  };

  // Confirm and add item with selected tag
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

      setKupiti(prev => ({
        ...prev,
        [uniqueId]: item
      }));

      const itemRef = ref(database, `shoppingList/kupiti/${uniqueId}`);
      await set(itemRef, item);
      
      setNewItem("");
      document.activeElement.blur();
      setShowTagModal(false);
      setPendingItemName("");
      setSelectedTag("");
      setError(null);

      setAnimatingItems(prev => new Set(prev).add(uniqueId));
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
      
      setKupiti(prev => {
        const reverted = { ...prev };
        delete reverted[uniqueId];
        return reverted;
      });
    }
  };

  // Group items by tag
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

  const userColors = {
    Mare: "blue",
    Caka: "deeppink",
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  const imamoGrouped = groupByTag(imamo);
  const kupitiGrouped = groupByTag(kupiti);
  const imamoCount = Object.keys(imamo).length;
  const kupitiCount = Object.keys(kupiti).length;

  const otherOnlineUsers = Object.entries(onlineUsers)
    .filter(([name, data]) => name !== username && data.online)
    .map(([name]) => name);

  return (
    <div style={styles.page}>
      {/* Fixed top banners */}
      <div style={styles.fixedBannerContainer}>
        {error && (
          <div style={styles.errorBanner}>
            <span>⚠️ {error}</span>
            <button style={styles.closeError} onClick={() => setError(null)}>✖</button>
          </div>
        )}

        {showUndo && undoStack.length > 0 && (
          <div style={styles.undoBanner}>
            <span>
              {undoStack[0].type === "move" 
                ? `Moved "${undoStack[0].itemName}"` 
                : `Deleted "${undoStack[0].itemName}"`}
            </span>
            <button style={styles.undoButton} onClick={performUndo}>
              ↶ Undo
            </button>
          </div>
        )}
      </div>

      <div style={styles.topBar}>
        <div style={styles.navContainer}>
          {/* Username and Online Status */}
          <div style={styles.userInfo}>
            <span style={{ ...styles.username, color: userColors[username] || "#6b7280" }}>
              {username}
            </span>
            {otherOnlineUsers.length > 0 && (
              <span style={styles.onlineBadge}>
                <span style={styles.onlineDot}>●</span>
                {otherOnlineUsers.join(", ")}
              </span>
            )}
          </div>

          {/* Navigation Buttons */}
          

          {/* Logout Button */}
          
        </div>
      </div>

      {/* Tag Selection Modal */}
      {showTagModal && (
        <div style={styles.modalOverlay} onClick={() => setShowTagModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Select Tag for "{pendingItemName}"</h3>
            
            <div style={styles.tagGrid}>
              {Object.entries(availableTags).map(([tagName, color]) => (
                <button
                  key={tagName}
                  style={{
                    ...styles.tagOption,
                    borderColor: color,
                    backgroundColor: selectedTag === tagName ? `${color}20` : "transparent",
                    borderWidth: selectedTag === tagName ? "3px" : "2px"
                  }}
                  onClick={() => setSelectedTag(tagName)}
                >
                  <span style={{ color: color, fontWeight: "600" }}>{tagName}</span>
                </button>
              ))}
            </div>

            {!showAddTag ? (
              <button style={styles.addNewTagButton} onClick={() => setShowAddTag(true)}>
                + Add New Tag
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
                <button style={styles.saveTagButton} onClick={addCustomTag}>
                  Save Tag
                </button>
                <button style={styles.cancelTagButton} onClick={() => {
                  setShowAddTag(false);
                  setNewTagName("");
                  setNewTagColor("#6366f1");
                }}>
                  Cancel
                </button>
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
                Cancel
              </button>
              <button 
                style={{
                  ...styles.confirmButton,
                  opacity: !selectedTag ? 0.5 : 1,
                  cursor: !selectedTag ? "not-allowed" : "pointer"
                }}
                onClick={confirmAddItem}
                disabled={!selectedTag}
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Shopping Lists */}
      {currentPage === "shopping" && (
        <div className="content">
          {/* Left Table - Kupiti */}
          <div>
            {/* Input Field and Button */}
            
            
            <h2 style={styles.header}>Kupiti ({kupitiCount})</h2>
            <div style={styles.table}>
              {Object.keys(kupitiGrouped).length === 0 ? (
                <div style={styles.emptyState}>No items to buy</div>
              ) : (
                Object.entries(kupitiGrouped).map(([tag, items]) => (
                  <div key={tag} style={styles.tagGroup}>
                    <div style={styles.tagHeader}>
                      <span className={`tag-chip ${tag.toLowerCase()}`}>
                        {tag}
                      </span>
                      <span style={styles.tagCount}>({items.length})</span>
                    </div>
                    <ul style={styles.itemList}>
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className={`shopping-card ${
                            animatingItems.has(item.id) ? "animate-in" : ""
                          }`}
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
                         <div className="item-name">{item.name}</div>
                         <div className="item-meta">
                            added by{" "}
                            <span style={{ color: userColors[item.addedBy] || "#6b7280" }}>
                              {item.addedBy}
                            </span>
                         </div>
                          <button
                            style={styles.deleteButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(item.id, "kupiti", item.name);
                            }}
                            onMouseEnter={(e) => e.target.style.color = "#dc2626"}
                            onMouseLeave={(e) => e.target.style.color = "#ef4444"}
                          >
                            ✖
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Table - Imamo */}
          <div>
            <h2 style={styles.header}>Imamo ({imamoCount})</h2>
            <div style={styles.table}>
              {Object.keys(imamoGrouped).length === 0 ? (
                <div style={styles.emptyState}>No items yet</div>
              ) : (
                Object.entries(imamoGrouped).map(([tag, items]) => (
                  <div key={tag} style={styles.tagGroup}>
                    <div style={styles.tagHeader}>
                      <span className={`tag-chip ${tag.toLowerCase()}`}>
                        {tag}
                      </span>
                      <span style={styles.tagCount}>({items.length})</span>
                    </div>
                    <ul style={styles.itemList}>
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className={`shopping-card ${
                            animatingItems.has(item.id) ? "animate-in" : ""
                          }`}
                          onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt, tag: item.tag }, "imamo", "kupiti")}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <div style={styles.itemText}>
                            <strong>{item.name}</strong>
                            <br />
                            <small>
                              added by{" "}
                              <span style={{ color: userColors[item.addedBy] || "#6b7280" }}>
                                {item.addedBy}
                              </span>
                            </small>
                          </div>
                          <button
                            style={styles.deleteButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(item.id, "imamo", item.name);
                            }}
                            onMouseEnter={(e) => e.target.style.color = "#dc2626"}
                            onMouseLeave={(e) => e.target.style.color = "#ef4444"}
                          >
                            ✖
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kuhinjica Page */}
      {currentPage === "kuhinjica" && (
        <div className="content">
          <div style={styles.kuhinjicaPage}>
            <h2 style={styles.kuhinjicaTitle}>🍳 Kuhinjica</h2>
            <p style={styles.kuhinjicaText}>Coming soon...</p>
          </div>
        </div>
      )}
      <div className="bottom-nav">
        <button
          className={`nav-btn ${currentPage === "shopping" ? "active" : ""}`}
          onClick={() => setCurrentPage("shopping")}
        >
          🛒
          <small>Lista</small>
        </button>

        <button
          className={`nav-btn ${currentPage === "kuhinjica" ? "active" : ""}`}
          onClick={() => setCurrentPage("kuhinjica")}
        >
          🍳
          <small>Kuhinja</small>
        </button>

        <button
          className="nav-btn"
          onClick={handleLogout}
        >
          ⏻
          <small>Logout</small>
        </button>
      </div>

      <div className="add-bar">
        <input
          type="text"
          value={newItem}
          placeholder="Add milk..."
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
          +
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
    background: "linear-gradient(to bottom right, #e5e7eb, #f9fafb)",
    padding: "0",
    paddingTop: "5rem",
    paddingBottom: "2rem",
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
    padding: "1rem",
    gap: "0.5rem",
    backgroundColor: "transparent",
    pointerEvents: "none",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    fontSize: "1.2rem",
    color: "#6b7280",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #e5e7eb",
    borderTop: "4px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "1rem",
  },
  topBar: {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    width: "100%",
    backgroundColor: "white",
    borderBottom: "2px solid #e5e7eb",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
    zIndex: 999,
  },
  navContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "0.75rem 1rem",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  username: {
    fontSize: "0.95rem",
    fontWeight: "700",
  },
  onlineBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#6b7280",
    backgroundColor: "#f0fdf4",
    padding: "0.25rem 0.5rem",
    borderRadius: "0.375rem",
    border: "1px solid #bbf7d0",
  },
  onlineDot: {
    color: "#22c55e",
    fontSize: "0.6rem",
  },
  navTabs: {
    display: "flex",
    gap: "0.5rem",
    backgroundColor: "#f3f4f6",
    padding: "0.25rem",
    borderRadius: "0.5rem",
  },
  navTab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    padding: "0.6rem 1rem",
    border: "none",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "600",
    transition: "all 0.2s",
    backgroundColor: "transparent",
    color: "#6b7280",
  },
  navTabActive: {
    backgroundColor: "white",
    color: "#3b82f6",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  tabIcon: {
    fontSize: "1.2rem",
  },
  tabText: {
    fontSize: "0.9rem",
  },
  logoutBtn: {
    position: "absolute",
    top: "0.75rem",
    right: "1rem",
    width: "2.5rem",
    height: "2.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1.2rem",
    fontWeight: "600",
    transition: "background-color 0.2s",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  errorBanner: {
    width: "100%",
    maxWidth: "600px",
    padding: "0.75rem 1rem",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "0.5rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#991b1b",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    pointerEvents: "auto",
  },
  undoBanner: {
    width: "100%",
    maxWidth: "600px",
    padding: "0.75rem 1rem",
    backgroundColor: "#f0f9ff",
    border: "1px solid #bae6fd",
    borderRadius: "0.5rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#075985",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    pointerEvents: "auto",
  },
  undoButton: {
    padding: "0.25rem 0.75rem",
    backgroundColor: "#0284c7",
    color: "white",
    border: "none",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  closeError: {
    background: "none",
    border: "none",
    color: "#991b1b",
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
    borderRadius: "1rem",
    padding: "2rem",
    maxWidth: "500px",
    width: "100%",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)",
  },
  modalTitle: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1.5rem",
    color: "#374151",
    textAlign: "center",
  },
  tagGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "0.75rem",
    marginBottom: "1.5rem",
  },
  tagOption: {
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "2px solid",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
    textAlign: "center",
    transition: "all 0.2s",
    backgroundColor: "transparent",
  },
  addNewTagButton: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    border: "2px dashed #d1d5db",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
    marginBottom: "1rem",
    transition: "all 0.2s",
  },
  newTagForm: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1rem",
    flexWrap: "wrap",
  },
  newTagInput: {
    flex: 1,
    minWidth: "150px",
    padding: "0.5rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.375rem",
    fontSize: "0.9rem",
  },
  colorPicker: {
    width: "60px",
    height: "38px",
    border: "1px solid #d1d5db",
    borderRadius: "0.375rem",
    cursor: "pointer",
  },
  saveTagButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
  },
  cancelTagButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.75rem",
    marginTop: "1.5rem",
  },
  cancelButton: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  confirmButton: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "500",
    transition: "all 0.2s",
  },
  container: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "2rem",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "1rem",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    border: "1px solid #d1d5db",
    width: "100%",
    maxWidth: "600px",
    margin: "0 1rem",
  },
  header: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: "#374151",
    textAlign: "center",
  },
  table: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    padding: "1rem",
    backgroundColor: "#fff",
    minWidth: "200px",
    maxWidth: "100%",
    minHeight: "100px",
  },
  tagGroup: {
    marginBottom: "1.5rem",
  },
  tagHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  tagLabel: {
    padding: "0.25rem 0.75rem",
    borderRadius: "0.375rem",
    border: "2px solid",
    fontSize: "0.875rem",
    fontWeight: "600",
  },
  tagCount: {
    fontSize: "0.875rem",
    color: "#6b7280",
    fontWeight: "500",
  },
  itemList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  emptyState: {
    padding: "1rem",
    textAlign: "center",
    color: "#9ca3af",
    fontStyle: "italic",
  },
  deleteButton: {
    color: "#ef4444",
    background: "none",
    border: "none",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "0.25rem 0.5rem",
    transition: "color 0.2s",
  },
  kuhinjicaPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem 2rem",
    textAlign: "center",
  },
  kuhinjicaTitle: {
    fontSize: "2.5rem",
    fontWeight: "bold",
    color: "#374151",
    marginBottom: "1rem",
  },
  kuhinjicaText: {
    fontSize: "1.2rem",
    color: "#6b7280",
    fontStyle: "italic",
  },
};