import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Compose } from "./pages/Compose";
import { MaterialsPage } from "./pages/MaterialsPage";
import { Reader } from "./pages/Reader";
import { Shelf } from "./pages/Shelf";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shelf />} />
        <Route path="/read/:bookId" element={<Reader />} />
        <Route path="/compose" element={<Compose />} />
        <Route path="/materials" element={<MaterialsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
