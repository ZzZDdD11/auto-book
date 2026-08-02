import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Compose } from "./pages/Compose";
import { MaterialDetail } from "./pages/MaterialDetail";
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
        <Route path="/material/:id" element={<MaterialDetailWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

import { useParams } from "react-router-dom";

function MaterialDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const materialId = Number(id);
  if (!Number.isFinite(materialId)) return <p style={{ padding: 40 }}>无效的素材 ID</p>;
  return <MaterialDetail materialId={materialId} />;
}
