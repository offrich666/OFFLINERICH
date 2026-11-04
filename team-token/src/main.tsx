import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ReceivePage from "./ReceivePage.tsx";
import { isReceiveRoute } from "./lib/tokenShare";

function Root() {
  const [receive, setReceive] = useState(() => isReceiveRoute());

  useEffect(() => {
    const sync = () => setReceive(isReceiveRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return receive ? <ReceivePage /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
