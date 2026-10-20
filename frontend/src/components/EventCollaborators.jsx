import { useEffect, useState } from 'react';
import { eventService } from '../services/eventService';
import { apiErrorMessage } from '../utils/format';
import './EventCollaborators.css';

/**
 * Seccion del detalle del evento donde el organizador suma o quita a las
 * personas que lo ayudan en la puerta (pueden hacer el check-in).
 */
export default function EventCollaborators({ eventId }) {
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    eventService.listCollaborators(eventId)
      .then(({ data }) => { if (!cancelled) setCollaborators(data); })
      .catch(() => { if (!cancelled) setMessage({ type: 'error', text: 'No se pudieron cargar los colaboradores.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await eventService.addCollaborator(eventId, email.trim());
      setCollaborators((prev) => [...prev, data]);
      setEmail('');
      setMessage({ type: 'success', text: `✓ ${data.name || data.email} ya puede hacer el check-in de este evento.` });
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudo agregar al colaborador.') });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (person) => {
    if (!window.confirm(`¿Quitar a ${person.name || person.email}? Deja de tener acceso al evento.`)) return;
    setMessage(null);
    try {
      await eventService.removeCollaborator(eventId, person.id);
      setCollaborators((prev) => prev.filter((c) => c.id !== person.id));
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudo quitar al colaborador.') });
    }
  };

  return (
    <div className="collab">
      <p className="collab-hint">
        Las personas que agregues pueden registrar el ingreso de los invitados y ver la asistencia,
        pero no modificar el evento, los invitados ni los gastos. Tienen que tener cuenta en EventPro.
      </p>

      {loading ? (
        <p className="collab-empty">Cargando...</p>
      ) : collaborators.length === 0 ? (
        <p className="collab-empty">Todavía no agregaste colaboradores.</p>
      ) : (
        <ul className="collab-list">
          {collaborators.map((person) => (
            <li key={person.id} className="collab-item">
              <div>
                <span className="collab-name">{person.name || person.email}</span>
                {person.name && <span className="collab-email">{person.email}</span>}
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => handleRemove(person)}
                title="Quitar colaborador"
                aria-label={`Quitar a ${person.name || person.email}`}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="collab-form" onSubmit={handleAdd}>
        <input
          type="email"
          className="input"
          placeholder="Email de la persona"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
          aria-label="Email del colaborador"
        />
        <button type="submit" className="btn btn-primary" disabled={saving || !email.trim()}>
          {saving ? 'Agregando...' : 'Agregar'}
        </button>
      </form>

      {message && (
        <p className={`collab-message collab-message-${message.type}`} role="status">{message.text}</p>
      )}
    </div>
  );
}
