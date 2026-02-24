import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import ResetPassword from "./pages/ResetPassword";


function App() {
  return (
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
  );
}

export default App;
