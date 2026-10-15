import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import './MainLayout.css';

export default function MainLayout({ children }) {
  // En pantallas chicas el menu lateral se oculta y se abre con el boton ☰
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
      <Navbar onToggleMenu={() => setMenuOpen((o) => !o)} />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
