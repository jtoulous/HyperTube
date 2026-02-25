import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { State } from './State.jsx'

import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <State>
            <App />
        </State>
    </StrictMode>
);
