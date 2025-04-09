import { useState } from "react";

export default function App() {
  const [imamo, setImamo] = useState(["Ljubav", "Hleb", "Jaja"]);
  const [kupiti, setKupiti] = useState(["Mleko"]);
  const [newItem, setNewItem] = useState("");

  const moveItem = (item, fromSetter, toSetter) => {
    toSetter((prev) => [...prev, item]);
    fromSetter((prev) => prev.filter((i) => i !== item));
  };

  const deleteItem = (item, fromSetter) => {
    fromSetter((prev) => prev.filter((i) => i !== item));
  };

  const addItem = () => {
    if (newItem.trim() !== "") {
      setKupiti((prev) => [...prev, newItem.trim()]);
      setNewItem("");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Left Table */}
        <div>
          <h2 style={styles.header}>Imamo</h2>
          <ul style={styles.table}>
            {imamo.map((item) => (
              <li
                key={item}
                style={styles.item}
                onClick={() => moveItem(item, setImamo, setKupiti)}
              >
                <span style={styles.itemText}>{item}</span>
                <button
                  style={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item, setImamo);
                  }}
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Table */}
        <div>
          <h2 style={styles.header}>Kupiti</h2>
          <ul style={styles.table}>
            {kupiti.map((item) => (
              <li
                key={item}
                style={styles.item}
                onClick={() => moveItem(item, setKupiti, setImamo)}
              >
                <span style={styles.itemText}>{item}</span>
                <button
                  style={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item, setKupiti);
                  }}
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>

          {/* Input Field and Button */}
          <div style={styles.inputArea}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Enter item name"
              style={styles.input}
            />
            <button style={styles.addButton} onClick={addItem}>
              Add to Kupiti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(to bottom right, #e5e7eb, #f9fafb)",
    padding: "2rem",
  },
  container: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "2rem",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "1rem",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    border: "1px solid #d1d5db",
  },
  header: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: "#374151",
  },
  table: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    padding: "1rem",
    backgroundColor: "#fff",
    minWidth: "200px",
    listStyle: "none",
  },
  item: {
    padding: "0.75rem",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "0.5rem",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  itemText: {
    color: "#374151",
    fontWeight: "500",
    flexGrow: 1,
  },
  deleteButton: {
    color: "#ef4444",
    background: "none",
    border: "none",
    fontSize: "1.2rem",
    cursor: "pointer",
  },
  inputArea: {
    marginTop: "1rem",
  },
  input: {
    padding: "0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    width: "100%",
    marginBottom: "0.5rem",
    fontSize: "1rem",
  },
  addButton: {
    padding: "0.75rem",
    backgroundColor: "#3b82f6",
    color: "white",
    borderRadius: "0.5rem",
    width: "100%",
    fontWeight: "500",
    border: "none",
    cursor: "pointer",
  },
};