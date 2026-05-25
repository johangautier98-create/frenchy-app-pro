import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 TES CLÉS BRIDGE (à récupérer dans dashboard)
const BRIDGE_CLIENT_ID = "TON_CLIENT_ID";
const BRIDGE_CLIENT_SECRET = "TON_CLIENT_SECRET";

// 1. Créer utilisateur Bridge
app.post("/api/bridge/user", async (req, res) => {
  const response = await fetch("https://api.bridgeapi.io/v2/users", {
    method: "POST",
    headers: {
      "Bridge-Version": "2021-06-01",
      "Client-Id": BRIDGE_CLIENT_ID,
      "Client-Secret": BRIDGE_CLIENT_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_user_id: "frenchy-admin",
    }),
  });

  const data = await response.json();
  res.json(data);
});

// 2. Générer lien connexion banque
app.post("/api/bridge/connect", async (req, res) => {
  const { user_token } = req.body;

  const response = await fetch("https://api.bridgeapi.io/v2/connect/items/add", {
    method: "POST",
    headers: {
      "Bridge-Version": "2021-06-01",
      "Client-Id": BRIDGE_CLIENT_ID,
      "Client-Secret": BRIDGE_CLIENT_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_token: user_token,
      country: "fr",
    }),
  });

  const data = await response.json();
  res.json(data);
});

app.listen(3000, () => {
  console.log("🔥 Bridge backend running on http://localhost:3000");
});
