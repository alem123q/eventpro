import { useNavigate } from 'react-router-dom';
import './StatCard.css';

/**
 * Tarjeta de metrica. Si recibe `to`, es un boton que lleva a esa pantalla;
 * si no, es solo informativa (sin efecto de "boton" al pasar el mouse).
 */
export default function StatCard({ title, value, icon, color, hint, to }) {
  const navigate = useNavigate();
  const content = (
    <>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-info">
        <span className="stat-card-value">{value}</span>
        <span className="stat-card-title">{title}</span>
        {hint && <span className="stat-card-hint">{hint}</span>}
      </div>
    </>
  );
  const style = { '--stat-color': color || 'var(--color-primary)' };

  if (to) {
    return (
      <button
        type="button"
        className="stat-card stat-card-link"
        style={style}
        onClick={() => navigate(to)}
        title={`Ver ${title.toLowerCase()}`}
      >
        {content}
      </button>
    );
  }
  return <div className="stat-card" style={style}>{content}</div>;
}
