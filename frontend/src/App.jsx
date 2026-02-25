import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import ResetPassword from "./pages/ResetPassword";
import OAuthCallback from "./pages/OAuthCallback";


function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/oauth-callback/42" element={<OAuthCallback provider="42" />} />
                <Route path="/oauth-callback/github" element={<OAuthCallback provider="github" />} />
                <Route path="/oauth-callback/discord" element={<OAuthCallback provider="discord" />} />
                <Route path="*" element={<Home />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
