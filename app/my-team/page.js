"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function MyTeam() {
  const [myPan, setMyPan] = useState(""); // Hardcode for now, later auto-login
  const [team, setTeam] = useState([]);

  const fetchTeam = async (pan) => {
    const q = query(collection(db, "users"), where("uplinePan", "==", pan));
    const querySnapshot = await getDocs(q);

    let results = [];
    for (let doc of querySnapshot.docs) {
      let user = { id: doc.id, ...doc.data() };
      results.push(user);

      // Recursive fetch for sub-downlines
      user.downlines = await fetchTeam(user.pan);
    }
    return results;
  };

  const handleSearch = async () => {
    const tree = await fetchTeam(myPan);
    setTeam(tree);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>My Team</h1>
      <input
        type="text"
        placeholder="Enter your PAN"
        value={myPan}
        onChange={(e) => setMyPan(e.target.value)}
        style={{ marginRight: 10 }}
      />
      <button onClick={handleSearch}>View My Downlines</button>

      <pre>{JSON.stringify(team, null, 2)}</pre>
    </div>
  );
}
