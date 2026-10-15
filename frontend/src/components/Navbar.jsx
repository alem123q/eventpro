import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar({ onToggleMenu }) {
  const { user, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <button
          type="button"
          className="navbar-menu-btn"
          onClick={onToggleMenu}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <span className="navbar-logo">EventPro</span>
      </div>

      <div className="navbar-right">
        <div className="navbar-user" onClick={() => setMenuOpen(!menuOpen)}>
          <div className="navbar-avatar">
            {user?.first_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="navbar-username">
            {user?.first_name} {user?.last_name}
          </span>
          <span className="navbar-chevron">{menuOpen ? '▲' : '▼'}</span>
        </div>

        {menuOpen && (
          <div className="navbar-dropdown">
            <button onClick={() => { navigate('/profile'); setMenuOpen(false); }}>
              Mi Perfil
            </button>
            <button onClick={handleLogout}>Cerrar Sesión</button>
          </div>
        )}
      </div>
    </nav>
  );
}
